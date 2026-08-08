const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const screens = {
  home: $('#screenHome'), library: $('#screenLibrary'), categories: $('#screenCategories'),
  backgrounds: $('#screenBackgrounds'), setup: $('#screenSetup'), tracker: $('#screenTracker')
};

const categoryMeta = {
  travel: { label: 'REISE', name: 'Reise', icon: '✈' },
  hiking: { label: 'WANDERN', name: 'Wanderung', icon: '▲' },
  birthday: { label: 'GEBURTSTAG', name: 'Geburtstag', icon: '★' }
};

const backgrounds = {
  travel: [
    {id:'travel-coast',name:'Küste',css:'linear-gradient(145deg,#527d99 0%,#92c3d4 38%,#d8b777 39%,#36584a 100%)'},
    {id:'travel-city',name:'City',css:'linear-gradient(140deg,#162033,#4c6681 43%,#d3a66d 44%,#684f4d 100%)'},
    {id:'travel-sunset',name:'Sonnenuntergang',css:'linear-gradient(145deg,#43386f,#dd7f77 46%,#f1c684 65%,#426b77)'}
  ],
  hiking: [
    {id:'hiking-forest',name:'Wald',css:'linear-gradient(145deg,#183b2b,#52744c 48%,#b0a66b 49%,#314b35)'},
    {id:'hiking-mountain',name:'Berge',css:'linear-gradient(160deg,#72879a,#d6e0e4 43%,#6b7d66 44%,#334a37)'},
    {id:'hiking-autumn',name:'Herbst',css:'linear-gradient(145deg,#5b3526,#a86638 45%,#c6a45b 46%,#43523b)'}
  ],
  birthday: [
    {id:'birthday-balloons',name:'Ballon-Party',css:"url('assets/birthday-prototype.png') center/cover"},
    {id:'birthday-confetti',name:'Konfetti',css:'linear-gradient(135deg,#7543a3,#e878aa 42%,#f5ce6a 43%,#53a9aa)'},
    {id:'birthday-night',name:'Party-Nacht',css:'linear-gradient(135deg,#17152f,#463a83 42%,#b34970 70%,#e7a451)'}
  ]
};

let draft = { category:null, background:null, goalCount:6, title:'' };
let activeTrip = null;
let editingGoal = null;
let pendingPhoto = null;
let confirmCallback = null;

