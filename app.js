(() => {
  'use strict';

  const Core = window.TravelTrackerCore;
  if (!Core) throw new Error('TravelTrackerCore wurde nicht geladen.');
  const { db, createId, escapeHtml, readAsDataURL, formatDateTime, mapsCoordinatesUrl, slugify, downloadBlob } = Core;
  const $ = id => document.getElementById(id);
  const screens = [...document.querySelectorAll('.screen')];

  const CATEGORY_LABELS = Object.freeze({ travel:'Reise', hiking:'Wandern', birthday:'Geburtstag' });
  const BACKGROUNDS = Object.freeze({
    travel:[
      {id:'travel-sunset',name:'Sunset Journey',css:'linear-gradient(145deg,#14213d 0%,#4f5f8b 36%,#e78b6c 70%,#f2c879 100%)'},
      {id:'travel-ocean',name:'Ocean Route',css:'linear-gradient(150deg,#09203f 0%,#1b7a9e 43%,#8ac6c5 72%,#eee2b3 100%)'},
      {id:'travel-pastel',name:'Pastel Trip',css:'linear-gradient(135deg,#6c5b9f 0%,#cf5f91 47%,#dfaa58 100%)'}
    ],
    hiking:[
      {id:'hiking-forest',name:'Forest Trail',css:'linear-gradient(145deg,#173b2d 0%,#426b4f 42%,#8e9d68 72%,#d4c797 100%)'},
      {id:'hiking-mountain',name:'Mountain Air',css:'linear-gradient(145deg,#40576f 0%,#83a2b5 42%,#bac9bd 68%,#d7c08b 100%)'},
      {id:'hiking-earth',name:'Earth Walk',css:'linear-gradient(140deg,#4b3c2d 0%,#806648 43%,#a79362 67%,#687c63 100%)'}
    ],
    birthday:[
      {id:'birthday-balloons',name:'Ballon-Party',css:"url('assets/birthday-balloons.png') center/cover no-repeat"},
      {id:'birthday-neon',name:'Neon Party',css:'linear-gradient(135deg,#352058 0%,#8d3a95 40%,#e05c81 70%,#f3aa5c 100%)'},
      {id:'birthday-confetti',name:'Konfetti',css:'linear-gradient(145deg,#4f52c7 0%,#8b65d6 34%,#e76a9d 68%,#f4be67 100%)'}
    ]
  });
  const FONT_STACKS = Object.freeze({
    system:'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    serif:'Georgia,"Times New Roman",serif',
    rounded:'"Trebuchet MS","Arial Rounded MT Bold",Arial,sans-serif',
    hand:'"Segoe Print","Bradley Hand","Comic Sans MS",cursive',
    mono:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
  });

  const state = {
    currentTrip:null,
    editMode:false,
    selectedGoalId:null,
    selectedDecorationId:null,
    editGoalIndex:-1,
    goalDraft:null,
    goalDraftLocation:null,
    confirmAction:null,
    wizard:createInitialWizard(),
    pointerSession:null,
    dragFinishedAt:0,
    viewerAssetsPromise:null,
    mapDraftLocation:null,
    mapInstance:null,
    mapMarker:null,
    geocodeController:null,
    lastGeocodeAt:0
  };

  function createInitialWizard(){return{category:'travel',background:null,title:'',people:1,participants:['']};}
  function categoryLabel(category){return CATEGORY_LABELS[category]||'Tracker';}
  function backgroundFor(category,id){const list=BACKGROUNDS[category]||BACKGROUNDS.travel;return list.find(item=>item.id===id)||list[0];}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function boardBackground(trip){return trip?.customBackground?`url("${trip.customBackground}") center/cover no-repeat`:(trip?.backgroundCss||backgroundFor(trip?.category,'').css);}

  function defaultPosition(index,count){
    if(count===1)return{x:50,y:52,width:34,rotation:0};
    const columns=count<=3?1:2;
    const rows=Math.ceil(count/columns);
    const row=Math.floor(index/columns);
    const col=index%columns;
    const x=columns===1?50:(col===0?31:69);
    const top=rows<=2?34:26;
    const bottom=rows<=2?68:78;
    const y=rows===1?52:top+(bottom-top)*(row/(rows-1));
    return{x,y,width:columns===1?36:28,rotation:index%2===0?-2:2};
  }
  function defaultPositions(count){return Array.from({length:count},(_,index)=>defaultPosition(index,count));}
  function newGoal(index,position=defaultPosition(index,index+1)){
    return{id:createId(),name:`Ziel ${index+1}`,info:'',capturedAt:null,photo:null,location:null,x:position.x,y:position.y,width:position.width,rotation:position.rotation,titleColor:'#111827',infoColor:'#344054',fontKey:'system'};
  }
  function normalizeLocation(location){
    if(!location||typeof location!=='object')return null;
    const latitude=Number(location.latitude??location.lat),longitude=Number(location.longitude??location.lng);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
    return{label:String(location.label||'Ausgewählter Ort').trim()||'Ausgewählter Ort',latitude,longitude};
  }
  function normalizeTrip(rawTrip){
    if(!rawTrip||typeof rawTrip!=='object')return null;
    const category=CATEGORY_LABELS[rawTrip.category]?rawTrip.category:'travel';
    const fallback=backgroundFor(category,rawTrip.backgroundId);
    const rawGoals=Array.isArray(rawTrip.goals)?rawTrip.goals.slice(0,10):[];
    const count=Math.max(1,rawGoals.length||1);
    const positions=defaultPositions(count);
    const goals=Array.from({length:count},(_,index)=>{
      const raw=rawGoals[index]||{},preset=positions[index];
      return{
        id:raw.id||createId(),
        name:String(raw.name||`Ziel ${index+1}`).trim()||`Ziel ${index+1}`,
        info:String(raw.info||''),
        capturedAt:raw.capturedAt||null,
        photo:typeof raw.photo==='string'&&/^data:image\//i.test(raw.photo)?raw.photo:null,
        location:normalizeLocation(raw.location),
        x:clamp(Number.isFinite(Number(raw.x))?Number(raw.x):preset.x,5,95),
        y:clamp(Number.isFinite(Number(raw.y))?Number(raw.y):preset.y,7,93),
        width:clamp(Number.isFinite(Number(raw.width))?Number(raw.width):preset.width,14,58),
        rotation:clamp(Number.isFinite(Number(raw.rotation))?Number(raw.rotation):preset.rotation,-45,45),
        titleColor:/^#[0-9a-f]{6}$/i.test(raw.titleColor||'')?raw.titleColor:'#111827',
        infoColor:/^#[0-9a-f]{6}$/i.test(raw.infoColor||'')?raw.infoColor:'#344054',
        fontKey:FONT_STACKS[raw.fontKey]?raw.fontKey:'system'
      };
    });
    const decorations=(Array.isArray(rawTrip.decorations)?rawTrip.decorations:[]).slice(0,40).map((raw,index)=>({
      id:raw.id||createId(),emoji:String(raw.emoji||'⭐').slice(0,8),x:clamp(Number(raw.x)||50,3,97),y:clamp(Number(raw.y)||50,4,96),size:clamp(Number(raw.size)||42,20,92),rotation:clamp(Number(raw.rotation)||0,-180,180)
    }));
    const customBackground=typeof rawTrip.customBackground==='string'&&/^data:image\//i.test(rawTrip.customBackground)?rawTrip.customBackground:null;
    const cardShape=['rounded','square','circle','polaroid'].includes(rawTrip.cardShape)?rawTrip.cardShape:'rounded';
    const lineStyle=['dashed','solid','none'].includes(rawTrip.lineStyle)?rawTrip.lineStyle:'dashed';
    return{
      id:rawTrip.id||createId(),schemaVersion:6,title:String(rawTrip.title||`${categoryLabel(category)} ${new Date().toLocaleDateString('de-DE')}`).trim(),category,
      backgroundId:fallback.id,backgroundCss:fallback.css,customBackground,
      participants:Array.isArray(rawTrip.participants)?rawTrip.participants.map(v=>String(v||'').trim()).filter(Boolean).slice(0,12):[],
      lineStyle,cardShape,photoOnly:Boolean(rawTrip.photoOnly),decorations,
      completed:Boolean(rawTrip.completed)&&goals.length>0&&goals.every(goal=>Boolean(goal.photo)),
      createdAt:rawTrip.createdAt||new Date().toISOString(),updatedAt:rawTrip.updatedAt||rawTrip.createdAt||new Date().toISOString(),goals
    };
  }

  function showScreen(name){
    const id=`screen${name[0].toUpperCase()}${name.slice(1)}`;
    screens.forEach(screen=>screen.classList.toggle('active',screen.id===id));
    const tracker=name==='tracker';
    document.body.classList.toggle('tracker-active',tracker);
    $('headerHomeBtn').classList.toggle('hidden',name==='home');
    closePanels();
    if(!tracker)window.scrollTo({top:0,behavior:'auto'});
  }
  function toast(message){const element=$('toast');element.textContent=message;element.classList.add('show');clearTimeout(element._timer);element._timer=setTimeout(()=>element.classList.remove('show'),2400);}
  async function saveCurrentTrip(message='Lokal gespeichert'){
    if(!state.currentTrip)return false;
    state.currentTrip.updatedAt=new Date().toISOString();
    try{await db.putTrip(state.currentTrip);updateTrackerStatus(message);return true;}catch(error){console.error(error);updateTrackerStatus('Speichern fehlgeschlagen');toast('Tracker konnte nicht gespeichert werden.');return false;}
  }
  function updateTrackerStatus(message='Lokal gespeichert'){
    if(!state.currentTrip)return;
    const filled=state.currentTrip.goals.filter(goal=>goal.photo).length;
    $('saveState').textContent=`${filled}/${state.currentTrip.goals.length} Erinnerungen · ${message}`;
    $('completeActions').classList.toggle('hidden',!state.currentTrip.completed);
    $('finishBtn').textContent=state.currentTrip.completed?'Tracker erneut abschließen':'Tracker abschließen';
  }

  async function refreshHome(){
    try{
      const trips=(await db.getAllTrips()).map(normalizeTrip).filter(Boolean).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
      $('libraryCount').textContent=trips.length?`${trips.length} gespeicherte${trips.length===1?'r Tracker':' Tracker'}`:'Noch keine gespeicherten Tracker';
      renderTripCards($('recentTrips'),trips.slice(0,3));renderTripCards($('tripLibrary'),trips);
    }catch(error){console.error(error);toast('Gespeicherte Tracker konnten nicht geladen werden.');}
  }
  function renderTripCards(container,trips){
    if(!trips.length){container.innerHTML='<div class="empty-card">Noch keine Tracker vorhanden.</div>';return;}
    container.innerHTML=trips.map(trip=>{
      const filled=trip.goals.filter(goal=>goal.photo).length;const bg=trip.customBackground?`url(&quot;${trip.customBackground}&quot;) center/cover no-repeat`:trip.backgroundCss;
      return`<article class="trip-card"><button class="delete-mini" type="button" data-action="delete-trip" data-trip-id="${escapeHtml(trip.id)}" aria-label="${escapeHtml(trip.title)} löschen">×</button><button class="trip-card-main" type="button" data-action="open-trip" data-trip-id="${escapeHtml(trip.id)}"><div class="trip-thumb" style="background:${bg}"></div><div class="trip-card-copy"><strong>${escapeHtml(trip.title||'Ohne Titel')}</strong><small>${escapeHtml(categoryLabel(trip.category))} · ${filled}/${trip.goals.length} Ziele${trip.completed?' · abgeschlossen':''}</small></div></button></article>`;
    }).join('');
  }
  async function handleTripGridClick(event){
    const button=event.target.closest('[data-action][data-trip-id]');if(!button)return;
    if(button.dataset.action==='open-trip'){await openTrip(button.dataset.tripId);return;}
    if(button.dataset.action==='delete-trip'){
      const trip=await db.getTrip(button.dataset.tripId);
      askConfirm(`„${trip?.title||'Diese Reise'}“ löschen?`,'Die Reise und alle darin lokal gespeicherten Fotos werden von diesem Gerät gelöscht.',async()=>{await db.deleteTrip(button.dataset.tripId);if(state.currentTrip?.id===button.dataset.tripId)state.currentTrip=null;await refreshHome();toast('Reise gelöscht.');});
    }
  }
  function askConfirm(title,text,callback){$('confirmTitle').textContent=title;$('confirmText').textContent=text;state.confirmAction=callback;$('confirmDialog').showModal();}

  function resetWizard(){state.wizard=createInitialWizard();$('projectTitle').value='';$('peopleCount').value='1';renderParticipantFields();}
  function renderBackgrounds(){const items=BACKGROUNDS[state.wizard.category]||BACKGROUNDS.travel;$('backgroundGrid').innerHTML=items.map(bg=>`<button class="background-card" type="button" data-bg-id="${bg.id}"><div class="background-preview" style="background:${bg.css}"></div><strong>${escapeHtml(bg.name)}</strong><small>Als Hintergrund verwenden</small></button>`).join('');}
  function renderParticipantFields(){const wizard=state.wizard;wizard.participants=Array.from({length:wizard.people},(_,i)=>wizard.participants[i]||'');$('participantFields').innerHTML=wizard.participants.map((name,index)=>`<label class="field-label">Person ${index+1}<input data-person-index="${index}" maxlength="40" placeholder="Name" value="${escapeHtml(name)}"></label>`).join('');}
  function adjustPeople(delta){state.wizard.people=clamp(state.wizard.people+delta,1,12);$('peopleCount').value=String(state.wizard.people);renderParticipantFields();}
  async function createTripFromWizard(){
    const wizard=state.wizard;wizard.title=$('projectTitle').value.trim();wizard.participants=[...$('participantFields').querySelectorAll('input')].map(i=>i.value.trim());
    if(!wizard.title){toast('Bitte gib dem Tracker einen Titel.');$('projectTitle').focus();return;}
    const bg=wizard.background||backgroundFor(wizard.category);const count=4;const positions=defaultPositions(count);const now=new Date().toISOString();
    state.currentTrip={id:createId(),schemaVersion:6,title:wizard.title,category:wizard.category,backgroundId:bg.id,backgroundCss:bg.css,customBackground:null,participants:wizard.participants.filter(Boolean),lineStyle:'dashed',cardShape:'rounded',photoOnly:false,decorations:[],completed:false,createdAt:now,updatedAt:now,goals:Array.from({length:count},(_,i)=>newGoal(i,positions[i]))};
    await db.putTrip(state.currentTrip);openTrackerScreen();
  }

  async function openTrip(id){try{const raw=await db.getTrip(id);if(!raw){toast('Tracker nicht gefunden.');return;}state.currentTrip=normalizeTrip(raw);await db.putTrip(state.currentTrip);openTrackerScreen();}catch(error){console.error(error);toast('Tracker konnte nicht geöffnet werden.');}}
  function openTrackerScreen(){
    if(!state.currentTrip)return;state.editMode=false;state.selectedGoalId=null;state.selectedDecorationId=null;
    $('trackerCategoryLabel').textContent=categoryLabel(state.currentTrip.category).toUpperCase();$('trackerTitle').textContent=state.currentTrip.title;$('boardBadge').textContent=categoryLabel(state.currentTrip.category).toUpperCase();$('boardTitle').textContent=state.currentTrip.title;
    $('lineStyleSelect').value=state.currentTrip.lineStyle;$('cardShapeSelect').value=state.currentTrip.cardShape;$('photoOnlyToggle').checked=state.currentTrip.photoOnly;$('removeCustomBackgroundBtn').classList.toggle('hidden',!state.currentTrip.customBackground);
    $('trackerBoard').style.background=boardBackground(state.currentTrip);$('trackerBoard').classList.remove('edit-mode');$('editModeBtn').classList.remove('active');$('editModeBtn').setAttribute('aria-pressed','false');
    showScreen('tracker');renderCanvas();updateTrackerStatus();requestAnimationFrame(drawJourneyPath);
  }

  function goalFont(goal){return FONT_STACKS[goal.fontKey]||FONT_STACKS.system;}
  function renderCanvas(){renderGoals();renderDecorations();drawJourneyPath();updateTrackerStatus();}
  function renderGoals(){
    const trip=state.currentTrip;if(!trip)return;
    $('goalsCanvas').innerHTML=trip.goals.map((goal,index)=>{
      const selected=state.editMode&&state.selectedGoalId===goal.id;const ratio=trip.cardShape==='circle'?'1':'1.24';const date=formatDateTime(goal.capturedAt);const photo=goal.photo?`<img src="${goal.photo}" alt="${escapeHtml(goal.name)}">`:`<span class="goal-placeholder">＋ Foto</span>`;
      const handles=selected?`<div class="edit-overlay"><button class="tile-delete" data-goal-delete="${goal.id}" type="button" aria-label="Kachel löschen">×</button><button class="rotate-handle" data-rotate-handle="${goal.id}" type="button" aria-label="Kachel drehen">↻</button><span class="resize-handle tl" data-resize-handle="${goal.id}"></span><span class="resize-handle tr" data-resize-handle="${goal.id}"></span><span class="resize-handle bl" data-resize-handle="${goal.id}"></span><span class="resize-handle br" data-resize-handle="${goal.id}"></span></div>`:'';
      return`<div class="goal-anchor" data-goal-id="${goal.id}" data-goal-index="${index}" style="left:${goal.x}%;top:${goal.y}%;width:${goal.width}%;aspect-ratio:${ratio}"><article class="goal-card shape-${trip.cardShape}${trip.photoOnly?' photo-only':''}${selected?' selected':''}" style="transform:rotate(${goal.rotation}deg);font-family:${goalFont(goal)}"><span class="goal-number">${index+1}</span><div class="goal-photo">${photo}</div>${goal.location?`<span class="goal-location-badge">⌖ ${escapeHtml(goal.location.label)}</span>`:''}<div class="goal-card-meta"><strong style="color:${goal.titleColor}">${escapeHtml(goal.name)}</strong><small>${date||'Antippen zum Bearbeiten'}</small></div></article>${handles}</div>`;
    }).join('');
  }
  function renderDecorations(){
    const trip=state.currentTrip;if(!trip)return;
    $('decorationsCanvas').innerHTML=(trip.decorations||[]).map(item=>{const selected=state.editMode&&state.selectedDecorationId===item.id;return`<div class="decoration${selected?' selected':''}" data-decoration-id="${item.id}" style="left:${item.x}%;top:${item.y}%;--emoji-size:${item.size}px;transform:translate(-50%,-50%) rotate(${item.rotation}deg)">${escapeHtml(item.emoji)}${selected?`<button class="emoji-delete" data-decoration-delete="${item.id}" type="button" aria-label="Emoji löschen">×</button>`:''}</div>`;}).join('');
  }
  function drawJourneyPath(){
    const trip=state.currentTrip,svg=$('journeyPath');if(!trip||trip.lineStyle==='none'||trip.goals.length<2){svg.innerHTML='';return;}
    const points=trip.goals.map(goal=>({x:goal.x*10,y:goal.y*10}));let d='';for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];const bend=Math.max(45,Math.abs(b.x-a.x)*.38);const c1x=a.x+(b.x>=a.x?bend:-bend),c2x=b.x-(b.x>=a.x?bend:-bend);d+=`M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y} `;}
    svg.innerHTML=`<path d="${d}" fill="none" stroke="rgba(17,24,39,.70)" stroke-width="4" stroke-linecap="round" ${trip.lineStyle==='dashed'?'stroke-dasharray="15 13"':''}/>`;
  }
  function selectGoal(id){state.selectedGoalId=id;state.selectedDecorationId=null;renderGoals();renderDecorations();}
  function selectDecoration(id){state.selectedDecorationId=id;state.selectedGoalId=null;renderGoals();renderDecorations();}
  function toggleEditMode(){state.editMode=!state.editMode;state.selectedGoalId=null;state.selectedDecorationId=null;$('trackerBoard').classList.toggle('edit-mode',state.editMode);$('editModeBtn').classList.toggle('active',state.editMode);$('editModeBtn').setAttribute('aria-pressed',String(state.editMode));$('editModeBtn').textContent=state.editMode?'✓ Bearbeitungsmodus aktiv':'✦ Bearbeitungsmodus';renderGoals();renderDecorations();}

  function startPointerSession(event){
    if(!state.editMode||!state.currentTrip||event.button>0)return;
    const deleteGoal=event.target.closest('[data-goal-delete]'),deleteEmoji=event.target.closest('[data-decoration-delete]');if(deleteGoal||deleteEmoji)return;
    const board=$('trackerBoard').getBoundingClientRect();
    const rotate=event.target.closest('[data-rotate-handle]');if(rotate){const goal=state.currentTrip.goals.find(g=>g.id===rotate.dataset.rotateHandle);const anchor=event.target.closest('.goal-anchor').getBoundingClientRect();const cx=anchor.left+anchor.width/2,cy=anchor.top+anchor.height/2;state.pointerSession={type:'rotate',id:goal.id,cx,cy,startAngle:Math.atan2(event.clientY-cy,event.clientX-cx),startRotation:goal.rotation};selectGoal(goal.id);event.preventDefault();return;}
    const resize=event.target.closest('[data-resize-handle]');if(resize){const goal=state.currentTrip.goals.find(g=>g.id===resize.dataset.resizeHandle);const anchor=event.target.closest('.goal-anchor').getBoundingClientRect();const cx=anchor.left+anchor.width/2,cy=anchor.top+anchor.height/2;state.pointerSession={type:'resize',id:goal.id,cx,cy,startDist:Math.hypot(event.clientX-cx,event.clientY-cy)||1,startWidth:goal.width};selectGoal(goal.id);event.preventDefault();return;}
    const decoration=event.target.closest('[data-decoration-id]');if(decoration){const item=state.currentTrip.decorations.find(d=>d.id===decoration.dataset.decorationId);if(!item)return;state.pointerSession={type:'emoji',id:item.id,startX:event.clientX,startY:event.clientY,startItem:{x:item.x,y:item.y},board};selectDecoration(item.id);event.preventDefault();return;}
    const anchor=event.target.closest('[data-goal-id]');if(anchor){const goal=state.currentTrip.goals.find(g=>g.id===anchor.dataset.goalId);if(!goal)return;state.pointerSession={type:'move',id:goal.id,startX:event.clientX,startY:event.clientY,startGoal:{x:goal.x,y:goal.y},board};selectGoal(goal.id);event.preventDefault();}
  }
  function handlePointerMove(event){
    const session=state.pointerSession;if(!session||!state.currentTrip)return;
    if(session.type==='move'){const goal=state.currentTrip.goals.find(g=>g.id===session.id);if(!goal)return;const dx=(event.clientX-session.startX)/session.board.width*100,dy=(event.clientY-session.startY)/session.board.height*100;goal.x=clamp(session.startGoal.x+dx,3,97);goal.y=clamp(session.startGoal.y+dy,4,96);renderGoals();drawJourneyPath();}
    if(session.type==='emoji'){const item=state.currentTrip.decorations.find(d=>d.id===session.id);if(!item)return;item.x=clamp(session.startItem.x+(event.clientX-session.startX)/session.board.width*100,2,98);item.y=clamp(session.startItem.y+(event.clientY-session.startY)/session.board.height*100,3,97);renderDecorations();}
    if(session.type==='resize'){const goal=state.currentTrip.goals.find(g=>g.id===session.id);if(!goal)return;const dist=Math.hypot(event.clientX-session.cx,event.clientY-session.cy);goal.width=clamp(session.startWidth*(dist/session.startDist),14,58);renderGoals();drawJourneyPath();}
    if(session.type==='rotate'){const goal=state.currentTrip.goals.find(g=>g.id===session.id);if(!goal)return;const angle=Math.atan2(event.clientY-session.cy,event.clientX-session.cx);goal.rotation=clamp(session.startRotation+(angle-session.startAngle)*180/Math.PI,-45,45);renderGoals();}
  }
  function endPointerSession(){if(!state.pointerSession)return;state.pointerSession=null;state.dragFinishedAt=Date.now();void saveCurrentTrip();}
  function handleCanvasClick(event){
    const deleteButton=event.target.closest('[data-goal-delete]');if(deleteButton){const goal=state.currentTrip?.goals.find(g=>g.id===deleteButton.dataset.goalDelete);if(!goal)return;if(state.currentTrip.goals.length<=1){toast('Mindestens eine Kachel muss erhalten bleiben.');return;}askConfirm(`„${goal.name}“ löschen?`,'Die Kachel und ihr Foto werden aus diesem Tracker entfernt.',async()=>{state.currentTrip.goals=state.currentTrip.goals.filter(g=>g.id!==goal.id);state.currentTrip.completed=false;state.selectedGoalId=null;await saveCurrentTrip();renderCanvas();});return;}
    const emojiDelete=event.target.closest('[data-decoration-delete]');if(emojiDelete){state.currentTrip.decorations=state.currentTrip.decorations.filter(d=>d.id!==emojiDelete.dataset.decorationDelete);state.selectedDecorationId=null;renderDecorations();void saveCurrentTrip();return;}
    if(Date.now()-state.dragFinishedAt<220)return;
    const anchor=event.target.closest('[data-goal-id]');if(anchor){if(state.editMode){selectGoal(anchor.dataset.goalId);return;}openGoalDialog(Number(anchor.dataset.goalIndex));return;}
    const deco=event.target.closest('[data-decoration-id]');if(deco&&state.editMode){selectDecoration(deco.dataset.decorationId);return;}
    if(state.editMode){state.selectedGoalId=null;state.selectedDecorationId=null;renderGoals();renderDecorations();}
  }

  function openGoalDialog(index){
    const goal=state.currentTrip?.goals[index];if(!goal)return;state.editGoalIndex=index;state.goalDraft=clone(goal);state.goalDraftLocation=clone(goal.location);$('goalEditorHeading').textContent=`Ziel ${index+1} bearbeiten`;$('goalNameInput').value=goal.name;$('goalInfoInput').value=goal.info||'';$('titleColorInput').value=goal.titleColor||'#111827';$('infoColorInput').value=goal.infoColor||'#344054';renderGoalDraft();setModalLock(true);$('goalDialog').showModal();
  }
  function renderGoalDraft(){
    const draft=state.goalDraft;if(!draft)return;
    $('dialogPhotoPreview').innerHTML=draft.photo?`<img src="${draft.photo}" alt="Vorschau">`:'<span>Noch kein Foto</span>';$('removePhotoBtn').classList.toggle('hidden',!draft.photo);$('goalTimeDisplay').textContent=draft.capturedAt?formatDateTime(draft.capturedAt):'Zeitpunkt wird beim Foto automatisch erfasst.';$('goalNameInput').style.color=draft.titleColor||'#111827';$('goalNameInput').style.fontFamily=goalFont(draft);$('goalInfoInput').style.color=draft.infoColor||'#344054';renderSelectedPlaceSummary();
  }
  async function applyPickedPhoto(file){if(!file||!state.goalDraft)return;if(!file.type.startsWith('image/')){toast('Bitte wähle eine Bilddatei.');return;}try{state.goalDraft.photo=await readAsDataURL(file);state.goalDraft.capturedAt=new Date().toISOString();renderGoalDraft();}catch(error){console.error(error);toast('Foto konnte nicht geladen werden.');}}
  function removeDraftPhoto(){if(!state.goalDraft)return;state.goalDraft.photo=null;state.goalDraft.capturedAt=null;renderGoalDraft();}
  async function saveGoalFromDialog(){
    if(state.editGoalIndex<0||!state.currentTrip||!state.goalDraft)return;const goal=state.currentTrip.goals[state.editGoalIndex];const draft=state.goalDraft;goal.name=$('goalNameInput').value.trim()||`Ziel ${state.editGoalIndex+1}`;goal.info=$('goalInfoInput').value.trim();goal.photo=draft.photo||null;goal.capturedAt=draft.capturedAt||null;goal.location=normalizeLocation(state.goalDraftLocation);goal.titleColor=draft.titleColor;goal.infoColor=draft.infoColor;goal.fontKey=draft.fontKey;if(!goal.photo)state.currentTrip.completed=false;await saveCurrentTrip();renderCanvas();closeGoalDialog();
  }
  function closeGoalDialog(){if($('goalDialog').open)$('goalDialog').close();state.editGoalIndex=-1;state.goalDraft=null;state.goalDraftLocation=null;closeStylePopovers();setModalLock(false);}
  function closeStylePopovers(){$('colorPopover').classList.add('hidden');$('fontPopover').classList.add('hidden');}
  function toggleStylePopover(which){const target=$(which);const other=which==='colorPopover'?$('fontPopover'):$('colorPopover');other.classList.add('hidden');target.classList.toggle('hidden');}
  function renderSelectedPlaceSummary(){
    const location=state.goalDraftLocation,el=$('selectedPlaceSummary');if(!location){el.innerHTML='<span class="selected-place-icon">⌖</span><div><strong>Noch kein Ort ausgewählt</strong><small>Der Ort ist optional.</small></div>';$('removePlaceBtn').classList.add('hidden');return;}el.innerHTML=`<span class="selected-place-icon active">⌖</span><div><strong>${escapeHtml(location.label)}</strong><small>Ort ist mit dieser Station verknüpft.</small></div>`;$('removePlaceBtn').classList.remove('hidden');
  }
  function setModalLock(locked){document.documentElement.classList.toggle('modal-open',locked);document.body.classList.toggle('modal-open',locked);}

  async function waitForGeocodeSlot(){const wait=Math.max(0,1050-(Date.now()-state.lastGeocodeAt));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));state.lastGeocodeAt=Date.now();}
  async function requestNominatim(path,params){await waitForGeocodeSlot();state.geocodeController?.abort();state.geocodeController=new AbortController();const query=new URLSearchParams({...params,format:'jsonv2','accept-language':'de'});const response=await fetch(`https://nominatim.openstreetmap.org/${path}?${query}`,{headers:{Accept:'application/json'},signal:state.geocodeController.signal});if(!response.ok)throw new Error(`Kartensuche fehlgeschlagen (${response.status})`);return response.json();}
  function shortPlaceLabel(result){const a=result.address||{};return result.name||a.attraction||a.tourism||a.building||a.amenity||a.road||a.pedestrian||a.city||a.town||a.village||a.municipality||result.display_name?.split(',')[0]||'Ausgewählter Ort';}
  function resetMapPickerView(){
    $('mapSearchResults').classList.add('hidden');$('mapPickerMapWrap').classList.add('hidden');$('mapEmptyState').classList.remove('hidden');$('mapEmptyState').innerHTML='<span>⌖</span><strong>Noch kein Ort ausgewählt</strong><small>Suche oben nach einem Ort oder springe zu deiner aktuellen Position.</small>';$('mapSearchResults').innerHTML='';$('mapSearchStatus').textContent='';$('mapSearchInput').value='';
    state.mapDraftLocation=clone(state.goalDraftLocation);const has=Boolean(state.mapDraftLocation);$('mapPickerApplyBtn').disabled=!has;$('mapSelectedTitle').textContent=has?state.mapDraftLocation.label:'Noch kein Punkt ausgewählt';$('mapSelectedDetail').textContent=has?'Bereits gespeicherter Ort. Suche oben, um ihn zu ändern.':'Wähle zuerst einen Suchtreffer oder deine Position.';
  }
  function openMapPicker(){resetMapPickerView();setModalLock(true);$('mapPickerDialog').showModal();}
  function closeMapPicker(){state.geocodeController?.abort();if($('mapPickerDialog').open)$('mapPickerDialog').close();setModalLock($('goalDialog').open);}
  function ensureMap(){
    if(state.mapInstance)return state.mapInstance;if(!window.L){toast('Die Karte konnte nicht geladen werden.');return null;}state.mapInstance=window.L.map('mapPickerMap',{zoomControl:true,attributionControl:true});window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(state.mapInstance);state.mapInstance.on('click',event=>{void setMapPoint(event.latlng.lat,event.latlng.lng,'Ausgewählter Punkt',true);});return state.mapInstance;
  }
  function showMapAt(latitude,longitude,label){
    $('mapSearchResults').classList.add('hidden');$('mapEmptyState').classList.add('hidden');$('mapPickerMapWrap').classList.remove('hidden');const map=ensureMap();if(!map)return;state.mapDraftLocation={label,latitude,longitude};if(state.mapMarker)state.mapMarker.setLatLng([latitude,longitude]);else state.mapMarker=window.L.marker([latitude,longitude]).addTo(map);map.setView([latitude,longitude],16);$('mapPickerApplyBtn').disabled=false;$('mapSelectedTitle').textContent=label;$('mapSelectedDetail').textContent='Du kannst den Marker durch Antippen der Karte noch verschieben.';requestAnimationFrame(()=>map.invalidateSize());
  }
  async function setMapPoint(latitude,longitude,label,reverse=false){showMapAt(latitude,longitude,label);if(reverse){$('mapSelectedDetail').textContent='Ortsname wird ermittelt …';try{const data=await requestNominatim('reverse',{lat:String(latitude),lon:String(longitude),zoom:'18',addressdetails:'1'});const resolved=shortPlaceLabel(data);if(state.mapDraftLocation&&Math.abs(state.mapDraftLocation.latitude-latitude)<1e-7&&Math.abs(state.mapDraftLocation.longitude-longitude)<1e-7){state.mapDraftLocation.label=resolved;$('mapSelectedTitle').textContent=resolved;$('mapSelectedDetail').textContent='Punkt auf der Karte ausgewählt.';}}catch(error){if(error.name!=='AbortError')$('mapSelectedDetail').textContent='Punkt ausgewählt; Ortsname konnte nicht geladen werden.';}}
  }
  async function searchMapPlace(){
    const query=$('mapSearchInput').value.trim();if(query.length<2){$('mapSearchStatus').textContent='Bitte mindestens zwei Zeichen eingeben.';return;}$('mapSearchStatus').textContent='Vorschläge werden gesucht …';$('mapPickerMapWrap').classList.add('hidden');$('mapEmptyState').classList.add('hidden');
    try{const results=await requestNominatim('search',{q:query,limit:'10',addressdetails:'1'});$('mapSearchResults')._results=results;if(!results.length){$('mapSearchResults').classList.add('hidden');$('mapEmptyState').classList.remove('hidden');$('mapEmptyState').innerHTML='<span>⌖</span><strong>Keine Vorschläge gefunden</strong><small>Versuche einen genaueren oder allgemeineren Suchbegriff.</small>';$('mapSearchStatus').textContent='Keine Treffer.';return;}$('mapSearchResults').innerHTML=results.map((result,index)=>`<button class="map-result" type="button" data-result-index="${index}"><span class="map-result-pin">⌖</span><span><strong>${escapeHtml(shortPlaceLabel(result))}</strong><small>${escapeHtml(result.display_name||'')}</small></span></button>`).join('');$('mapSearchResults').classList.remove('hidden');$('mapSearchStatus').textContent=`${results.length} Vorschläge gefunden. Wähle einen aus.`;}catch(error){if(error.name==='AbortError')return;console.error(error);$('mapSearchStatus').textContent='Die Ortssuche ist gerade nicht erreichbar.';$('mapEmptyState').classList.remove('hidden');}
  }
  function currentPositionMessage(error){if(error?.code===1)return'Standortzugriff wurde vom Browser nicht erlaubt.';if(error?.code===2)return'Deine Position konnte nicht bestimmt werden.';if(error?.code===3)return'Die Standortbestimmung hat zu lange gedauert.';return'Deine Position konnte nicht geladen werden.';}
  function useCurrentMapPosition(){
    if(!navigator.geolocation){$('mapSearchStatus').textContent='Dieser Browser unterstützt keine Standortbestimmung.';return;}$('mapCurrentLocationBtn').disabled=true;$('mapSearchStatus').textContent='Aktuelle Position wird bestimmt …';navigator.geolocation.getCurrentPosition(async position=>{const {latitude,longitude}=position.coords;let label='Meine aktuelle Position';try{const data=await requestNominatim('reverse',{lat:String(latitude),lon:String(longitude),zoom:'18',addressdetails:'1'});label=shortPlaceLabel(data);}catch{}showMapAt(latitude,longitude,label);$('mapSearchStatus').textContent='Position gefunden. Du kannst den Punkt auf der Karte noch verschieben.';$('mapCurrentLocationBtn').disabled=false;},error=>{$('mapSearchStatus').textContent=currentPositionMessage(error);$('mapCurrentLocationBtn').disabled=false;},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  }
  function applyMapPickerSelection(){if(!state.mapDraftLocation)return;state.goalDraftLocation=normalizeLocation(state.mapDraftLocation);renderSelectedPlaceSummary();closeMapPicker();}

  function closePanels(){$('toolsPanel').classList.add('hidden');$('actionPanel').classList.add('hidden');$('toolsBtn').setAttribute('aria-expanded','false');$('actionMenuBtn').setAttribute('aria-expanded','false');}
  function togglePanel(id,buttonId){const panel=$(id),opening=panel.classList.contains('hidden');closePanels();if(opening){panel.classList.remove('hidden');$(buttonId).setAttribute('aria-expanded','true');}}
  function applyToolSettings(){if(!state.currentTrip)return;state.currentTrip.lineStyle=$('lineStyleSelect').value;state.currentTrip.cardShape=$('cardShapeSelect').value;state.currentTrip.photoOnly=$('photoOnlyToggle').checked;renderCanvas();void saveCurrentTrip();}
  function resetCurrentLayout(){if(!state.currentTrip)return;const positions=defaultPositions(state.currentTrip.goals.length);state.currentTrip.goals.forEach((goal,index)=>Object.assign(goal,positions[index]));state.currentTrip.decorations.forEach((item,index)=>{item.x=50+(index%3-1)*12;item.y=18+Math.floor(index/3)*9;});renderCanvas();void saveCurrentTrip();toast('Start-Layout wiederhergestellt.');}
  function addGoal(){if(!state.currentTrip)return;if(state.currentTrip.goals.length>=10){toast('Es sind maximal 10 Kacheln möglich.');return;}const index=state.currentTrip.goals.length;const position=defaultPosition(index,index+1);const goal=newGoal(index,position);state.currentTrip.goals.push(goal);state.currentTrip.completed=false;state.selectedGoalId=goal.id;renderCanvas();void saveCurrentTrip();toast('Neue Kachel hinzugefügt.');}
  function addEmoji(emoji){if(!state.currentTrip||!emoji)return;const n=state.currentTrip.decorations.length;const item={id:createId(),emoji:String(emoji).trim().slice(0,8)||'⭐',x:50+(n%5-2)*6,y:50+(Math.floor(n/5)%3-1)*8,size:42,rotation:(n%3-1)*8};state.currentTrip.decorations.push(item);state.editMode=true;$('trackerBoard').classList.add('edit-mode');$('editModeBtn').classList.add('active');$('editModeBtn').setAttribute('aria-pressed','true');$('editModeBtn').textContent='✓ Bearbeitungsmodus aktiv';state.selectedDecorationId=item.id;state.selectedGoalId=null;renderCanvas();void saveCurrentTrip();}
  async function applyCustomBackground(file){if(!file||!state.currentTrip)return;if(!file.type.startsWith('image/')){toast('Bitte wähle ein Bild als Hintergrund.');return;}try{state.currentTrip.customBackground=await readAsDataURL(file);$('trackerBoard').style.background=boardBackground(state.currentTrip);$('removeCustomBackgroundBtn').classList.remove('hidden');await saveCurrentTrip();toast('Eigenes Hintergrundbild gespeichert.');}catch(error){console.error(error);toast('Hintergrund konnte nicht geladen werden.');}}

  async function exportAll(){try{const trips=(await db.getAllTrips()).map(normalizeTrip).filter(Boolean);if(!trips.length){toast('Es gibt noch keine Tracker zum Exportieren.');return;}const backup={format:'travel-tracker-backup',version:6,exportedAt:new Date().toISOString(),trips};downloadBlob(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),`travel-tracker-sicherung-${new Date().toISOString().slice(0,10)}.traveltracker`);}catch(error){console.error(error);toast('Sicherung konnte nicht erstellt werden.');}}
  async function importAllFile(file){try{const data=JSON.parse(await file.text());const source=Array.isArray(data)?data:data?.trips;if(!Array.isArray(source))throw new Error('Ungültiges Format');const trips=source.map(normalizeTrip).filter(Boolean);if(!trips.length)throw new Error('Keine Tracker');await db.putTrips(trips);await refreshHome();toast(`${trips.length} Tracker importiert.`);}catch(error){console.error(error);toast('Sicherung konnte nicht importiert werden.');}}

  async function inlineBackgroundAsset(css){if(!css||!css.includes('assets/birthday-balloons.png'))return css;try{const response=await fetch('assets/birthday-balloons.png');if(!response.ok)return css;const data=await readAsDataURL(await response.blob());return css.replace(/url\(['"]?assets\/birthday-balloons\.png['"]?\)/,`url('${data}')`);}catch{return css;}}
  async function loadViewerAssets(){if(state.viewerAssetsPromise)return state.viewerAssetsPromise;state.viewerAssetsPromise=Promise.all([fetch('viewer.css').then(r=>r.text()),fetch('core.js').then(r=>r.text()),fetch('viewer.js').then(r=>r.text())]);return state.viewerAssetsPromise;}
  async function buildStandaloneViewer(trip){const [css,core,viewer]=await loadViewerAssets();const copy=clone(trip);copy.backgroundCss=await inlineBackgroundAsset(boardBackground(copy));copy.customBackground=null;const json=JSON.stringify(copy).replace(/<\//g,'<\\/');return`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#0f172a"><title>${escapeHtml(copy.title)} · Travel Tracker</title><style>${css}</style></head><body><main id="viewerApp" class="viewer-app" aria-live="polite"><section id="viewerLoading" class="viewer-message"><div><strong>Reise wird geladen …</strong></div></section></main><script>${core}<\/script><script id="embeddedTripData" type="application/json">${json}<\/script><script>${viewer}<\/script></body></html>`;}
  async function shareTrip(){if(!state.currentTrip)return;try{const html=await buildStandaloneViewer(state.currentTrip);const filename=`${slugify(state.currentTrip.title)}-travel-tracker.html`;const file=new File([html],filename,{type:'text/html'});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:state.currentTrip.title,text:'Meine Travel-Tracker-Reise',files:[file]});}else{downloadBlob(file,filename);toast('Ansicht wurde als HTML-Datei gespeichert.');}}catch(error){if(error?.name==='AbortError')return;console.error(error);toast('Ansicht konnte nicht geteilt werden.');}}
  function previewTrip(){if(!state.currentTrip)return;location.href=`viewer.html?id=${encodeURIComponent(state.currentTrip.id)}`;}
  async function printTrip(){
    const trip=state.currentTrip;if(!trip)return;const goals=trip.goals.filter(goal=>goal.photo);if(!goals.length){toast('Es gibt noch keine Fotos für die PDF.');return;}const background=await inlineBackgroundAsset(boardBackground(trip));document.querySelector('.print-root')?.remove();const root=document.createElement('div');root.className='print-root';const pages=[];for(let i=0;i<goals.length;i+=4)pages.push(goals.slice(i,i+4));root.innerHTML=pages.map((page,pageIndex)=>`<section class="print-page" style="background:${background}"><header class="print-head"><span class="eyebrow">${escapeHtml(categoryLabel(trip.category).toUpperCase())}</span><h1>${escapeHtml(trip.title)}</h1><p>${escapeHtml((trip.participants||[]).join(', '))}</p></header><div class="print-grid">${page.map((goal,index)=>`<article class="print-card"><img src="${goal.photo}" alt="${escapeHtml(goal.name||`Ziel ${pageIndex*4+index+1}`)}"><div class="print-card-body"><strong style="color:${goal.titleColor};font-family:${goalFont(goal)}">${escapeHtml(goal.name)}</strong>${goal.capturedAt?`<small>${escapeHtml(formatDateTime(goal.capturedAt))}</small>`:''}${goal.location?`<div class="place">⌖ ${escapeHtml(goal.location.label)}</div>`:''}${goal.info?`<p style="color:${goal.infoColor}">${escapeHtml(goal.info)}</p>`:''}</div></article>`).join('')}</div><span class="print-page-number">${pageIndex+1} / ${pages.length}</span></section>`).join('');document.body.appendChild(root);const cleanup=()=>root.remove();window.addEventListener('afterprint',cleanup,{once:true});requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));setTimeout(cleanup,60000);
  }
  async function finishTrip(){if(!state.currentTrip)return;const missing=state.currentTrip.goals.filter(goal=>!goal.photo).length;if(missing){toast(`${missing} Kachel${missing===1?' benötigt':'n benötigen'} noch ein Foto. Lösche ungenutzte Kacheln oder füge Fotos hinzu.`);return;}state.currentTrip.completed=true;await saveCurrentTrip('Abgeschlossen');updateTrackerStatus('Abgeschlossen');toast('Tracker abgeschlossen.');}

  function bindEvents(){
    $('brandHome').addEventListener('click',async()=>{if(state.currentTrip)await saveCurrentTrip();await refreshHome();showScreen('home');});$('headerHomeBtn').addEventListener('click',async()=>{if(state.currentTrip)await saveCurrentTrip();await refreshHome();showScreen('home');});
    document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.nav)));
    $('newTripBtn').addEventListener('click',()=>{resetWizard();showScreen('categories');});$('libraryNewBtn').addEventListener('click',()=>{resetWizard();showScreen('categories');});$('libraryBtn').addEventListener('click',()=>showScreen('library'));$('showAllBtn').addEventListener('click',()=>showScreen('library'));
    $('exportAllBtn').addEventListener('click',exportAll);$('libraryExportBtn').addEventListener('click',exportAll);$('importAllBtn').addEventListener('click',()=>$('importPicker').click());$('libraryImportBtn').addEventListener('click',()=>$('importPicker').click());$('importPicker').addEventListener('change',async event=>{const file=event.target.files?.[0];if(file)await importAllFile(file);event.target.value='';});
    $('recentTrips').addEventListener('click',handleTripGridClick);$('tripLibrary').addEventListener('click',handleTripGridClick);
    document.querySelector('.category-grid').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;state.wizard.category=button.dataset.category;state.wizard.background=null;renderBackgrounds();showScreen('backgrounds');});
    $('backgroundGrid').addEventListener('click',event=>{const button=event.target.closest('[data-bg-id]');if(!button)return;state.wizard.background=backgroundFor(state.wizard.category,button.dataset.bgId);showScreen('setup');});
    $('decreasePeople').addEventListener('click',()=>adjustPeople(-1));$('increasePeople').addEventListener('click',()=>adjustPeople(1));$('participantFields').addEventListener('input',event=>{const input=event.target.closest('[data-person-index]');if(input)state.wizard.participants[Number(input.dataset.personIndex)]=input.value;});$('createTrackerBtn').addEventListener('click',()=>void createTripFromWizard());

    $('editModeBtn').addEventListener('click',toggleEditMode);$('toolsBtn').addEventListener('click',()=>togglePanel('toolsPanel','toolsBtn'));$('actionMenuBtn').addEventListener('click',()=>togglePanel('actionPanel','actionMenuBtn'));$('toolsCloseBtn').addEventListener('click',closePanels);$('actionCloseBtn').addEventListener('click',closePanels);
    $('lineStyleSelect').addEventListener('change',applyToolSettings);$('cardShapeSelect').addEventListener('change',applyToolSettings);$('photoOnlyToggle').addEventListener('change',applyToolSettings);$('resetLayoutBtn').addEventListener('click',resetCurrentLayout);$('addGoalBtn').addEventListener('click',addGoal);
    $('customBackgroundBtn').addEventListener('click',()=>$('backgroundPicker').click());$('backgroundPicker').addEventListener('change',async event=>{const file=event.target.files?.[0];if(file)await applyCustomBackground(file);event.target.value='';});$('removeCustomBackgroundBtn').addEventListener('click',()=>{if(!state.currentTrip)return;state.currentTrip.customBackground=null;$('trackerBoard').style.background=boardBackground(state.currentTrip);$('removeCustomBackgroundBtn').classList.add('hidden');void saveCurrentTrip();});
    $('emojiPalette').addEventListener('click',event=>{const button=event.target.closest('[data-emoji]');if(button)addEmoji(button.dataset.emoji);});$('addCustomEmojiBtn').addEventListener('click',()=>{const value=$('customEmojiInput').value.trim();if(!value){toast('Bitte gib ein Emoji ein.');return;}addEmoji(value);$('customEmojiInput').value='';});
    $('saveBtn').addEventListener('click',async()=>{if(await saveCurrentTrip('Jetzt gespeichert'))toast('Tracker gespeichert.');});$('finishBtn').addEventListener('click',finishTrip);$('previewTripBtn').addEventListener('click',previewTrip);$('shareFileBtn').addEventListener('click',shareTrip);$('pdfBtn').addEventListener('click',()=>void printTrip());

    $('goalsCanvas').addEventListener('pointerdown',startPointerSession);$('decorationsCanvas').addEventListener('pointerdown',startPointerSession);$('goalsCanvas').addEventListener('click',handleCanvasClick);$('decorationsCanvas').addEventListener('click',handleCanvasClick);window.addEventListener('pointermove',handlePointerMove,{passive:false});window.addEventListener('pointerup',endPointerSession);window.addEventListener('pointercancel',endPointerSession);

    $('takePhotoBtn').addEventListener('click',()=>$('cameraPicker').click());$('choosePhotoBtn').addEventListener('click',()=>$('photoPicker').click());$('cameraPicker').addEventListener('change',async event=>{await applyPickedPhoto(event.target.files?.[0]);event.target.value='';});$('photoPicker').addEventListener('change',async event=>{await applyPickedPhoto(event.target.files?.[0]);event.target.value='';});$('removePhotoBtn').addEventListener('click',removeDraftPhoto);
    $('goalNameInput').addEventListener('input',()=>{if(state.goalDraft)state.goalDraft.name=$('goalNameInput').value;});$('goalInfoInput').addEventListener('input',()=>{if(state.goalDraft)state.goalDraft.info=$('goalInfoInput').value;});
    $('colorToolBtn').addEventListener('click',()=>toggleStylePopover('colorPopover'));$('fontToolBtn').addEventListener('click',()=>toggleStylePopover('fontPopover'));$('titleColorInput').addEventListener('input',event=>{if(!state.goalDraft)return;state.goalDraft.titleColor=event.target.value;renderGoalDraft();});$('infoColorInput').addEventListener('input',event=>{if(!state.goalDraft)return;state.goalDraft.infoColor=event.target.value;renderGoalDraft();});$('fontPopover').addEventListener('click',event=>{const button=event.target.closest('[data-font]');if(!button||!state.goalDraft)return;state.goalDraft.fontKey=button.dataset.font;renderGoalDraft();closeStylePopovers();});
    $('pickPlaceBtn').addEventListener('click',openMapPicker);$('removePlaceBtn').addEventListener('click',()=>{state.goalDraftLocation=null;renderSelectedPlaceSummary();});$('goalDialogCloseBtn').addEventListener('click',closeGoalDialog);$('goalCancelBtn').addEventListener('click',closeGoalDialog);$('saveGoalBtn').addEventListener('click',()=>void saveGoalFromDialog());
    $('goalDialog').addEventListener('cancel',event=>{event.preventDefault();closeGoalDialog();});

    $('mapSearchForm').addEventListener('submit',event=>{event.preventDefault();void searchMapPlace();});$('mapSearchResults').addEventListener('click',event=>{const button=event.target.closest('[data-result-index]');if(!button)return;const result=$('mapSearchResults')._results?.[Number(button.dataset.resultIndex)];if(!result)return;const lat=Number(result.lat),lng=Number(result.lon),label=shortPlaceLabel(result);showMapAt(lat,lng,label);$('mapSearchStatus').textContent=`${label} ausgewählt. Du kannst den Punkt auf der Karte noch genauer setzen.`;});$('mapCurrentLocationBtn').addEventListener('click',useCurrentMapPosition);$('mapPickerApplyBtn').addEventListener('click',applyMapPickerSelection);$('mapPickerCancelBtn').addEventListener('click',closeMapPicker);$('mapPickerCloseBtn').addEventListener('click',closeMapPicker);$('mapPickerDialog').addEventListener('cancel',event=>{event.preventDefault();closeMapPicker();});

    $('confirmActionBtn').addEventListener('click',async event=>{event.preventDefault();const action=state.confirmAction;state.confirmAction=null;$('confirmDialog').close();if(action)await action();});$('confirmDialog').addEventListener('close',()=>{state.confirmAction=null;});
    window.addEventListener('resize',()=>{if(state.currentTrip&&$('screenTracker').classList.contains('active'))drawJourneyPath();});
  }

  async function migrateStoredTrips(){const stored=await db.getAllTrips();if(!stored.some(trip=>trip?.schemaVersion!==6))return;const normalized=stored.map(normalizeTrip).filter(Boolean);if(normalized.length)await db.putTrips(normalized);}
  async function init(){bindEvents();renderParticipantFields();await migrateStoredTrips();await refreshHome();showScreen('home');}
  init().catch(error=>{console.error(error);toast('Travel Tracker konnte nicht vollständig gestartet werden.');});
})();
