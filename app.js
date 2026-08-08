(() => {
  'use strict';

  const DB_NAME = 'travelTrackerDB';
  const DB_VERSION = 1;
  const STORE = 'trips';
  const CATEGORY_LABELS = { travel:'Reise', hiking:'Wandern', birthday:'Geburtstag' };

  const BACKGROUNDS = {
    travel: [
      {id:'travel-sunset', name:'Sunset Journey', css:'linear-gradient(145deg,#14213d 0%,#4f5f8b 36%,#e78b6c 70%,#f2c879 100%)'},
      {id:'travel-ocean', name:'Ocean Route', css:'linear-gradient(150deg,#09203f 0%,#1b7a9e 43%,#8ac6c5 72%,#eee2b3 100%)'},
      {id:'travel-pastel', name:'Pastel Trip', css:'linear-gradient(135deg,#6c5b9f 0%,#cf5f91 47%,#dfaa58 100%)'}
    ],
    hiking: [
      {id:'hiking-forest', name:'Forest Trail', css:'linear-gradient(145deg,#173b2d 0%,#426b4f 42%,#8e9d68 72%,#d4c797 100%)'},
      {id:'hiking-mountain', name:'Mountain Air', css:'linear-gradient(145deg,#40576f 0%,#83a2b5 42%,#bac9bd 68%,#d7c08b 100%)'},
      {id:'hiking-earth', name:'Earth Walk', css:'linear-gradient(140deg,#4b3c2d 0%,#806648 43%,#a79362 67%,#687c63 100%)'}
    ],
    birthday: [
      {id:'birthday-balloons', name:'Ballon-Party', css:"url('assets/birthday-balloons.png') center/cover no-repeat"},
      {id:'birthday-neon', name:'Neon Party', css:'linear-gradient(135deg,#352058 0%,#8d3a95 40%,#e05c81 70%,#f3aa5c 100%)'},
      {id:'birthday-confetti', name:'Konfetti', css:'linear-gradient(145deg,#4f52c7 0%,#8b65d6 34%,#e76a9d 68%,#f4be67 100%)'}
    ]
  };

  const LAYOUTS = {
    zigzag: {name:'Zickzack', desc:'Klassischer Reiseweg mit abwechselnden Stationen'},
    flow: {name:'Fließend', desc:'Ruhiger Verlauf mit weichen Abständen'},
    collage: {name:'Collage', desc:'Lebendiger und etwas verspielter'}
  };

  const els = id => document.getElementById(id);
  const screens = [...document.querySelectorAll('.screen')];
  let currentTrip = null;
  let editGoalIndex = -1;
  let selectedGoalIndex = -1;
  let layoutMode = false;
  let confirmCallback = null;
  let wizard = {category:'travel', background:null, title:'', people:1, participants:[''], goalCount:6, layout:'zigzag'};

  function uuid() {
    return (crypto.randomUUID?.() || `tt-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'id'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(trip) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(trip);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE,'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function safe(value='') {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function showScreen(name) {
    screens.forEach(s => s.classList.toggle('active', s.id === `screen${name[0].toUpperCase()}${name.slice(1)}`));
    window.scrollTo({top:0, behavior:'instant'});
  }

  function toast(message) {
    const t = els('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function nowLocalInput() {
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function toIsoFromLocalInput(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function toLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function mapsSearchUrl(place) {
    return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : 'https://www.google.com/maps';
  }

  function normalizeMapsUrl(value, place) {
    const v = (value || '').trim();
    if (v) {
      try {
        const u = new URL(v);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
      } catch {}
    }
    return mapsSearchUrl(place);
  }

  function presetPositions(count, layout='zigzag') {
    const zig = [[24,23,-5],[72,29,5],[35,43,-2],[70,52,4],[25,66,-4],[63,72,3],[32,82,-3],[74,84,4],[43,91,-2],[69,92,2]];
    const flow = [[26,24,-2],[64,31,3],[39,42,-2],[69,50,2],[31,60,-3],[66,67,2],[37,76,-2],[71,82,2],[43,89,-1],[70,91,1]];
    const collage = [[26,24,-7],[69,27,7],[38,41,3],[72,49,-5],[25,60,6],[63,66,-2],[34,76,-6],[72,81,5],[44,89,3],[70,91,-3]];
    const source = layout === 'flow' ? flow : layout === 'collage' ? collage : zig;
    return source.slice(0,count).map((v,i)=>({x:v[0],y:v[1],rotation:v[2],entrySide:'auto',exitSide:'auto',index:i}));
  }

  async function saveCurrentTrip(message='Lokal gespeichert') {
    if (!currentTrip) return;
    currentTrip.updatedAt = new Date().toISOString();
    await dbPut(currentTrip);
    els('saveState').textContent = message;
    refreshHome();
  }

  async function refreshHome() {
    const trips = (await dbAll()).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
    els('libraryCount').textContent = trips.length ? `${trips.length} gespeicherte${trips.length===1?'r Tracker':' Tracker'}` : 'Noch keine gespeicherten Tracker';
    renderTripCards(els('recentTrips'), trips.slice(0,3), true);
    renderTripCards(els('tripLibrary'), trips, false);
  }

  function renderTripCards(container, trips, compact) {
    if (!trips.length) {
      container.innerHTML = `<div class="empty-card">Noch keine Tracker vorhanden.</div>`;
      return;
    }
    container.innerHTML = trips.map(t => {
      const filled = (t.goals||[]).filter(g=>g.photo).length;
      const total = (t.goals||[]).length;
      return `<article class="trip-card" data-trip-id="${safe(t.id)}">
        <button class="delete-mini" type="button" data-delete-id="${safe(t.id)}" aria-label="${safe(t.title)} löschen">×</button>
        <button class="trip-card-main" type="button" data-open-id="${safe(t.id)}">
          <div class="trip-thumb" style="background:${t.backgroundCss || '#dbe4ef'}"></div>
          <div class="trip-card-copy"><strong>${safe(t.title || 'Ohne Titel')}</strong><small>${safe(CATEGORY_LABELS[t.category]||'Tracker')} · ${filled}/${total} Ziele${t.completed?' · abgeschlossen':''}</small></div>
        </button>
      </article>`;
    }).join('');
    container.querySelectorAll('[data-open-id]').forEach(btn => btn.addEventListener('click', () => openTrip(btn.dataset.openId)));
    container.querySelectorAll('[data-delete-id]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      const trip = trips.find(t=>t.id===id);
      askConfirm(`„${trip?.title || 'Diese Reise'}“ löschen?`, 'Die Reise und alle darin lokal gespeicherten Fotos werden von diesem Gerät gelöscht.', async () => {
        await dbDelete(id);
        if (currentTrip?.id === id) currentTrip = null;
        await refreshHome();
        toast('Reise gelöscht.');
      });
    }));
  }

  function askConfirm(title, text, cb) {
    els('confirmTitle').textContent = title;
    els('confirmText').textContent = text;
    confirmCallback = cb;
    els('confirmDialog').showModal();
  }

  function resetWizard() {
    wizard = {category:'travel', background:null, title:'', people:1, participants:[''], goalCount:6, layout:'zigzag'};
    els('projectTitle').value = '';
    els('peopleCount').value = '1';
    els('goalCount').value = '6';
    renderParticipantFields();
  }

  function renderBackgrounds() {
    const items = BACKGROUNDS[wizard.category] || BACKGROUNDS.travel;
    els('backgroundGrid').innerHTML = items.map(bg => `<button class="background-card" type="button" data-bg-id="${bg.id}"><div class="background-preview" style="background:${bg.css}"></div><strong>${safe(bg.name)}</strong><small>Als Hintergrund verwenden</small></button>`).join('');
    els('backgroundGrid').querySelectorAll('[data-bg-id]').forEach(btn => btn.addEventListener('click', () => {
      wizard.background = items.find(x=>x.id===btn.dataset.bgId);
      showScreen('setup');
    }));
  }

  function renderParticipantFields() {
    wizard.participants.length = wizard.people;
    while (wizard.participants.length < wizard.people) wizard.participants.push('');
    els('participantFields').innerHTML = Array.from({length:wizard.people},(_,i)=>`<label class="field-label">Person ${i+1}<input data-person-index="${i}" maxlength="40" placeholder="Name" value="${safe(wizard.participants[i]||'')}"></label>`).join('');
    els('participantFields').querySelectorAll('[data-person-index]').forEach(inp => inp.addEventListener('input',()=>{wizard.participants[Number(inp.dataset.personIndex)] = inp.value;}));
  }

  function renderLayouts() {
    els('layoutGrid').innerHTML = Object.entries(LAYOUTS).map(([key,val]) => {
      const p = presetPositions(5,key);
      return `<button class="layout-card" data-layout="${key}" type="button"><div class="layout-preview">${p.map(pos=>`<span class="layout-dot" style="left:${pos.x}%;top:${pos.y}%;transform:translate(-50%,-50%) rotate(${pos.rotation}deg)"></span>`).join('')}</div><strong>${val.name}</strong><small>${val.desc}</small></button>`;
    }).join('');
    els('layoutGrid').querySelectorAll('[data-layout]').forEach(btn => btn.addEventListener('click', async () => {
      wizard.layout = btn.dataset.layout;
      await createTripFromWizard();
    }));
  }

  async function createTripFromWizard() {
    const pos = presetPositions(wizard.goalCount, wizard.layout);
    currentTrip = {
      id:uuid(),
      title:wizard.title || `${CATEGORY_LABELS[wizard.category]} ${new Date().toLocaleDateString('de-DE')}`,
      category:wizard.category,
      backgroundId:wizard.background?.id || BACKGROUNDS[wizard.category][0].id,
      backgroundCss:wizard.background?.css || BACKGROUNDS[wizard.category][0].css,
      participants:wizard.participants.map(x=>x.trim()).filter(Boolean),
      layout:wizard.layout,
      lineStyle:'dashed',
      completed:false,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      goals:Array.from({length:wizard.goalCount},(_,i)=>({
        id:uuid(), name:`Ziel ${i+1}`, info:'', capturedAt:null, photo:null, location:null,
        x:pos[i].x, y:pos[i].y, rotation:pos[i].rotation, entrySide:'auto', exitSide:'auto'
      }))
    };
    await dbPut(currentTrip);
    openTrackerScreen();
  }

  async function openTrip(id) {
    currentTrip = await dbGet(id);
    if (!currentTrip) return toast('Tracker nicht gefunden.');
    // Normalize older objects.
    currentTrip.goals = (currentTrip.goals || []).map((g,i)=>({id:g.id||uuid(),name:g.name||`Ziel ${i+1}`,info:g.info||'',capturedAt:g.capturedAt||null,photo:g.photo||null,location:g.location||null,x:g.x??presetPositions(currentTrip.goals.length,currentTrip.layout||'zigzag')[i]?.x??50,y:g.y??presetPositions(currentTrip.goals.length,currentTrip.layout||'zigzag')[i]?.y??50,rotation:g.rotation||0,entrySide:g.entrySide||'auto',exitSide:g.exitSide||'auto'}));
    currentTrip.lineStyle ||= 'dashed';
    openTrackerScreen();
  }

  function openTrackerScreen() {
    layoutMode = false;
    selectedGoalIndex = -1;
    els('layoutEditor').classList.add('hidden');
    els('trackerCategoryLabel').textContent = (CATEGORY_LABELS[currentTrip.category]||'Tracker').toUpperCase();
    els('trackerTitle').textContent = currentTrip.title;
    els('boardBadge').textContent = (CATEGORY_LABELS[currentTrip.category]||'Tracker').toUpperCase();
    els('boardTitle').textContent = currentTrip.title;
    els('trackerBoard').style.background = currentTrip.backgroundCss || '#d7dde6';
    els('lineStyleSelect').value = currentTrip.lineStyle || 'dashed';
    renderGoals();
    showScreen('tracker');
  }

  function renderGoals() {
    const canvas = els('goalsCanvas');
    canvas.innerHTML = currentTrip.goals.map((g,i)=>{
      const photo = g.photo ? `<img src="${g.photo}" alt="${safe(g.name)}">` : `<div class="goal-placeholder">Foto ${i+1}</div>`;
      const loc = g.location?.label ? `<span class="goal-location-badge">⌖ ${safe(g.location.label)}</span>` : '';
      return `<div class="goal-anchor ${selectedGoalIndex===i?'selected':''}" data-goal-index="${i}" style="left:${g.x}%;top:${g.y}%"><div class="goal-card-visual" style="transform:rotate(${g.rotation||0}deg)"><span class="goal-number">${i+1}</span>${photo}${loc}<div class="goal-card-meta"><strong>${safe(g.name||`Ziel ${i+1}`)}</strong><small>${g.photo?'Erinnerung gespeichert':'Antippen zum Bearbeiten'}</small></div></div></div>`;
    }).join('');
    canvas.querySelectorAll('.goal-anchor').forEach(anchor => {
      const idx = Number(anchor.dataset.goalIndex);
      if (layoutMode) bindDrag(anchor, idx);
      else anchor.addEventListener('click', () => openGoalDialog(idx));
    });
    updateProgress();
    requestAnimationFrame(drawJourneyPath);
  }

  function updateProgress() {
    const done = currentTrip.goals.filter(g=>g.photo).length;
    const total = currentTrip.goals.length;
    els('progressText').textContent = `${done} / ${total}`;
    els('progressBar').style.width = `${total ? done/total*100 : 0}%`;
    els('completeActions').classList.toggle('hidden', !currentTrip.completed);
    els('finishBtn').textContent = currentTrip.completed ? 'Abgeschlossen' : 'Tracker abschließen';
  }

  function sidePoint(goal, side, other) {
    const auto = () => {
      const dx = other.x-goal.x, dy = other.y-goal.y;
      if (Math.abs(dx)>Math.abs(dy)) return dx>0?'right':'left';
      return dy>0?'bottom':'top';
    };
    const s = side==='auto'?auto():side;
    const halfW=15.5, halfH=8;
    if(s==='left') return [goal.x-halfW,goal.y];
    if(s==='right') return [goal.x+halfW,goal.y];
    if(s==='top') return [goal.x,goal.y-halfH];
    return [goal.x,goal.y+halfH];
  }

  function drawJourneyPath() {
    const svg = els('journeyPath');
    if (!currentTrip || currentTrip.lineStyle==='none') { svg.innerHTML=''; return; }
    const goals = currentTrip.goals;
    let html='';
    for(let i=0;i<goals.length-1;i++){
      const a=goals[i], b=goals[i+1];
      const p1=sidePoint(a,a.exitSide||'auto',b), p2=sidePoint(b,b.entrySide||'auto',a);
      const x1=p1[0]*10,y1=p1[1]*14.14,x2=p2[0]*10,y2=p2[1]*14.14;
      const dx=(x2-x1)*.45;
      const d=`M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
      const dash=currentTrip.lineStyle==='dashed'?'16 14':'none';
      html += `<path d="${d}" fill="none" stroke="#152437" stroke-width="4" stroke-linecap="round" stroke-dasharray="${dash}" opacity=".92"/>`;
    }
    svg.innerHTML=html;
  }

  function bindDrag(anchor, idx) {
    let startX=0,startY=0,startGX=0,startGY=0,moved=false;
    anchor.addEventListener('pointerdown', e => {
      e.preventDefault();
      selectedGoalIndex=idx;
      renderSelectionControls();
      document.querySelectorAll('.goal-anchor').forEach(x=>x.classList.remove('selected'));
      anchor.classList.add('selected');
      const board=els('trackerBoard').getBoundingClientRect();
      startX=e.clientX;startY=e.clientY;startGX=currentTrip.goals[idx].x;startGY=currentTrip.goals[idx].y;moved=false;
      anchor.setPointerCapture(e.pointerId);
      const move=ev=>{
        moved=true;
        const nx=Math.max(16,Math.min(84,startGX+(ev.clientX-startX)/board.width*100));
        const ny=Math.max(14,Math.min(91,startGY+(ev.clientY-startY)/board.height*100));
        currentTrip.goals[idx].x=nx;currentTrip.goals[idx].y=ny;
        anchor.style.left=`${nx}%`;anchor.style.top=`${ny}%`;drawJourneyPath();
      };
      const up=async ev=>{anchor.removeEventListener('pointermove',move);anchor.removeEventListener('pointerup',up);anchor.removeEventListener('pointercancel',up);if(moved) await saveCurrentTrip();};
      anchor.addEventListener('pointermove',move);anchor.addEventListener('pointerup',up);anchor.addEventListener('pointercancel',up);
    });
  }

  function renderSelectionControls() {
    const g = currentTrip?.goals?.[selectedGoalIndex];
    els('selectedGoalLabel').textContent = g ? g.name : 'Keines';
    els('entrySideSelect').value = g?.entrySide || 'auto';
    els('exitSideSelect').value = g?.exitSide || 'auto';
  }

  function openGoalDialog(index) {
    editGoalIndex=index;
    const g=currentTrip.goals[index];
    els('dialogTitle').textContent=g.name || `Ziel ${index+1}`;
    els('goalNameInput').value=g.name || '';
    els('goalTimeInput').value=toLocalInput(g.capturedAt);
    els('goalInfoInput').value=g.info || '';
    els('placeNameInput').value=g.location?.label || '';
    els('mapsUrlInput').value=g.location?.mapsUrl || '';
    els('removePlaceBtn').classList.toggle('hidden',!g.location?.label && !g.location?.mapsUrl);
    updateMapsLink();
    els('mapPreviewWrap').classList.add('hidden');
    renderDialogPhoto(g.photo);
    els('removePhotoBtn').classList.toggle('hidden',!g.photo);
    els('goalDialog').showModal();
  }

  function renderDialogPhoto(photo) {
    els('dialogPhotoPreview').innerHTML = photo ? `<img src="${photo}" alt="Vorschau">` : '<span>Noch kein Foto</span>';
  }

  async function fileToDataURL(file) {
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
  }

  async function applyPickedPhoto(file) {
    if (!file || editGoalIndex<0) return;
    const data=await fileToDataURL(file);
    const g=currentTrip.goals[editGoalIndex];
    g.photo=data;
    if(!g.capturedAt){g.capturedAt=new Date().toISOString();els('goalTimeInput').value=nowLocalInput();}
    renderDialogPhoto(data);
    els('removePhotoBtn').classList.remove('hidden');
    await saveCurrentTrip('Foto gespeichert');
  }

  function updateMapsLink() {
    const place=els('placeNameInput').value.trim();
    els('openMapsSearchLink').href=mapsSearchUrl(place);
  }

  function showMapPreview() {
    const place=els('placeNameInput').value.trim();
    if(!place){toast('Bitte zuerst einen Ort eingeben.');els('placeNameInput').focus();return;}
    // Key-free preview. The direct Google Maps link remains the reliable fallback.
    els('mapPreviewFrame').src=`https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;
    els('mapPreviewWrap').classList.remove('hidden');
  }

  async function saveGoalFromDialog() {
    if(editGoalIndex<0)return;
    const g=currentTrip.goals[editGoalIndex];
    g.name=els('goalNameInput').value.trim() || `Ziel ${editGoalIndex+1}`;
    g.capturedAt=toIsoFromLocalInput(els('goalTimeInput').value) || g.capturedAt || null;
    g.info=els('goalInfoInput').value.trim();
    const place=els('placeNameInput').value.trim();
    const custom=els('mapsUrlInput').value.trim();
    g.location = (place || custom) ? {label:place || 'Google Maps', mapsUrl:normalizeMapsUrl(custom,place)} : null;
    await saveCurrentTrip();
    renderGoals();
    els('goalDialog').close();
  }

  function getBackgroundCssById(category,id) {
    return (BACKGROUNDS[category]||[]).find(x=>x.id===id)?.css || BACKGROUNDS[category]?.[0]?.css || '#d7dde6';
  }

  async function exportAll() {
    const trips=await dbAll();
    if(!trips.length)return toast('Es gibt noch keine Tracker zum Exportieren.');
    downloadBlob(new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),trips},null,2)],{type:'application/json'}),`travel-tracker-sicherung-${new Date().toISOString().slice(0,10)}.traveltracker`);
  }

  async function importAllFile(file) {
    try{
      const data=JSON.parse(await file.text());
      const trips=Array.isArray(data)?data:data.trips;
      if(!Array.isArray(trips))throw new Error('Ungültiges Sicherungsformat');
      for(const t of trips){ if(t && t.id) await dbPut(t); }
      await refreshHome();
      toast(`${trips.length} Tracker importiert.`);
    }catch(e){toast('Sicherung konnte nicht importiert werden.');}
  }

  function downloadBlob(blob,filename) {
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function slugify(s) {return (s||'reise').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'reise';}

  async function backgroundCssForStandalone(css) {
    const m=/url\(['"]?([^'")]+)['"]?\)/.exec(css||'');
    if(!m || /^data:/.test(m[1]) || /^https?:/.test(m[1])) return css;
    try{
      const res=await fetch(m[1]);
      const blob=await res.blob();
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
      return css.replace(m[1],data);
    }catch{return css;}
  }

  async function buildStandaloneViewer(trip) {
    const [css,js]=await Promise.all([fetch('viewer.css').then(r=>r.text()),fetch('viewer.js').then(r=>r.text())]);
    const clone=(typeof structuredClone==='function')?structuredClone(trip):JSON.parse(JSON.stringify(trip));
    clone.backgroundCss=await backgroundCssForStandalone(clone.backgroundCss||'');
    const json=JSON.stringify(clone).replace(/<\/script/gi,'<\\/script');
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#0f172a"><title>${safe(trip.title)} · Travel Tracker</title><style>${css}</style></head><body><main id="viewerApp" class="viewer-app" aria-live="polite"><section id="viewerLoading" class="viewer-message"><div><strong>Reise wird geladen …</strong></div></section></main><script id="embeddedTripData" type="application/json">${json}</script><script>${js}<\/script></body></html>`;
  }

  async function shareTrip() {
    if(!currentTrip)return;
    try{
      const html=await buildStandaloneViewer(currentTrip);
      const file=new File([html],`${slugify(currentTrip.title)}-travel-tracker.html`,{type:'text/html'});
      if(navigator.canShare?.({files:[file]}) && navigator.share){
        await navigator.share({title:currentTrip.title,text:'Travel-Tracker-Reise',files:[file]});
      }else{
        downloadBlob(file,file.name);
        toast('Präsentationsdatei heruntergeladen. Im Browser öffnen.');
      }
    }catch(e){console.error(e);toast('Ansicht konnte nicht erstellt werden.');}
  }

  function previewTrip() {
    if(!currentTrip)return;
    const url=new URL('viewer.html',location.href);url.searchParams.set('id',currentTrip.id);
    window.location.href=url.href;
  }

  function printTrip() {
    if(!currentTrip)return;
    const t=currentTrip;
    const w=window.open('','_blank');
    if(!w)return toast('Bitte Pop-ups für die PDF-Ausgabe erlauben.');
    const cards=t.goals.filter(g=>g.photo).map((g,i)=>`<article class="p-card"><img src="${g.photo}"><div><strong>${safe(g.name||`Ziel ${i+1}`)}</strong><small>${g.capturedAt?new Date(g.capturedAt).toLocaleString('de-DE'):''}</small>${g.info?`<p>${safe(g.info)}</p>`:''}</div></article>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(t.title)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0}body{font-family:system-ui;background:${t.backgroundCss};background-size:cover;background-position:center}.page{width:210mm;min-height:297mm;padding:14mm;background:linear-gradient(#0002,#0002);color:#fff}.head h1{font-size:28pt;margin:0 0 3mm}.head p{margin:0 0 7mm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.p-card{background:#fff;color:#111827;border-radius:5mm;overflow:hidden;break-inside:avoid}.p-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}.p-card div{padding:4mm}.p-card strong{font-size:14pt;display:block}.p-card small{color:#667085}.p-card p{font-size:9pt;line-height:1.35;margin:2mm 0 0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="page"><header class="head"><h1>${safe(t.title)}</h1><p>${safe((t.participants||[]).join(', '))}</p></header><section class="grid">${cards}</section></main><script>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close();
  }

  // Navigation and home actions
  els('brandHome').addEventListener('click',()=>{showScreen('home');refreshHome();});
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>showScreen(btn.dataset.nav)));
  els('newTripBtn').addEventListener('click',()=>{resetWizard();showScreen('categories');});
  els('libraryNewBtn').addEventListener('click',()=>{resetWizard();showScreen('categories');});
  els('libraryBtn').addEventListener('click',async()=>{await refreshHome();showScreen('library');});
  els('showAllBtn').addEventListener('click',async()=>{await refreshHome();showScreen('library');});
  els('exportAllBtn').addEventListener('click',exportAll);els('libraryExportBtn').addEventListener('click',exportAll);
  els('importAllBtn').addEventListener('click',()=>els('importPicker').click());els('libraryImportBtn').addEventListener('click',()=>els('importPicker').click());
  els('importPicker').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importAllFile(f);e.target.value='';});

  document.querySelectorAll('[data-category]').forEach(btn=>btn.addEventListener('click',()=>{wizard.category=btn.dataset.category;wizard.background=null;renderBackgrounds();showScreen('backgrounds');}));
  els('decreasePeople').addEventListener('click',()=>{wizard.people=Math.max(1,wizard.people-1);els('peopleCount').value=wizard.people;renderParticipantFields();});
  els('increasePeople').addEventListener('click',()=>{wizard.people=Math.min(12,wizard.people+1);els('peopleCount').value=wizard.people;renderParticipantFields();});
  els('decreaseGoals').addEventListener('click',()=>{wizard.goalCount=Math.max(1,wizard.goalCount-1);els('goalCount').value=wizard.goalCount;});
  els('increaseGoals').addEventListener('click',()=>{wizard.goalCount=Math.min(10,wizard.goalCount+1);els('goalCount').value=wizard.goalCount;});
  els('continueToLayoutBtn').addEventListener('click',()=>{
    wizard.title=els('projectTitle').value.trim();
    wizard.participants=[...els('participantFields').querySelectorAll('input')].map(i=>i.value.trim());
    if(!wizard.title){toast('Bitte gib dem Tracker einen Titel.');els('projectTitle').focus();return;}
    if(!wizard.background)wizard.background=BACKGROUNDS[wizard.category][0];
    renderLayouts();showScreen('layouts');
  });

  els('trackerHomeBtn').addEventListener('click',async()=>{await saveCurrentTrip();await refreshHome();showScreen('home');});
  els('saveBtn').addEventListener('click',async()=>{await saveCurrentTrip('Jetzt gespeichert');toast('Tracker gespeichert.');});
  els('finishBtn').addEventListener('click',async()=>{
    const missing=currentTrip.goals.filter(g=>!g.photo).length;
    if(missing){toast(`Noch ${missing} Ziel${missing===1?'':'e'} ohne Foto.`);return;}
    currentTrip.completed=true;await saveCurrentTrip('Tracker abgeschlossen');updateProgress();toast('Tracker abgeschlossen.');
  });
  els('previewTripBtn').addEventListener('click',previewTrip);
  els('shareFileBtn').addEventListener('click',shareTrip);
  els('pdfBtn').addEventListener('click',printTrip);

  els('layoutEditBtn').addEventListener('click',()=>{layoutMode=true;els('layoutEditor').classList.remove('hidden');renderGoals();});
  els('doneLayoutBtn').addEventListener('click',async()=>{layoutMode=false;selectedGoalIndex=-1;els('layoutEditor').classList.add('hidden');await saveCurrentTrip();renderGoals();});
  els('rotateLeftBtn').addEventListener('click',()=>rotateSelected(-3));els('rotateRightBtn').addEventListener('click',()=>rotateSelected(3));els('rotationResetBtn').addEventListener('click',()=>setRotation(0));
  function rotateSelected(delta){if(selectedGoalIndex<0)return toast('Bitte zuerst eine Kachel auswählen.');setRotation((currentTrip.goals[selectedGoalIndex].rotation||0)+delta);}
  function setRotation(v){if(selectedGoalIndex<0)return;currentTrip.goals[selectedGoalIndex].rotation=Math.max(-25,Math.min(25,v));renderGoals();renderSelectionControls();saveCurrentTrip();}
  els('entrySideSelect').addEventListener('change',()=>{if(selectedGoalIndex<0)return;currentTrip.goals[selectedGoalIndex].entrySide=els('entrySideSelect').value;drawJourneyPath();saveCurrentTrip();});
  els('exitSideSelect').addEventListener('change',()=>{if(selectedGoalIndex<0)return;currentTrip.goals[selectedGoalIndex].exitSide=els('exitSideSelect').value;drawJourneyPath();saveCurrentTrip();});
  els('lineStyleSelect').addEventListener('change',()=>{currentTrip.lineStyle=els('lineStyleSelect').value;drawJourneyPath();saveCurrentTrip();});
  els('resetLayoutBtn').addEventListener('click',()=>{const p=presetPositions(currentTrip.goals.length,currentTrip.layout||'zigzag');currentTrip.goals.forEach((g,i)=>Object.assign(g,{x:p[i].x,y:p[i].y,rotation:p[i].rotation,entrySide:'auto',exitSide:'auto'}));renderGoals();saveCurrentTrip();});

  // Goal dialog
  els('takePhotoBtn').addEventListener('click',()=>els('cameraPicker').click());
  els('choosePhotoBtn').addEventListener('click',()=>els('photoPicker').click());
  els('cameraPicker').addEventListener('change',async e=>{await applyPickedPhoto(e.target.files?.[0]);e.target.value='';});
  els('photoPicker').addEventListener('change',async e=>{await applyPickedPhoto(e.target.files?.[0]);e.target.value='';});
  els('removePhotoBtn').addEventListener('click',async()=>{if(editGoalIndex<0)return;currentTrip.goals[editGoalIndex].photo=null;renderDialogPhoto(null);els('removePhotoBtn').classList.add('hidden');await saveCurrentTrip();});
  els('placeNameInput').addEventListener('input',updateMapsLink);
  els('showMapPreviewBtn').addEventListener('click',showMapPreview);
  els('removePlaceBtn').addEventListener('click',()=>{els('placeNameInput').value='';els('mapsUrlInput').value='';els('mapPreviewWrap').classList.add('hidden');els('mapPreviewFrame').src='about:blank';els('removePlaceBtn').classList.add('hidden');updateMapsLink();});
  els('goalForm').addEventListener('submit',e=>{if(e.submitter?.value==='cancel')return; e.preventDefault(); saveGoalFromDialog();});

  els('confirmActionBtn').addEventListener('click',async e=>{e.preventDefault();const cb=confirmCallback;confirmCallback=null;els('confirmDialog').close();if(cb)await cb();});

  window.addEventListener('resize',()=>{if(currentTrip && els('screenTracker').classList.contains('active'))drawJourneyPath();});

  resetWizard();
  refreshHome();
})();