// ---------- IndexedDB ----------
const DB_NAME = 'travel-tracker-db';
const STORE = 'trips';
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE,{keyPath:'id'}); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function dbPut(trip){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(trip);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function dbGet(id){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function dbAll(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>b.updatedAt-a.updatedAt));r.onerror=()=>rej(r.error);});}
async function dbDelete(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function dbClear(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}

function showScreen(name){Object.values(screens).forEach(s=>s.classList.remove('active'));screens[name].classList.add('active');$('#topHomeBtn').classList.toggle('hidden',name==='home');window.scrollTo({top:0,behavior:'smooth'});if(name==='home') refreshHome();if(name==='library') renderLibrary();}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),2600);}
function formatDate(ts){return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(ts));}
function bgCss(trip){return backgrounds[trip.category]?.find(b=>b.id===trip.background)?.css || '#64748b';}
function safeText(s=''){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

async function refreshHome(){
  const trips=await dbAll();
  $('#libraryCount').textContent=trips.length ? `${trips.length} ${trips.length===1?'Tracker gespeichert':'Tracker gespeichert'}` : 'Noch keine gespeicherten Tracker';
  const box=$('#recentTrips');box.innerHTML='';
  if(!trips.length){box.innerHTML='<div class="empty-card">Noch keine Tracker vorhanden. Erstelle deinen ersten Tracker.</div>';return;}
  trips.slice(0,3).forEach(t=>box.appendChild(makeTripCard(t,false)));
}
function makeTripCard(t,full=true){
  const wrap=document.createElement('article');wrap.className='trip-card';
  const done=t.goals.filter(g=>g.photo).length;
  wrap.innerHTML=`<div class="trip-cover" style="background:${bgCss(t)}"><span>${categoryMeta[t.category]?.label||'TRACKER'}</span></div><div class="trip-body"><h3>${safeText(t.title)}</h3><div class="trip-meta">${done}/${t.goals.length} Ziele · ${t.completed?'Abgeschlossen':'In Bearbeitung'} · ${formatDate(t.updatedAt)}</div><div class="trip-actions"><button class="primary-btn open-trip" type="button">Öffnen</button>${full?'<button class="ghost-btn delete-trip" type="button">Löschen</button>':''}</div></div>`;
  wrap.querySelector('.open-trip').onclick=()=>openTrip(t.id);
  if(full)wrap.querySelector('.delete-trip').onclick=()=>askDelete(t);
  return wrap;
}
async function renderLibrary(){const trips=await dbAll();const box=$('#tripLibrary');box.innerHTML='';if(!trips.length){box.innerHTML='<div class="empty-card">Deine Bibliothek ist noch leer.</div>';return;}trips.forEach(t=>box.appendChild(makeTripCard(t,true)));}

function resetDraft(){draft={category:null,background:null,goalCount:6,title:''};$('#goalCount').value=6;$('#goalCount').textContent='6';$('#projectTitle').value='';}
function chooseCategory(cat){draft.category=cat;renderBackgrounds();showScreen('backgrounds');}
function renderBackgrounds(){const grid=$('#backgroundGrid');grid.innerHTML='';backgrounds[draft.category].forEach(bg=>{const b=document.createElement('button');b.type='button';b.className='background-option';b.style.background=bg.css;b.innerHTML=`<span>${bg.name}</span>`;b.onclick=()=>{draft.background=bg.id;showScreen('setup');};grid.appendChild(b);});}

async function createTrip(){
  const title=$('#projectTitle').value.trim() || `Meine ${categoryMeta[draft.category].name}`;
  const now=Date.now();
  activeTrip={id:crypto.randomUUID(),title,category:draft.category,background:draft.background,createdAt:now,updatedAt:now,completed:false,goals:Array.from({length:draft.goalCount},(_,i)=>({id:crypto.randomUUID(),name:`Ziel ${i+1}`,photo:null}))};
  await dbPut(activeTrip);renderTracker();showScreen('tracker');toast('Tracker lokal gespeichert.');
}
async function openTrip(id){activeTrip=await dbGet(id);if(!activeTrip)return;renderTracker();showScreen('tracker');}
function renderTracker(){
  if(!activeTrip)return;
  const meta=categoryMeta[activeTrip.category];$('#trackerCategoryLabel').textContent=meta.label;$('#trackerTitle').textContent=activeTrip.title;$('#boardBadge').textContent=meta.label;$('#boardTitle').textContent=activeTrip.title;$('#trackerBoard').style.background=bgCss(activeTrip);
  const grid=$('#goalsGrid');grid.innerHTML='';
  activeTrip.goals.forEach((g,i)=>{const c=document.createElement('button');c.type='button';c.className='goal-card'+(g.photo?' done':'');c.innerHTML=`<div class="goal-photo">${g.photo?'':`<span><span class="plus">＋</span>Foto hinzufügen</span>`}</div><div class="goal-label"><strong>${safeText(g.name||`Ziel ${i+1}`)}</strong><small>${g.photo?'Erinnerung gespeichert':'Noch offen'}</small></div>`;if(g.photo)c.querySelector('.goal-photo').style.backgroundImage=`url(${g.photo})`;c.onclick=()=>editGoal(i);grid.appendChild(c);});
  updateProgress();$('#completeActions').classList.toggle('hidden',!activeTrip.completed);$('#finishBtn').textContent=activeTrip.completed?'Tracker wieder öffnen':'Tracker abschließen';$('#saveState').textContent=`Lokal gespeichert · ${formatDate(activeTrip.updatedAt)}`;
}
function updateProgress(){const done=activeTrip.goals.filter(g=>g.photo).length,total=activeTrip.goals.length;$('#progressText').textContent=`${done} / ${total}`;$('#progressBar').style.width=`${(done/total)*100}%`;}
async function saveTrip(showToast=true){if(!activeTrip)return;activeTrip.updatedAt=Date.now();await dbPut(activeTrip);$('#saveState').textContent=`Lokal gespeichert · ${formatDate(activeTrip.updatedAt)}`;if(showToast)toast('Änderungen gespeichert.');}

function editGoal(index){editingGoal=index;const g=activeTrip.goals[index];pendingPhoto=g.photo;$('#dialogTitle').textContent=`Ziel ${index+1}`;$('#goalNameInput').value=g.name||'';renderDialogPhoto();$('#goalDialog').showModal();}
function renderDialogPhoto(){const p=$('#dialogPhotoPreview');p.style.backgroundImage=pendingPhoto?`url(${pendingPhoto})`:'';p.innerHTML=pendingPhoto?'':'<span>Noch kein Foto</span>';$('#removePhotoBtn').disabled=!pendingPhoto;}
function readFileAsDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file);});}

