(() => {
  'use strict';

  const Core = window.TravelTrackerCore;
  if (!Core) throw new Error('TravelTrackerCore wurde nicht geladen.');

  const { db, escapeHtml, formatDateTime, mapsCoordinatesUrl } = Core;
  const app = document.getElementById('viewerApp');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const MOTION = Object.freeze({
    introFade: reducedMotion ? 0 : 420,
    route: reducedMotion ? 0 : 1350,
    slide: reducedMotion ? 0 : 1180,
    pop: reducedMotion ? 0 : 520,
    settle: reducedMotion ? 0 : 90
  });

  const FONT_STACKS = Object.freeze({
    system: 'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    serif: 'Georgia,"Times New Roman",serif',
    rounded: '"Trebuchet MS","Arial Rounded MT Bold",Arial,sans-serif',
    hand: '"Segoe Print","Bradley Hand","Comic Sans MS",cursive',
    mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
  });

  const state = {
    trip: null,
    goals: [],
    current: 0,
    started: false,
    animating: false,
    swipeStartX: null,
    swipeStartY: null
  };

  const wait = ms => ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();

  function setViewportSize() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--viewport-h', `${Math.round(viewport?.height || window.innerHeight)}px`);
    document.documentElement.style.setProperty('--viewport-w', `${Math.round(viewport?.width || window.innerWidth)}px`);
  }

  function showError(message) {
    app.style.removeProperty('--bg-image');
    app.innerHTML = `<section class="viewer-message"><div><strong>Reise konnte nicht geöffnet werden.</strong><p>${escapeHtml(message)}</p><p><a href="index.html">Zurück zu Travel Tracker</a></p></div></section>`;
  }

  async function loadTrip() {
    const embedded = document.getElementById('embeddedTripData');
    if (embedded) {
      try { return JSON.parse(embedded.textContent); }
      catch { throw new Error('Die eingebetteten Reisedaten sind beschädigt.'); }
    }
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('Es wurde keine Reise-ID übergeben.');
    const trip = await db.getTrip(id);
    if (!trip) throw new Error('Diese Reise ist in diesem Browser nicht gespeichert. Öffne sie auf dem Gerät, auf dem sie erstellt wurde.');
    return trip;
  }

  function backgroundValue(trip) {
    return trip.customBackground
      ? `url("${trip.customBackground}") center/cover no-repeat`
      : (trip.backgroundCss || 'linear-gradient(135deg,#506780,#b19357)');
  }

  function fontStack(goal) {
    return FONT_STACKS[goal?.fontKey] || FONT_STACKS.system;
  }

  function locationLink(goal) {
    const data = goal?.location;
    if (!data) return '';
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    const text = String(data.label || 'Ort in Google Maps ansehen');
    return `<a class="location-chip" href="${escapeHtml(mapsCoordinatesUrl(lat, lng))}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
  }

  function renderDecorations() {
    const items = Array.isArray(state.trip?.decorations) ? state.trip.decorations : [];
    if (!items.length) return '';
    return `<div class="viewer-decorations" aria-hidden="true">${items.map(item => `<span style="left:${Number(item.x) || 50}%;top:${Number(item.y) || 50}%;font-size:${Math.max(18, Math.min(80, Number(item.size) || 42))}px;transform:translate(-50%,-50%) rotate(${Number(item.rotation) || 0}deg)">${escapeHtml(item.emoji || '⭐')}</span>`).join('')}</div>`;
  }

  function routeSvg(index) {
    const routes = [
      ['first', 'M-7 10 C8 8 13 27 18 39 C24 55 37 47 50 58'],
      ['in-forward', 'M-7 52 C8 39 16 66 29 60 C37 56 43 55 50 58'],
      ['in-back', 'M107 52 C92 39 84 66 71 60 C63 56 57 55 50 58'],
      ['out-forward', 'M50 58 C60 67 69 43 80 48 C91 53 94 69 107 54'],
      ['out-back', 'M50 58 C40 67 31 43 20 48 C9 53 6 69 -7 54']
    ];
    return `<svg class="journey-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${routes.map(([name, path]) => {
      const maskId = `route-${index}-${name}-mask`;
      return `<g class="route-group" data-route="${name}"><defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><path class="route-mask" pathLength="100" d="${path}"/></mask></defs><path class="route-dashes" pathLength="100" d="${path}" mask="url(#${maskId})"/></g>`;
    }).join('')}</svg>`;
  }

  function renderSlide(goal, index) {
    const info = String(goal.info || '').trim();
    const date = formatDateTime(goal.capturedAt);
    const location = locationLink(goal);
    return `<section class="slide" data-index="${index}">
      ${routeSvg(index)}
      <div class="slide-content">
        <header class="destination-title"><span>ZIEL ${index + 1}</span><h2 style="color:${goal.titleColor || '#fff'};font-family:${fontStack(goal)}">${escapeHtml(goal.name || `Ziel ${index + 1}`)}</h2></header>
        <div class="slide-center"><div class="content-stack${info ? ' has-info' : ''}">
          <article class="memory-card"><div class="photo-wrap"><button class="photo-open" type="button" data-photo-index="${index}" aria-label="Foto vergrößern"><img src="${goal.photo}" alt="${escapeHtml(goal.name || `Ziel ${index + 1}`)}"></button>${location}</div>${date ? `<div class="date-row">${escapeHtml(date)}</div>` : ''}</article>
          ${info ? `<section class="info-panel"><p style="color:${goal.infoColor || '#344054'}">${escapeHtml(info)}</p></section>` : ''}
        </div></div>
        <footer class="viewer-footer">Travel Tracker · Erinnerungen, die bleiben</footer>
      </div>
    </section>`;
  }

  function buildViewer() {
    state.goals = (state.trip.goals || []).filter(goal => goal?.photo);
    if (!state.goals.length) { showError('Die Reise enthält noch keine Fotos.'); return; }

    document.title = `${state.trip.title || 'Reise'} · Travel Tracker`;
    app.style.setProperty('--bg-image', backgroundValue(state.trip));
    const people = (state.trip.participants || []).filter(Boolean).join(', ') || 'uns';

    app.innerHTML = `${renderDecorations()}
      <section class="intro-screen" id="introScreen"><div class="welcome"><div class="eyebrow">TRAVEL TRACKER</div><h1>Willkommen auf der Reise von</h1><h2>${escapeHtml(people)}</h2><p>${escapeHtml(state.trip.title || 'Unsere Reise')}</p><button class="start-btn" id="startJourneyBtn" type="button">Reise ansehen →</button></div></section>
      <section class="journey-screen" id="journeyScreen">
        <div class="slider-viewport" id="sliderViewport"><div class="slider-track" id="sliderTrack">${state.goals.map(renderSlide).join('')}</div></div>
        <nav class="viewer-nav" aria-label="Reisenavigation"><button class="nav-arrow prev" id="prevBtn" type="button" aria-label="Vorheriges Ziel">‹</button><button class="nav-arrow next" id="nextBtn" type="button" aria-label="Nächstes Ziel">›</button></nav>
        <div class="counter-pill" id="counterPill">1 / ${state.goals.length}</div>
      </section>
      <div class="lightbox" id="lightbox" aria-hidden="true" role="dialog" aria-modal="true"><button class="lightbox-close" id="lightboxClose" type="button" aria-label="Foto schließen">×</button><img id="lightboxImage" alt="Vergrößertes Reisefoto"></div>`;

    bindViewerEvents();
    const track = document.getElementById('sliderTrack');
    if (track) track.style.transform = 'translate3d(0,0,0)';
    updateNavigation();
  }

  function getSlide(index) {
    return document.querySelector(`.slide[data-index="${index}"]`);
  }

  function setSlideContentVisible(slide, visible, popping = false) {
    if (!slide) return;
    slide.classList.toggle('content-visible', visible);
    slide.classList.toggle('content-popping', visible && popping && !reducedMotion);
    if (visible && popping && !reducedMotion) {
      setTimeout(() => slide.classList.remove('content-popping'), MOTION.pop + 80);
    }
  }

  function clearRoutes(slide) {
    if (!slide) return;
    slide.querySelectorAll('.route-group').forEach(group => group.classList.remove('route-active', 'route-draw'));
  }

  async function drawRoute(slide, routeName) {
    if (!slide) return;
    const group = slide.querySelector(`.route-group[data-route="${routeName}"]`);
    if (!group) return;
    group.classList.remove('route-active', 'route-draw');
    void group.getBoundingClientRect();
    group.classList.add('route-active');
    if (reducedMotion) {
      group.classList.add('route-draw');
      return;
    }
    requestAnimationFrame(() => group.classList.add('route-draw'));
    await wait(MOTION.route);
  }

  function updateNavigation() {
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    const counter = document.getElementById('counterPill');
    if (!prev || !next || !counter) return;
    prev.hidden = !state.started || state.current === 0;
    next.hidden = !state.started || state.current === state.goals.length - 1;
    prev.disabled = state.animating;
    next.disabled = state.animating;
    counter.textContent = `${state.current + 1} / ${state.goals.length}`;
    counter.classList.toggle('visible', state.started);
  }

  async function startJourney() {
    if (state.started || state.animating) return;
    state.started = true;
    state.animating = true;
    updateNavigation();

    document.getElementById('introScreen')?.classList.add('hidden-view');
    document.getElementById('journeyScreen')?.classList.add('active');
    await wait(MOTION.introFade);

    const first = getSlide(0);
    clearRoutes(first);
    setSlideContentVisible(first, false);
    await drawRoute(first, 'first');
    first.dataset.entryRoute = 'first';
    setSlideContentVisible(first, true, true);
    await wait(MOTION.pop);

    state.animating = false;
    updateNavigation();
  }

  async function move(delta) {
    if (!state.started || state.animating) return;
    const nextIndex = Math.max(0, Math.min(state.goals.length - 1, state.current + delta));
    if (nextIndex === state.current) return;

    state.animating = true;
    updateNavigation();

    const direction = delta > 0 ? 'forward' : 'back';
    const currentSlide = getSlide(state.current);
    const targetSlide = getSlide(nextIndex);

    // Falls dieselbe Kartenseite gerade als Ein- und Ausgang dienen würde,
    // wird der alte Anfahrtsweg ausgeblendet. So entsteht beim Zurückgehen keine
    // doppelte Schleife auf derselben Bildschirmseite.
    const entryRoute = currentSlide?.dataset.entryRoute || '';
    const exitsOnEntrySide = (direction === 'forward' && entryRoute === 'in-back') ||
      (direction === 'back' && (entryRoute === 'in-forward' || entryRoute === 'first'));
    if (exitsOnEntrySide) clearRoutes(currentSlide);

    // Der Weg verlässt zuerst sichtbar die aktuelle Erinnerung.
    await drawRoute(currentSlide, direction === 'forward' ? 'out-forward' : 'out-back');

    // Das Ziel wird zunächst ohne Karte eingeblendet. Die Linie führt während des
    // gemächlichen Slider-Wechsels vom Bildschirmrand bis zur neuen Erinnerung.
    clearRoutes(targetSlide);
    setSlideContentVisible(targetSlide, false);
    const targetEntryRoute = direction === 'forward' ? 'in-forward' : 'in-back';
    targetSlide.dataset.entryRoute = targetEntryRoute;
    const targetRoutePromise = drawRoute(targetSlide, targetEntryRoute);

    const track = document.getElementById('sliderTrack');
    state.current = nextIndex;
    if (track) track.style.transform = `translate3d(${-state.current * 100}%,0,0)`;
    document.getElementById('counterPill').textContent = `${state.current + 1} / ${state.goals.length}`;

    await Promise.all([targetRoutePromise, wait(MOTION.slide)]);
    await wait(MOTION.settle);
    setSlideContentVisible(targetSlide, true, true);
    await wait(MOTION.pop);

    state.animating = false;
    updateNavigation();
  }

  function openLightbox(index) {
    if (state.animating) return;
    const goal = state.goals[index];
    if (!goal) return;
    const image = document.getElementById('lightboxImage');
    image.src = goal.photo;
    image.alt = goal.name || `Ziel ${index + 1}`;
    const box = document.getElementById('lightbox');
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    const box = document.getElementById('lightbox');
    if (!box?.classList.contains('open')) return;
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
  }

  function handleClick(event) {
    if (event.target.closest('#startJourneyBtn')) { void startJourney(); return; }
    if (event.target.closest('#prevBtn')) { void move(-1); return; }
    if (event.target.closest('#nextBtn')) { void move(1); return; }
    const photo = event.target.closest('[data-photo-index]');
    if (photo) { openLightbox(Number(photo.dataset.photoIndex)); return; }
    if (event.target.closest('#lightboxClose') || event.target.id === 'lightbox') closeLightbox();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') { closeLightbox(); return; }
    if (!state.started || state.animating) return;
    if (event.key === 'ArrowRight') void move(1);
    if (event.key === 'ArrowLeft') void move(-1);
  }

  function pointerDown(event) {
    if (!state.started || state.animating || event.button > 0) return;
    state.swipeStartX = event.clientX;
    state.swipeStartY = event.clientY;
  }

  function pointerUp(event) {
    if (state.swipeStartX == null || state.swipeStartY == null || state.animating) return;
    const dx = event.clientX - state.swipeStartX;
    const dy = event.clientY - state.swipeStartY;
    state.swipeStartX = null;
    state.swipeStartY = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) void move(dx < 0 ? 1 : -1);
  }

  function bindViewerEvents() {
    app.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeydown);
    const viewport = document.getElementById('sliderViewport');
    viewport.addEventListener('pointerdown', pointerDown, { passive: true });
    viewport.addEventListener('pointerup', pointerUp, { passive: true });
    viewport.addEventListener('pointercancel', () => {
      state.swipeStartX = null;
      state.swipeStartY = null;
    }, { passive: true });
  }

  async function init() {
    setViewportSize();
    state.trip = await loadTrip();
    buildViewer();
  }

  window.addEventListener('resize', setViewportSize);
  window.visualViewport?.addEventListener('resize', setViewportSize);
  window.visualViewport?.addEventListener('scroll', setViewportSize);
  window.addEventListener('orientationchange', () => setTimeout(setViewportSize, 120));

  init().catch(error => {
    console.error(error);
    showError(error.message || 'Unbekannter Fehler.');
  });
})();
