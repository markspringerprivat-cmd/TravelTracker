(() => {
  'use strict';

  const Core = window.TravelTrackerCore;
  if (!Core) throw new Error('TravelTrackerCore wurde nicht geladen.');

  const {
    db,
    createId,
    escapeHtml,
    deepClone,
    readAsDataURL,
    nowLocalDateTimeInput,
    toLocalDateTimeInput,
    fromLocalDateTimeInput,
    formatDateTime,
    mapsCoordinatesUrl,
    normalizeMapsUrl,
    getGeolocationPermissionState,
    getCurrentLocation,
    slugify,
    downloadBlob
  } = Core;

  const CATEGORY_LABELS = Object.freeze({
    travel: 'Reise',
    hiking: 'Wandern',
    birthday: 'Geburtstag'
  });

  const BACKGROUNDS = Object.freeze({
    travel: [
      { id: 'travel-sunset', name: 'Sunset Journey', css: 'linear-gradient(145deg,#14213d 0%,#4f5f8b 36%,#e78b6c 70%,#f2c879 100%)' },
      { id: 'travel-ocean', name: 'Ocean Route', css: 'linear-gradient(150deg,#09203f 0%,#1b7a9e 43%,#8ac6c5 72%,#eee2b3 100%)' },
      { id: 'travel-pastel', name: 'Pastel Trip', css: 'linear-gradient(135deg,#6c5b9f 0%,#cf5f91 47%,#dfaa58 100%)' }
    ],
    hiking: [
      { id: 'hiking-forest', name: 'Forest Trail', css: 'linear-gradient(145deg,#173b2d 0%,#426b4f 42%,#8e9d68 72%,#d4c797 100%)' },
      { id: 'hiking-mountain', name: 'Mountain Air', css: 'linear-gradient(145deg,#40576f 0%,#83a2b5 42%,#bac9bd 68%,#d7c08b 100%)' },
      { id: 'hiking-earth', name: 'Earth Walk', css: 'linear-gradient(140deg,#4b3c2d 0%,#806648 43%,#a79362 67%,#687c63 100%)' }
    ],
    birthday: [
      { id: 'birthday-balloons', name: 'Ballon-Party', css: "url('assets/birthday-balloons.png') center/cover no-repeat" },
      { id: 'birthday-neon', name: 'Neon Party', css: 'linear-gradient(135deg,#352058 0%,#8d3a95 40%,#e05c81 70%,#f3aa5c 100%)' },
      { id: 'birthday-confetti', name: 'Konfetti', css: 'linear-gradient(145deg,#4f52c7 0%,#8b65d6 34%,#e76a9d 68%,#f4be67 100%)' }
    ]
  });

  const LAYOUTS = Object.freeze({
    zigzag: { name: 'Zickzack', desc: 'Klassischer Reiseweg mit abwechselnden Stationen' },
    flow: { name: 'Fließend', desc: 'Ruhiger Verlauf mit weichen Abständen' },
    collage: { name: 'Collage', desc: 'Lebendiger und etwas verspielter' }
  });

  const $ = id => document.getElementById(id);
  const screens = [...document.querySelectorAll('.screen')];
  const LOCATION_PREF_KEY = 'travelTracker:autoLocation';

  const state = {
    currentTrip: null,
    editGoalIndex: -1,
    selectedGoalIndex: -1,
    layoutMode: false,
    confirmAction: null,
    dragFinishedAt: 0,
    viewerAssetsPromise: null,
    locationOnboarding: false,
    locationStatus: 'unknown',
    wizard: createInitialWizard()
  };

  function createInitialWizard() {
    return {
      category: 'travel',
      background: null,
      title: '',
      people: 1,
      participants: [''],
      goalCount: 6,
      layout: 'zigzag'
    };
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[category] || 'Tracker';
  }

  function backgroundFor(category, id) {
    const items = BACKGROUNDS[category] || BACKGROUNDS.travel;
    return items.find(item => item.id === id) || items[0];
  }

  function presetPositions(count, layout = 'zigzag') {
    const presets = {
      zigzag: [[24,23,-5],[72,29,5],[35,43,-2],[70,52,4],[25,66,-4],[63,72,3],[32,82,-3],[74,84,4],[43,91,-2],[69,92,2]],
      flow: [[26,24,-2],[64,31,3],[39,42,-2],[69,50,2],[31,60,-3],[66,67,2],[37,76,-2],[71,82,2],[43,89,-1],[70,91,1]],
      collage: [[26,24,-7],[69,27,7],[38,41,3],[72,49,-5],[25,60,6],[63,66,-2],[34,76,-6],[72,81,5],[44,89,3],[70,91,-3]]
    };
    const source = presets[layout] || presets.zigzag;
    return source.slice(0, count).map(([x, y, rotation]) => ({
      x,
      y,
      rotation,
      entrySide: 'auto',
      exitSide: 'auto'
    }));
  }

  function normalizeLocation(location) {
    if (!location || typeof location !== 'object') return null;

    const label = String(location.label || '').trim();
    const rawMapsUrl = String(location.mapsUrl || '').trim();
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    const accuracy = Number(location.accuracy);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!label && !rawMapsUrl && !hasCoordinates) return null;

    return {
      source: location.source === 'gps' && hasCoordinates ? 'gps' : 'manual',
      label: label || (hasCoordinates ? 'Aufnahmeort' : 'Standort anzeigen'),
      mapsUrl: hasCoordinates ? mapsCoordinatesUrl(latitude, longitude) : normalizeMapsUrl(rawMapsUrl, label),
      latitude: hasCoordinates ? latitude : null,
      longitude: hasCoordinates ? longitude : null,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      capturedAt: location.capturedAt || null
    };
  }

  function normalizeTrip(rawTrip) {
    if (!rawTrip || typeof rawTrip !== 'object') return null;

    const category = CATEGORY_LABELS[rawTrip.category] ? rawTrip.category : 'travel';
    const layout = LAYOUTS[rawTrip.layout] ? rawTrip.layout : 'zigzag';
    const rawGoals = Array.isArray(rawTrip.goals) ? rawTrip.goals.slice(0, 10) : [];
    const goalCount = Math.max(1, rawGoals.length || 1);
    const positions = presetPositions(goalCount, layout);
    const categoryBackgrounds = BACKGROUNDS[category] || BACKGROUNDS.travel;
    const fallbackBackground = categoryBackgrounds.find(item => item.id === rawTrip.backgroundId)
      || categoryBackgrounds.find(item => item.css === rawTrip.backgroundCss)
      || categoryBackgrounds[0];

    const goals = Array.from({ length: goalCount }, (_, index) => {
      const rawGoal = rawGoals[index] || {};
      const preset = positions[index] || { x: 50, y: 50, rotation: 0, entrySide: 'auto', exitSide: 'auto' };
      const x = Number(rawGoal.x);
      const y = Number(rawGoal.y);
      const rotation = Number(rawGoal.rotation);

      return {
        id: rawGoal.id || createId(),
        name: String(rawGoal.name || `Ziel ${index + 1}`).trim() || `Ziel ${index + 1}`,
        info: String(rawGoal.info || ''),
        capturedAt: rawGoal.capturedAt || null,
        photo: typeof rawGoal.photo === 'string' && /^data:image\//i.test(rawGoal.photo) ? rawGoal.photo : null,
        location: normalizeLocation(rawGoal.location),
        x: Number.isFinite(x) ? Math.max(16, Math.min(84, x)) : preset.x,
        y: Number.isFinite(y) ? Math.max(14, Math.min(91, y)) : preset.y,
        rotation: Number.isFinite(rotation) ? Math.max(-25, Math.min(25, rotation)) : preset.rotation,
        entrySide: ['auto','top','right','bottom','left'].includes(rawGoal.entrySide) ? rawGoal.entrySide : 'auto',
        exitSide: ['auto','top','right','bottom','left'].includes(rawGoal.exitSide) ? rawGoal.exitSide : 'auto'
      };
    });

    return {
      ...rawTrip,
      id: rawTrip.id || createId(),
      schemaVersion: 4,
      title: String(rawTrip.title || `${categoryLabel(category)} ${new Date().toLocaleDateString('de-DE')}`).trim(),
      category,
      backgroundId: rawTrip.backgroundId || fallbackBackground.id,
      backgroundCss: fallbackBackground.css,
      participants: Array.isArray(rawTrip.participants)
        ? rawTrip.participants.map(value => String(value || '').trim()).filter(Boolean).slice(0, 12)
        : [],
      layout,
      lineStyle: ['dashed','solid','none'].includes(rawTrip.lineStyle) ? rawTrip.lineStyle : 'dashed',
      completed: Boolean(rawTrip.completed) && goals.every(goal => Boolean(goal.photo)),
      createdAt: rawTrip.createdAt || new Date().toISOString(),
      updatedAt: rawTrip.updatedAt || rawTrip.createdAt || new Date().toISOString(),
      goals
    };
  }


  function getLocationPreference() {
    const value = localStorage.getItem(LOCATION_PREF_KEY);
    return value === 'enabled' || value === 'disabled' ? value : null;
  }

  function setLocationPreference(value) {
    if (value === 'enabled' || value === 'disabled') localStorage.setItem(LOCATION_PREF_KEY, value);
    else localStorage.removeItem(LOCATION_PREF_KEY);
    updateLocationTile();
    updateCaptureLocationNote();
  }

  function platformHelpText() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return '<strong>iPhone/iPad:</strong> Öffne die Seite in Safari. Falls der Standort blockiert ist: Seitenmenü/„aA“ → Website-Einstellungen → Standort → Erlauben oder Fragen. Prüfe außerdem Einstellungen → Datenschutz & Sicherheit → Ortungsdienste.';
    }
    if (/Android/i.test(ua)) {
      return '<strong>Android:</strong> In Chrome: Symbol links neben der Adresse → Berechtigungen → Standort → Zulassen. Prüfe außerdem, ob die Ortungsdienste des Geräts eingeschaltet sind.';
    }
    return '<strong>Browser-Einstellungen:</strong> Erlaube dieser Website den Zugriff auf den Standort und prüfe, ob die Ortungsdienste des Geräts aktiviert sind.';
  }

  async function refreshLocationPermissionStatus() {
    state.locationStatus = await getGeolocationPermissionState();
    updateLocationTile();
    renderLocationPermissionState();
    return state.locationStatus;
  }

  function updateLocationTile() {
    const element = $('locationTileStatus');
    if (!element) return;
    const pref = getLocationPreference();
    if (pref === 'disabled') {
      element.textContent = 'Ausgeschaltet · nur manuelle Orte';
      return;
    }
    if (pref !== 'enabled') {
      element.textContent = 'Noch nicht eingerichtet';
      return;
    }
    if (state.locationStatus === 'granted') element.textContent = 'Aktiv · Aufnahmeort wird automatisch gespeichert';
    else if (state.locationStatus === 'denied') element.textContent = 'Aktiv gewünscht · im Browser blockiert';
    else element.textContent = 'Aktiv · Browserberechtigung wird bei Bedarf geprüft';
  }

  function updateCaptureLocationNote(message = '', type = '') {
    const element = $('captureLocationNote');
    if (!element) return;
    element.classList.remove('active', 'error');
    if (message) {
      element.textContent = message;
      if (type) element.classList.add(type);
      return;
    }
    if (getLocationPreference() === 'enabled') {
      element.textContent = 'Automatischer Aufnahmeort ist aktiv: Bei „Foto machen“ wird nach der Aufnahme der Standort gespeichert und ein Google-Maps-Link erzeugt.';
      element.classList.add('active');
    } else {
      element.textContent = 'Automatischer Aufnahmeort ist aus. Du kannst unten weiterhin einen Ort manuell über Google Maps speichern.';
    }
  }

  function renderLocationPermissionState() {
    const panel = $('locationPermissionPanel');
    if (!panel) return;
    const headline = $('locationPermissionHeadline');
    const text = $('locationPermissionText');
    const help = $('locationHelp');
    panel.classList.remove('good', 'warn', 'bad');
    help.classList.add('hidden');

    if (!window.isSecureContext) {
      panel.classList.add('bad');
      headline.textContent = 'HTTPS ist erforderlich';
      text.textContent = 'Öffne Travel Tracker über die HTTPS-Adresse deiner GitHub-Pages-Seite.';
      return;
    }
    if (!navigator.geolocation) {
      panel.classList.add('bad');
      headline.textContent = 'Standort nicht unterstützt';
      text.textContent = 'Dieser Browser stellt Travel Tracker keinen Standortzugriff bereit.';
      return;
    }
    if (state.locationStatus === 'granted') {
      panel.classList.add('good');
      headline.textContent = 'Standort ist erlaubt';
      text.textContent = 'Kamera-Fotos können automatisch mit ihrem Aufnahmeort verknüpft werden.';
      return;
    }
    if (state.locationStatus === 'denied') {
      panel.classList.add('bad');
      headline.textContent = 'Standort ist im Browser blockiert';
      text.textContent = 'Die Website darf den Standort aktuell nicht abrufen. Ändere die Website-Berechtigung und teste danach erneut.';
      help.innerHTML = platformHelpText();
      help.classList.remove('hidden');
      return;
    }
    panel.classList.add('warn');
    headline.textContent = state.locationStatus === 'prompt' ? 'Browserabfrage noch offen' : 'Berechtigungsstatus wird beim Aktivieren geprüft';
    text.textContent = 'Tippe auf „Standort aktivieren“. Danach sollte die normale Standortabfrage deines Browsers erscheinen.';
  }

  async function openLocationDialog({ onboarding = false } = {}) {
    state.locationOnboarding = onboarding;
    $('locationCloseBtn').classList.toggle('hidden', onboarding);
    $('locationDialog').showModal();
    await refreshLocationPermissionStatus();
  }

  function enableLocationFromDialog() {
    setLocationPreference('enabled');
    // Close our dialog synchronously, then immediately trigger the native browser request
    // from the same click handler. This is the most reliable flow on mobile browsers.
    $('locationDialog').close();
    const request = getCurrentLocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    request.then(position => {
      state.locationStatus = 'granted';
      updateLocationTile();
      toast(`Standort aktiviert · Genauigkeit ca. ±${Math.round(position.accuracy || 0)} m`);
    }).catch(error => {
      state.locationStatus = error.kind === 'denied' ? 'denied' : state.locationStatus;
      updateLocationTile();
      toast(error.message || 'Standort konnte nicht aktiviert werden.');
      if (error.kind === 'denied' || error.kind === 'insecure') {
        setTimeout(() => openLocationDialog({ onboarding: false }), 100);
      }
    });
  }

  function disableLocationFromDialog() {
    setLocationPreference('disabled');
    $('locationDialog').close();
    toast('Automatische Standorterfassung ist ausgeschaltet.');
  }

  async function captureLocationForGoal(goal) {
    if (!goal || getLocationPreference() !== 'enabled') return false;
    updateCaptureLocationNote('Foto gespeichert. Aufnahmeort wird ermittelt …', 'active');
    try {
      const position = await getCurrentLocation({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      goal.location = {
        source: 'gps',
        label: 'Aufnahmeort',
        mapsUrl: mapsCoordinatesUrl(position.latitude, position.longitude),
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString()
      };
      state.locationStatus = 'granted';
      $('placeNameInput').value = goal.location.label;
      $('mapsUrlInput').value = goal.location.mapsUrl;
      $('mapsModeBadge').textContent = 'automatisch';
      updateMapsControls();
      updateCaptureLocationNote(`Aufnahmeort gespeichert · Genauigkeit ca. ±${Math.round(position.accuracy || 0)} m`, 'active');
      await saveCurrentTrip('Foto und Aufnahmeort gespeichert');
      renderGoals();
      updateLocationTile();
      return true;
    } catch (error) {
      if (error.kind === 'denied') state.locationStatus = 'denied';
      updateLocationTile();
      updateCaptureLocationNote(`Foto gespeichert, Standort aber nicht: ${error.message}`, 'error');
      toast(`Foto gespeichert · ${error.message}`);
      return false;
    }
  }

  function showScreen(name) {
    const targetId = `screen${name[0].toUpperCase()}${name.slice(1)}`;
    screens.forEach(screen => screen.classList.toggle('active', screen.id === targetId));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function toast(message) {
    const element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.classList.remove('show'), 2400);
  }

  async function saveCurrentTrip(message = 'Lokal gespeichert') {
    if (!state.currentTrip) return false;
    state.currentTrip.updatedAt = new Date().toISOString();

    try {
      await db.putTrip(state.currentTrip);
      $('saveState').textContent = message;
      return true;
    } catch (error) {
      console.error(error);
      $('saveState').textContent = 'Speichern fehlgeschlagen';
      toast('Tracker konnte nicht gespeichert werden.');
      return false;
    }
  }

  async function refreshHome() {
    try {
      const trips = (await db.getAllTrips())
        .map(normalizeTrip)
        .filter(Boolean)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

      $('libraryCount').textContent = trips.length
        ? `${trips.length} gespeicherte${trips.length === 1 ? 'r Tracker' : ' Tracker'}`
        : 'Noch keine gespeicherten Tracker';

      renderTripCards($('recentTrips'), trips.slice(0, 3));
      renderTripCards($('tripLibrary'), trips);
    } catch (error) {
      console.error(error);
      toast('Gespeicherte Tracker konnten nicht geladen werden.');
    }
  }

  function renderTripCards(container, trips) {
    if (!trips.length) {
      container.innerHTML = '<div class="empty-card">Noch keine Tracker vorhanden.</div>';
      return;
    }

    container.innerHTML = trips.map(trip => {
      const filled = trip.goals.filter(goal => goal.photo).length;
      const total = trip.goals.length;
      return `<article class="trip-card" data-trip-id="${escapeHtml(trip.id)}">
        <button class="delete-mini" type="button" data-action="delete-trip" data-trip-id="${escapeHtml(trip.id)}" aria-label="${escapeHtml(trip.title)} löschen">×</button>
        <button class="trip-card-main" type="button" data-action="open-trip" data-trip-id="${escapeHtml(trip.id)}">
          <div class="trip-thumb" style="background:${trip.backgroundCss || '#dbe4ef'}"></div>
          <div class="trip-card-copy">
            <strong>${escapeHtml(trip.title || 'Ohne Titel')}</strong>
            <small>${escapeHtml(categoryLabel(trip.category))} · ${filled}/${total} Ziele${trip.completed ? ' · abgeschlossen' : ''}</small>
          </div>
        </button>
      </article>`;
    }).join('');
  }

  async function handleTripGridClick(event) {
    const actionButton = event.target.closest('[data-action][data-trip-id]');
    if (!actionButton) return;

    const { action, tripId } = actionButton.dataset;
    if (action === 'open-trip') {
      await openTrip(tripId);
      return;
    }

    if (action === 'delete-trip') {
      const trip = await db.getTrip(tripId);
      askConfirm(
        `„${trip?.title || 'Diese Reise'}“ löschen?`,
        'Die Reise und alle darin lokal gespeicherten Fotos werden von diesem Gerät gelöscht.',
        async () => {
          await db.deleteTrip(tripId);
          if (state.currentTrip?.id === tripId) state.currentTrip = null;
          await refreshHome();
          toast('Reise gelöscht.');
        }
      );
    }
  }

  function askConfirm(title, text, callback) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    state.confirmAction = callback;
    $('confirmDialog').showModal();
  }

  function resetWizard() {
    state.wizard = createInitialWizard();
    $('projectTitle').value = '';
    $('peopleCount').value = '1';
    $('goalCount').value = '6';
    renderParticipantFields();
  }

  function renderBackgrounds() {
    const items = BACKGROUNDS[state.wizard.category] || BACKGROUNDS.travel;
    $('backgroundGrid').innerHTML = items.map(background => `
      <button class="background-card" type="button" data-bg-id="${background.id}">
        <div class="background-preview" style="background:${background.css}"></div>
        <strong>${escapeHtml(background.name)}</strong>
        <small>Als Hintergrund verwenden</small>
      </button>`).join('');
  }

  function renderParticipantFields() {
    const { wizard } = state;
    wizard.participants = Array.from({ length: wizard.people }, (_, index) => wizard.participants[index] || '');
    $('participantFields').innerHTML = wizard.participants.map((name, index) => `
      <label class="field-label">Person ${index + 1}
        <input data-person-index="${index}" maxlength="40" placeholder="Name" value="${escapeHtml(name)}">
      </label>`).join('');
  }

  function renderLayouts() {
    $('layoutGrid').innerHTML = Object.entries(LAYOUTS).map(([key, layout]) => {
      const positions = presetPositions(5, key);
      const preview = positions.map(position => `
        <span class="layout-dot" style="left:${position.x}%;top:${position.y}%;transform:translate(-50%,-50%) rotate(${position.rotation}deg)"></span>`).join('');
      return `<button class="layout-card" data-layout="${key}" type="button">
        <div class="layout-preview">${preview}</div>
        <strong>${escapeHtml(layout.name)}</strong>
        <small>${escapeHtml(layout.desc)}</small>
      </button>`;
    }).join('');
  }

  async function createTripFromWizard() {
    const { wizard } = state;
    const positions = presetPositions(wizard.goalCount, wizard.layout);
    const now = new Date().toISOString();
    const fallbackBackground = backgroundFor(wizard.category, wizard.background?.id);

    state.currentTrip = {
      id: createId(),
      schemaVersion: 4,
      title: wizard.title || `${categoryLabel(wizard.category)} ${new Date().toLocaleDateString('de-DE')}`,
      category: wizard.category,
      backgroundId: wizard.background?.id || fallbackBackground.id,
      backgroundCss: wizard.background?.css || fallbackBackground.css,
      participants: wizard.participants.map(name => name.trim()).filter(Boolean),
      layout: wizard.layout,
      lineStyle: 'dashed',
      completed: false,
      createdAt: now,
      updatedAt: now,
      goals: Array.from({ length: wizard.goalCount }, (_, index) => ({
        id: createId(),
        name: `Ziel ${index + 1}`,
        info: '',
        capturedAt: null,
        photo: null,
        location: null,
        ...positions[index]
      }))
    };

    await db.putTrip(state.currentTrip);
    openTrackerScreen();
  }

  async function openTrip(id) {
    try {
      const rawTrip = await db.getTrip(id);
      if (!rawTrip) {
        toast('Tracker nicht gefunden.');
        return;
      }

      state.currentTrip = normalizeTrip(rawTrip);
      await db.putTrip(state.currentTrip); // Persists schema cleanup/migration once.
      openTrackerScreen();
    } catch (error) {
      console.error(error);
      toast('Tracker konnte nicht geöffnet werden.');
    }
  }

  function openTrackerScreen() {
    const trip = state.currentTrip;
    if (!trip) return;

    state.layoutMode = false;
    state.selectedGoalIndex = -1;
    $('layoutEditor').classList.add('hidden');
    $('saveState').textContent = 'Lokal gespeichert';
    $('trackerCategoryLabel').textContent = categoryLabel(trip.category).toUpperCase();
    $('trackerTitle').textContent = trip.title;
    $('boardBadge').textContent = categoryLabel(trip.category).toUpperCase();
    $('boardTitle').textContent = trip.title;
    $('trackerBoard').style.background = trip.backgroundCss || '#d7dde6';
    $('lineStyleSelect').value = trip.lineStyle || 'dashed';

    showScreen('tracker');
    renderGoals();
  }

  function renderGoals() {
    const trip = state.currentTrip;
    if (!trip) return;

    $('goalsCanvas').innerHTML = trip.goals.map((goal, index) => {
      const photo = goal.photo
        ? `<img src="${goal.photo}" alt="${escapeHtml(goal.name)}">`
        : `<div class="goal-placeholder">Foto ${index + 1}</div>`;
      const location = goal.location?.label
        ? `<span class="goal-location-badge">⌖ ${escapeHtml(goal.location.label)}</span>`
        : '';

      return `<div class="goal-anchor ${state.selectedGoalIndex === index ? 'selected' : ''}" data-goal-index="${index}" style="left:${goal.x}%;top:${goal.y}%">
        <div class="goal-card-visual" style="transform:rotate(${goal.rotation || 0}deg)">
          <span class="goal-number">${index + 1}</span>
          ${photo}
          ${location}
          <div class="goal-card-meta">
            <strong>${escapeHtml(goal.name || `Ziel ${index + 1}`)}</strong>
            <small>${goal.photo ? 'Erinnerung gespeichert' : 'Antippen zum Bearbeiten'}</small>
          </div>
        </div>
      </div>`;
    }).join('');

    updateProgress();
    requestAnimationFrame(drawJourneyPath);
  }

  function updateProgress() {
    const trip = state.currentTrip;
    if (!trip) return;

    const done = trip.goals.filter(goal => goal.photo).length;
    const total = trip.goals.length;
    $('progressText').textContent = `${done} / ${total}`;
    $('progressBar').style.width = `${total ? (done / total) * 100 : 0}%`;
    $('completeActions').classList.toggle('hidden', !trip.completed);
    $('finishBtn').textContent = trip.completed ? 'Abgeschlossen' : 'Tracker abschließen';
    $('finishBtn').disabled = trip.completed;
  }

  function sidePoint(goal, side, otherGoal) {
    let resolvedSide = side;
    if (resolvedSide === 'auto') {
      const dx = otherGoal.x - goal.x;
      const dy = otherGoal.y - goal.y;
      resolvedSide = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'bottom' : 'top');
    }

    const halfWidth = 15.5;
    const halfHeight = 8;
    if (resolvedSide === 'left') return [goal.x - halfWidth, goal.y];
    if (resolvedSide === 'right') return [goal.x + halfWidth, goal.y];
    if (resolvedSide === 'top') return [goal.x, goal.y - halfHeight];
    return [goal.x, goal.y + halfHeight];
  }

  function drawJourneyPath() {
    const trip = state.currentTrip;
    const svg = $('journeyPath');
    if (!trip || trip.lineStyle === 'none') {
      svg.innerHTML = '';
      return;
    }

    const paths = [];
    for (let index = 0; index < trip.goals.length - 1; index += 1) {
      const from = trip.goals[index];
      const to = trip.goals[index + 1];
      const [startXPercent, startYPercent] = sidePoint(from, from.exitSide || 'auto', to);
      const [endXPercent, endYPercent] = sidePoint(to, to.entrySide || 'auto', from);
      const x1 = startXPercent * 10;
      const y1 = startYPercent * 14.14;
      const x2 = endXPercent * 10;
      const y2 = endYPercent * 14.14;
      const curve = (x2 - x1) * 0.45;
      const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
      const dash = trip.lineStyle === 'dashed' ? '16 14' : 'none';
      paths.push(`<path d="${path}" fill="none" stroke="#152437" stroke-width="4" stroke-linecap="round" stroke-dasharray="${dash}" opacity=".92"/>`);
    }
    svg.innerHTML = paths.join('');
  }

  function selectGoal(index, anchor = null) {
    state.selectedGoalIndex = index;
    renderSelectionControls();
    document.querySelectorAll('.goal-anchor.selected').forEach(element => element.classList.remove('selected'));
    anchor?.classList.add('selected');
  }

  function handleGoalPointerDown(event) {
    if (!state.layoutMode || !state.currentTrip) return;
    const anchor = event.target.closest('.goal-anchor');
    if (!anchor) return;

    event.preventDefault();
    const index = Number(anchor.dataset.goalIndex);
    const goal = state.currentTrip.goals[index];
    const boardRect = $('trackerBoard').getBoundingClientRect();
    const start = {
      x: event.clientX,
      y: event.clientY,
      goalX: goal.x,
      goalY: goal.y
    };
    let moved = false;

    selectGoal(index, anchor);
    anchor.setPointerCapture?.(event.pointerId);

    const onMove = moveEvent => {
      moved = true;
      const nextX = Math.max(16, Math.min(84, start.goalX + ((moveEvent.clientX - start.x) / boardRect.width) * 100));
      const nextY = Math.max(14, Math.min(91, start.goalY + ((moveEvent.clientY - start.y) / boardRect.height) * 100));
      goal.x = nextX;
      goal.y = nextY;
      anchor.style.left = `${nextX}%`;
      anchor.style.top = `${nextY}%`;
      drawJourneyPath();
    };

    const onEnd = async endEvent => {
      anchor.removeEventListener('pointermove', onMove);
      anchor.removeEventListener('pointerup', onEnd);
      anchor.removeEventListener('pointercancel', onEnd);
      try { anchor.releasePointerCapture?.(endEvent.pointerId); } catch {}
      state.dragFinishedAt = Date.now();
      if (moved) await saveCurrentTrip();
    };

    anchor.addEventListener('pointermove', onMove);
    anchor.addEventListener('pointerup', onEnd);
    anchor.addEventListener('pointercancel', onEnd);
  }

  function handleGoalClick(event) {
    if (state.layoutMode || Date.now() - state.dragFinishedAt < 250) return;
    const anchor = event.target.closest('.goal-anchor');
    if (!anchor) return;
    openGoalDialog(Number(anchor.dataset.goalIndex));
  }

  function renderSelectionControls() {
    const goal = state.currentTrip?.goals?.[state.selectedGoalIndex];
    $('selectedGoalLabel').textContent = goal ? goal.name : 'Keines';
    $('entrySideSelect').value = goal?.entrySide || 'auto';
    $('exitSideSelect').value = goal?.exitSide || 'auto';
  }

  function rotateSelected(delta) {
    const goal = state.currentTrip?.goals?.[state.selectedGoalIndex];
    if (!goal) {
      toast('Bitte zuerst eine Kachel auswählen.');
      return;
    }
    setSelectedRotation((goal.rotation || 0) + delta);
  }

  function setSelectedRotation(value) {
    const goal = state.currentTrip?.goals?.[state.selectedGoalIndex];
    if (!goal) return;
    goal.rotation = Math.max(-25, Math.min(25, value));
    renderGoals();
    renderSelectionControls();
    void saveCurrentTrip();
  }

  function openGoalDialog(index) {
    const trip = state.currentTrip;
    if (!trip?.goals[index]) return;

    state.editGoalIndex = index;
    const goal = trip.goals[index];
    $('dialogTitle').textContent = goal.name || `Ziel ${index + 1}`;
    $('goalNameInput').value = goal.name || '';
    $('goalTimeInput').value = toLocalDateTimeInput(goal.capturedAt);
    $('goalInfoInput').value = goal.info || '';
    $('placeNameInput').value = goal.location?.label || '';
    $('mapsUrlInput').value = goal.location?.mapsUrl || '';
    $('mapPreviewWrap').classList.add('hidden');
    $('mapPreviewFrame').src = 'about:blank';
    $('mapsModeBadge').textContent = goal.location?.source === 'gps' ? 'automatisch' : 'manuell';
    updateCaptureLocationNote();
    renderDialogPhoto(goal.photo);
    updatePhotoRemoveButton(goal.photo);
    updateMapsControls();
    $('goalDialog').showModal();
  }

  function renderDialogPhoto(photo) {
    $('dialogPhotoPreview').innerHTML = photo
      ? `<img src="${photo}" alt="Vorschau">`
      : '<span>Noch kein Foto</span>';
  }

  function updatePhotoRemoveButton(photo) {
    $('removePhotoBtn').classList.toggle('hidden', !photo);
  }

  async function applyPickedPhoto(file, source = 'library') {
    if (!file || state.editGoalIndex < 0 || !state.currentTrip) return;

    try {
      const dataUrl = await readAsDataURL(file);
      const goal = state.currentTrip.goals[state.editGoalIndex];
      goal.photo = dataUrl;
      if (source === 'camera' || !goal.capturedAt) {
        goal.capturedAt = new Date().toISOString();
        $('goalTimeInput').value = nowLocalDateTimeInput();
      }

      renderDialogPhoto(dataUrl);
      updatePhotoRemoveButton(dataUrl);
      renderGoals();
      await saveCurrentTrip('Foto gespeichert');

      if (source === 'camera' && getLocationPreference() === 'enabled') {
        await captureLocationForGoal(goal);
      }
    } catch (error) {
      console.error(error);
      toast('Foto konnte nicht gespeichert werden.');
    }
  }

  async function removeCurrentGoalPhoto() {
    if (state.editGoalIndex < 0 || !state.currentTrip) return;
    const goal = state.currentTrip.goals[state.editGoalIndex];
    goal.photo = null;
    state.currentTrip.completed = false;
    renderDialogPhoto(null);
    updatePhotoRemoveButton(null);
    renderGoals();
    await saveCurrentTrip('Foto entfernt');
  }

  function updateMapsControls() {
    const place = $('placeNameInput').value.trim();
    const customUrl = $('mapsUrlInput').value.trim();
    $('openMapsSearchLink').href = normalizeMapsUrl(customUrl, place);
    $('removePlaceBtn').classList.toggle('hidden', !place && !customUrl);
  }

  function showMapPreview() {
    const place = $('placeNameInput').value.trim();
    if (!place) {
      toast('Bitte zuerst einen Ort eingeben.');
      $('placeNameInput').focus();
      return;
    }

    $('mapPreviewFrame').src = `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;
    $('mapPreviewWrap').classList.remove('hidden');
  }

  function clearMapFields() {
    $('placeNameInput').value = '';
    $('mapsUrlInput').value = '';
    $('mapPreviewFrame').src = 'about:blank';
    $('mapPreviewWrap').classList.add('hidden');
    updateMapsControls();
  }

  async function saveGoalFromDialog() {
    if (state.editGoalIndex < 0 || !state.currentTrip) return;

    const goal = state.currentTrip.goals[state.editGoalIndex];
    const place = $('placeNameInput').value.trim();
    const customMapsUrl = $('mapsUrlInput').value.trim();

    goal.name = $('goalNameInput').value.trim() || `Ziel ${state.editGoalIndex + 1}`;
    goal.capturedAt = fromLocalDateTimeInput($('goalTimeInput').value) || goal.capturedAt || null;
    goal.info = $('goalInfoInput').value.trim();
    if (place || customMapsUrl) {
      const normalizedUrl = normalizeMapsUrl(customMapsUrl, place);
      const existing = goal.location;
      const keepGps = existing?.source === 'gps' && existing.mapsUrl === normalizedUrl;
      goal.location = keepGps
        ? { ...existing, label: place || existing.label || 'Aufnahmeort', mapsUrl: normalizedUrl }
        : { source: 'manual', label: place || 'Standort anzeigen', mapsUrl: normalizedUrl, latitude: null, longitude: null, accuracy: null, capturedAt: null };
    } else {
      goal.location = null;
    }

    await saveCurrentTrip();
    renderGoals();
    $('goalDialog').close();
  }

  async function exportAll() {
    try {
      const trips = (await db.getAllTrips()).map(normalizeTrip).filter(Boolean);
      if (!trips.length) {
        toast('Es gibt noch keine Tracker zum Exportieren.');
        return;
      }

      const backup = {
        format: 'travel-tracker-backup',
        version: 4,
        exportedAt: new Date().toISOString(),
        trips
      };
      downloadBlob(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
        `travel-tracker-sicherung-${new Date().toISOString().slice(0, 10)}.traveltracker`
      );
    } catch (error) {
      console.error(error);
      toast('Sicherung konnte nicht erstellt werden.');
    }
  }

  async function importAllFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const sourceTrips = Array.isArray(data) ? data : data?.trips;
      if (!Array.isArray(sourceTrips)) throw new Error('Ungültiges Sicherungsformat');

      const trips = sourceTrips.map(normalizeTrip).filter(Boolean);
      if (!trips.length) throw new Error('Keine gültigen Tracker gefunden');

      await db.putTrips(trips);
      await refreshHome();
      toast(`${trips.length} Tracker importiert.`);
    } catch (error) {
      console.error(error);
      toast('Sicherung konnte nicht importiert werden.');
    }
  }

  async function inlineBackgroundAsset(css) {
    const match = /url\(['"]?([^'")]+)['"]?\)/.exec(css || '');
    if (!match || /^data:/.test(match[1]) || /^https?:/.test(match[1])) return css;

    try {
      const response = await fetch(match[1]);
      if (!response.ok) throw new Error(`Hintergrund konnte nicht geladen werden (${response.status}).`);
      const dataUrl = await readAsDataURL(await response.blob());
      return css.replace(match[1], dataUrl);
    } catch (error) {
      console.warn('Hintergrund konnte nicht in die Share-Datei eingebettet werden.', error);
      return css;
    }
  }

  async function loadViewerAssets() {
    if (!state.viewerAssetsPromise) {
      state.viewerAssetsPromise = Promise.all([
        fetch('core.js'),
        fetch('viewer.css'),
        fetch('viewer.js')
      ]).then(async responses => {
        for (const response of responses) {
          if (!response.ok) throw new Error(`Viewer-Datei konnte nicht geladen werden (${response.status}).`);
        }
        return Promise.all(responses.map(response => response.text()));
      }).then(([coreJs, css, viewerJs]) => ({ coreJs, css, viewerJs }));
    }
    return state.viewerAssetsPromise;
  }

  async function buildStandaloneViewer(trip) {
    const { coreJs, css, viewerJs } = await loadViewerAssets();
    const clonedTrip = deepClone(trip);

    clonedTrip.backgroundCss = await inlineBackgroundAsset(clonedTrip.backgroundCss || '');
    const escapeScript = script => script.replace(/<\/script/gi, '<\\/script');
    const json = escapeScript(JSON.stringify(clonedTrip));
    const inlineCore = escapeScript(coreJs);
    const inlineViewer = escapeScript(viewerJs);
    const inlineCss = css.replace(/<\/style/gi, '<\\/style');

    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#0f172a"><title>${escapeHtml(trip.title)} · Travel Tracker</title><style>${inlineCss}</style></head><body><main id="viewerApp" class="viewer-app" aria-live="polite"><section id="viewerLoading" class="viewer-message"><div><strong>Reise wird geladen …</strong></div></section></main><script>${inlineCore}<\/script><script id="embeddedTripData" type="application/json">${json}<\/script><script>${inlineViewer}<\/script></body></html>`;
  }

  async function shareTrip() {
    if (!state.currentTrip) return;

    try {
      const html = await buildStandaloneViewer(state.currentTrip);
      const filename = `${slugify(state.currentTrip.title)}-travel-tracker.html`;
      const file = new File([html], filename, { type: 'text/html' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: state.currentTrip.title,
          text: 'Travel-Tracker-Reise',
          files: [file]
        });
      } else {
        downloadBlob(file, filename);
        toast('Präsentationsdatei heruntergeladen. Im Browser öffnen.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      toast('Ansicht konnte nicht erstellt werden.');
    }
  }

  function previewTrip() {
    if (!state.currentTrip) return;
    const url = new URL('viewer.html', location.href);
    url.searchParams.set('id', state.currentTrip.id);
    location.assign(url.href);
  }

  async function printTrip() {
    const trip = state.currentTrip;
    if (!trip) return;

    const goals = trip.goals.filter(goal => goal.photo);
    if (!goals.length) {
      toast('Für die PDF-Ausgabe sind noch keine Fotos vorhanden.');
      return;
    }

    document.querySelector('.print-root')?.remove();
    const printRoot = document.createElement('div');
    printRoot.className = 'print-root';
    const chunks = [];
    for (let index = 0; index < goals.length; index += 4) chunks.push(goals.slice(index, index + 4));

    printRoot.innerHTML = chunks.map((pageGoals, pageIndex) => {
      const cards = pageGoals.map((goal, index) => {
        const place = goal.location?.label ? `<div class="place">⌖ ${escapeHtml(goal.location.label)}</div>` : '';
        return `<article class="print-card">
          <img src="${goal.photo}" alt="${escapeHtml(goal.name || `Ziel ${pageIndex * 4 + index + 1}`)}">
          <div class="print-card-body">
            <strong>${escapeHtml(goal.name || `Ziel ${pageIndex * 4 + index + 1}`)}</strong>
            <small>${escapeHtml(formatDateTime(goal.capturedAt))}</small>
            ${place}
            ${goal.info ? `<p>${escapeHtml(goal.info)}</p>` : ''}
          </div>
        </article>`;
      }).join('');
      return `<section class="print-page" style="background:${trip.backgroundCss || '#53657a'}">
        <header class="print-head"><span class="eyebrow">${escapeHtml(categoryLabel(trip.category).toUpperCase())}</span><h1>${escapeHtml(trip.title)}</h1><p>${escapeHtml((trip.participants || []).join(', '))}</p></header>
        <div class="print-grid">${cards}</div>
        <div class="print-page-number">Travel Tracker · ${pageIndex + 1}/${chunks.length}</div>
      </section>`;
    }).join('');

    document.body.appendChild(printRoot);
    const images = [...printRoot.querySelectorAll('img')];
    await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    })));

    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup);
      printRoot.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    // Some mobile browsers do not reliably emit afterprint.
    setTimeout(() => document.body.contains(printRoot) && printRoot.remove(), 60000);
  }

  async function finishTrip() {
    const trip = state.currentTrip;
    if (!trip) return;

    const missing = trip.goals.filter(goal => !goal.photo).length;
    if (missing) {
      toast(`Noch ${missing} Ziel${missing === 1 ? '' : 'e'} ohne Foto.`);
      return;
    }

    trip.completed = true;
    await saveCurrentTrip('Tracker abgeschlossen');
    updateProgress();
    toast('Tracker abgeschlossen.');
  }

  function adjustWizardCount(key, delta, min, max, outputId, afterChange = null) {
    const wizard = state.wizard;
    wizard[key] = Math.max(min, Math.min(max, wizard[key] + delta));
    $(outputId).value = String(wizard[key]);
    afterChange?.();
  }

  function bindStaticEvents() {
    $('brandHome').addEventListener('click', async () => {
      await refreshHome();
      showScreen('home');
    });

    document.querySelectorAll('[data-nav]').forEach(button => {
      button.addEventListener('click', () => showScreen(button.dataset.nav));
    });

    $('newTripBtn').addEventListener('click', () => { resetWizard(); showScreen('categories'); });
    $('libraryNewBtn').addEventListener('click', () => { resetWizard(); showScreen('categories'); });
    $('libraryBtn').addEventListener('click', async () => { await refreshHome(); showScreen('library'); });
    $('showAllBtn').addEventListener('click', async () => { await refreshHome(); showScreen('library'); });

    $('exportAllBtn').addEventListener('click', exportAll);
    $('libraryExportBtn').addEventListener('click', exportAll);
    $('importAllBtn').addEventListener('click', () => $('importPicker').click());
    $('libraryImportBtn').addEventListener('click', () => $('importPicker').click());
    $('importPicker').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (file) await importAllFile(file);
      event.target.value = '';
    });

    $('recentTrips').addEventListener('click', handleTripGridClick);
    $('tripLibrary').addEventListener('click', handleTripGridClick);

    document.querySelectorAll('[data-category]').forEach(button => {
      button.addEventListener('click', () => {
        state.wizard.category = button.dataset.category;
        state.wizard.background = null;
        renderBackgrounds();
        showScreen('backgrounds');
      });
    });

    $('backgroundGrid').addEventListener('click', event => {
      const button = event.target.closest('[data-bg-id]');
      if (!button) return;
      const items = BACKGROUNDS[state.wizard.category] || BACKGROUNDS.travel;
      state.wizard.background = items.find(item => item.id === button.dataset.bgId) || items[0];
      showScreen('setup');
    });

    $('decreasePeople').addEventListener('click', () => adjustWizardCount('people', -1, 1, 12, 'peopleCount', renderParticipantFields));
    $('increasePeople').addEventListener('click', () => adjustWizardCount('people', 1, 1, 12, 'peopleCount', renderParticipantFields));
    $('decreaseGoals').addEventListener('click', () => adjustWizardCount('goalCount', -1, 1, 10, 'goalCount'));
    $('increaseGoals').addEventListener('click', () => adjustWizardCount('goalCount', 1, 1, 10, 'goalCount'));

    $('participantFields').addEventListener('input', event => {
      const input = event.target.closest('[data-person-index]');
      if (!input) return;
      state.wizard.participants[Number(input.dataset.personIndex)] = input.value;
    });

    $('continueToLayoutBtn').addEventListener('click', () => {
      state.wizard.title = $('projectTitle').value.trim();
      state.wizard.participants = [...$('participantFields').querySelectorAll('input')].map(input => input.value.trim());
      if (!state.wizard.title) {
        toast('Bitte gib dem Tracker einen Titel.');
        $('projectTitle').focus();
        return;
      }
      state.wizard.background ||= backgroundFor(state.wizard.category);
      renderLayouts();
      showScreen('layouts');
    });

    $('layoutGrid').addEventListener('click', async event => {
      const button = event.target.closest('[data-layout]');
      if (!button) return;
      state.wizard.layout = button.dataset.layout;
      await createTripFromWizard();
    });

    $('trackerHomeBtn').addEventListener('click', async () => {
      await saveCurrentTrip();
      await refreshHome();
      showScreen('home');
    });
    $('saveBtn').addEventListener('click', async () => {
      if (await saveCurrentTrip('Jetzt gespeichert')) toast('Tracker gespeichert.');
    });
    $('finishBtn').addEventListener('click', finishTrip);
    $('previewTripBtn').addEventListener('click', previewTrip);
    $('shareFileBtn').addEventListener('click', shareTrip);
    $('pdfBtn').addEventListener('click', () => void printTrip());
    $('locationSettingsBtn').addEventListener('click', () => void openLocationDialog({ onboarding: false }));

    $('layoutEditBtn').addEventListener('click', () => {
      state.layoutMode = true;
      $('layoutEditor').classList.remove('hidden');
      renderGoals();
    });
    $('doneLayoutBtn').addEventListener('click', async () => {
      state.layoutMode = false;
      state.selectedGoalIndex = -1;
      $('layoutEditor').classList.add('hidden');
      await saveCurrentTrip();
      renderGoals();
    });
    $('rotateLeftBtn').addEventListener('click', () => rotateSelected(-3));
    $('rotateRightBtn').addEventListener('click', () => rotateSelected(3));
    $('rotationResetBtn').addEventListener('click', () => setSelectedRotation(0));
    $('entrySideSelect').addEventListener('change', () => {
      const goal = state.currentTrip?.goals?.[state.selectedGoalIndex];
      if (!goal) return;
      goal.entrySide = $('entrySideSelect').value;
      drawJourneyPath();
      void saveCurrentTrip();
    });
    $('exitSideSelect').addEventListener('change', () => {
      const goal = state.currentTrip?.goals?.[state.selectedGoalIndex];
      if (!goal) return;
      goal.exitSide = $('exitSideSelect').value;
      drawJourneyPath();
      void saveCurrentTrip();
    });
    $('lineStyleSelect').addEventListener('change', () => {
      if (!state.currentTrip) return;
      state.currentTrip.lineStyle = $('lineStyleSelect').value;
      drawJourneyPath();
      void saveCurrentTrip();
    });
    $('resetLayoutBtn').addEventListener('click', () => {
      if (!state.currentTrip) return;
      const positions = presetPositions(state.currentTrip.goals.length, state.currentTrip.layout || 'zigzag');
      state.currentTrip.goals.forEach((goal, index) => Object.assign(goal, positions[index]));
      renderGoals();
      void saveCurrentTrip();
    });

    $('goalsCanvas').addEventListener('pointerdown', handleGoalPointerDown);
    $('goalsCanvas').addEventListener('click', handleGoalClick);

    $('takePhotoBtn').addEventListener('click', () => $('cameraPicker').click());
    $('choosePhotoBtn').addEventListener('click', () => $('photoPicker').click());
    $('cameraPicker').addEventListener('change', async event => {
      await applyPickedPhoto(event.target.files?.[0], 'camera');
      event.target.value = '';
    });
    $('photoPicker').addEventListener('change', async event => {
      await applyPickedPhoto(event.target.files?.[0], 'library');
      event.target.value = '';
    });
    $('removePhotoBtn').addEventListener('click', removeCurrentGoalPhoto);

    $('placeNameInput').addEventListener('input', updateMapsControls);
    $('mapsUrlInput').addEventListener('input', updateMapsControls);
    $('showMapPreviewBtn').addEventListener('click', showMapPreview);
    $('removePlaceBtn').addEventListener('click', clearMapFields);

    $('goalForm').addEventListener('submit', async event => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      await saveGoalFromDialog();
    });
    $('goalDialog').addEventListener('close', () => {
      state.editGoalIndex = -1;
    });

    $('enableLocationBtn').addEventListener('click', enableLocationFromDialog);
    $('disableLocationBtn').addEventListener('click', disableLocationFromDialog);
    $('locationCloseBtn').addEventListener('click', () => $('locationDialog').close());

    $('confirmActionBtn').addEventListener('click', async event => {
      event.preventDefault();
      const action = state.confirmAction;
      state.confirmAction = null;
      $('confirmDialog').close();
      if (action) await action();
    });
    $('confirmDialog').addEventListener('close', () => {
      state.confirmAction = null;
    });

    window.addEventListener('resize', () => {
      if (state.currentTrip && $('screenTracker').classList.contains('active')) drawJourneyPath();
    });
  }

  async function migrateStoredTrips() {
    const storedTrips = await db.getAllTrips();
    const migrations = storedTrips
      .filter(trip => trip?.schemaVersion !== 4)
      .map(normalizeTrip)
      .filter(Boolean);

    if (migrations.length) await db.putTrips(migrations);
  }

  async function init() {
    bindStaticEvents();
    resetWizard();
    await migrateStoredTrips();
    await refreshHome();
    await refreshLocationPermissionStatus();
    if (getLocationPreference() === null) {
      await openLocationDialog({ onboarding: true });
    } else {
      updateLocationTile();
    }
  }

  init().catch(error => {
    console.error(error);
    toast('Travel Tracker konnte nicht vollständig gestartet werden.');
  });
})();