async function finishToggle(){
  if(activeTrip.completed){activeTrip.completed=false;await saveTrip(false);renderTracker();toast('Tracker wieder zur Bearbeitung geöffnet.');return;}
  const missing=activeTrip.goals.filter(g=>!g.photo).length;
  if(missing){toast(`Noch ${missing} ${missing===1?'Ziel ist':'Ziele sind'} ohne Foto.`);return;}
  activeTrip.completed=true;await saveTrip(false);renderTracker();toast('Tracker abgeschlossen. PDF und Teilen sind freigeschaltet.');
}

function printPDF(){if(!activeTrip?.completed){toast('Schließe den Tracker zuerst ab.');return;}window.print();}

function createShareHTML(t){
 const cards=t.goals.map((g,i)=>`<article class="card"><img src="${g.photo}" alt="${safeText(g.name)}"><div><b>${i+1}. ${safeText(g.name)}</b></div></article>`).join('');
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeText(t.title)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#eef2f6;color:#172033}.wrap{max-width:920px;margin:auto;padding:24px}.hero{padding:56px 28px;border-radius:26px;color:white;background:${bgCss(t)};background-size:cover;background-position:center;box-shadow:0 15px 45px #0002}.hero span{font-size:12px;font-weight:900;letter-spacing:.15em}.hero h1{font-size:clamp(38px,8vw,72px);line-height:.95;margin:12px 0}.hero p{margin:0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:22px}.card{background:white;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px #0001}.card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}.card div{padding:15px}.foot{text-align:center;color:#667085;padding:28px 0;font-size:12px}@media(max-width:600px){.grid{grid-template-columns:1fr}.wrap{padding:12px}}</style></head><body><main class="wrap"><section class="hero"><span>${categoryMeta[t.category].label}</span><h1>${safeText(t.title)}</h1><p>${t.goals.length} Erinnerungen · erstellt mit Travel Tracker</p></section><section class="grid">${cards}</section><div class="foot">Travel Tracker · Geteilte Ansicht</div></main></body></html>`;
}
async function shareTrip(){
  if(!activeTrip?.completed){toast('Schließe den Tracker zuerst ab.');return;}
  const html=createShareHTML(activeTrip), blob=new Blob([html],{type:'text/html'}), file=new File([blob],`${slug(activeTrip.title)}-travel-tracker.html`,{type:'text/html'});
  if(navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
    try{await navigator.share({title:activeTrip.title,text:'Mein Travel Tracker',files:[file]});return;}catch(e){if(e.name==='AbortError')return;}
  }
  downloadBlob(blob,file.name);toast('Teilbare HTML-Ansicht heruntergeladen.');
}

async function exportAll(){
 const trips=await dbAll();if(!trips.length){toast('Es gibt noch keine Tracker zum Exportieren.');return;}
 const payload={app:'Travel Tracker',formatVersion:1,exportedAt:new Date().toISOString(),trips};
 downloadBlob(new Blob([JSON.stringify(payload)],{type:'application/json'}),`travel-tracker-backup-${new Date().toISOString().slice(0,10)}.traveltracker`);toast(`${trips.length} Tracker exportiert.`);
}
async function importBackup(file){
 try{const text=await file.text();const data=JSON.parse(text);if(data.app!=='Travel Tracker'||!Array.isArray(data.trips))throw new Error('Ungültiges Format');let count=0;for(const trip of data.trips){if(!trip.id||!Array.isArray(trip.goals))continue;trip.updatedAt=Date.now();await dbPut(trip);count++;}await refreshHome();if(screens.library.classList.contains('active'))await renderLibrary();toast(`${count} Tracker importiert.`);}catch(e){toast('Diese Datei ist keine gültige Travel-Tracker-Sicherung.');}
}
function slug(s){return (s||'tracker').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

function askDelete(t){$('#confirmTitle').textContent=`„${t.title}“ löschen?`;$('#confirmText').textContent='Der Tracker und seine lokal gespeicherten Fotos werden von diesem Gerät entfernt.';confirmCallback=async()=>{await dbDelete(t.id);await renderLibrary();await refreshHome();toast('Tracker gelöscht.');};$('#confirmDialog').showModal();}

// ---------- Events ----------
$('#newTripBtn').onclick=()=>{resetDraft();showScreen('categories')};$('#libraryBtn').onclick=()=>showScreen('library');$('#showAllBtn').onclick=()=>showScreen('library');
$('#exportAllBtn').onclick=exportAll;$('#libraryExportBtn').onclick=exportAll;
function chooseImport(){ $('#importPicker').value=''; $('#importPicker').click(); }
$('#importAllBtn').onclick=chooseImport;$('#libraryImportBtn').onclick=chooseImport;$('#libraryNewBtn').onclick=()=>{resetDraft();showScreen('categories')};
$('#importPicker').onchange=e=>{const f=e.target.files?.[0];if(f)importBackup(f)};
$('#brandHome').onclick=()=>showScreen('home');$('#topHomeBtn').onclick=()=>showScreen('home');$('#trackerHomeBtn').onclick=()=>showScreen('home');
$$('[data-nav]').forEach(b=>b.onclick=()=>showScreen(b.dataset.nav));$$('[data-category]').forEach(b=>b.onclick=()=>chooseCategory(b.dataset.category));
$('#decreaseGoals').onclick=()=>{draft.goalCount=Math.max(1,draft.goalCount-1);$('#goalCount').textContent=draft.goalCount};$('#increaseGoals').onclick=()=>{draft.goalCount=Math.min(10,draft.goalCount+1);$('#goalCount').textContent=draft.goalCount};
$('#createTrackerBtn').onclick=createTrip;$('#saveBtn').onclick=()=>saveTrip(true);$('#finishBtn').onclick=finishToggle;$('#pdfBtn').onclick=printPDF;$('#shareFileBtn').onclick=shareTrip;
$('#choosePhotoBtn').onclick=()=>{$('#photoPicker').value='';$('#photoPicker').click()};$('#removePhotoBtn').onclick=()=>{pendingPhoto=null;renderDialogPhoto()};
$('#photoPicker').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;pendingPhoto=await readFileAsDataURL(f);renderDialogPhoto();};
$('#goalForm').addEventListener('submit',async e=>{if(e.submitter?.value==='cancel')return;if(editingGoal===null)return;const g=activeTrip.goals[editingGoal];g.name=$('#goalNameInput').value.trim()||`Ziel ${editingGoal+1}`;g.photo=pendingPhoto;activeTrip.completed=false;await saveTrip(false);renderTracker();toast('Ziel gespeichert.');});
$('#confirmActionBtn').onclick=()=>{if(confirmCallback)confirmCallback();confirmCallback=null;};

refreshHome();
