(() => {
  'use strict';

  const Core = window.TravelTrackerCore;
  if (!Core) throw new Error('TravelTrackerCore wurde nicht geladen.');

  const {
    db,
    escapeHtml,
    formatDateTime,
    normalizeMapsUrl
  } = Core;

  const app = document.getElementById('viewerApp');
  const state = {
    trip: null,
    goals: [],
    current: 0,
    started: false,
    swipeStartX: null,
    swipeStartY: null
  };

  function setViewportSize() {
    const viewport = window.visualViewport;
    const height = Math.round(viewport?.height || window.innerHeight);
    const width = Math.round(viewport?.width || window.innerWidth);
    document.documentElement.style.setProperty('--viewport-h', `${height}px`);
    document.documentElement.style.setProperty('--viewport-w', `${width}px`);
  }

  function showError(message) {
    app.style.removeProperty('--bg-image');
    app.innerHTML = `<section class="viewer-message">
      <div>
        <strong>Reise konnte nicht geöffnet werden.</strong>
        <p>${escapeHtml(message)}</p>
        <p><a href="index.html">Zurück zu Travel Tracker</a></p>
      </div>
    </section>`;
  }

  async function loadTrip() {
    const embedded = document.getElementById('embeddedTripData');
    if (embedded) {
      try {
        return JSON.parse(embedded.textContent);
      } catch {
        throw new Error('Die eingebetteten Reisedaten sind beschädigt.');
      }
    }

    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('Es wurde keine Reise-ID übergeben.');

    const trip = await db.getTrip(id);
    if (!trip) {
      throw new Error('Diese Reise ist in diesem Browser nicht gespeichert. Öffne sie auf dem Gerät, auf dem sie erstellt wurde.');
    }
    return trip;
  }

  function locationLink(goal) {
    const label = String(goal?.location?.label || '').trim();
    const customUrl = String(goal?.location?.mapsUrl || '').trim();
    if (!label && !customUrl) return '';

    const href = normalizeMapsUrl(customUrl, label);
    const text = label || 'Standort anzeigen';
    return `<a class="location-chip" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
  }

  function renderSlide(goal, index) {
    const info = String(goal.info || '').trim();
    const date = formatDateTime(goal.capturedAt);
    const location = locationLink(goal);

    return `<section class="slide" data-index="${index}">
      <header class="destination-title">
        <span>ZIEL ${index + 1}</span>
        <h2>${escapeHtml(goal.name || `Ziel ${index + 1}`)}</h2>
      </header>
      <div class="slide-center">
        <div class="content-stack${info ? ' has-info' : ''}">
          <article class="memory-card">
            <div class="photo-wrap">
              <button class="photo-open" type="button" data-photo-index="${index}" aria-label="Foto von ${escapeHtml(goal.name || `Ziel ${index + 1}`)} vergrößern">
                <img src="${goal.photo}" alt="${escapeHtml(goal.name || `Ziel ${index + 1}`)}">
              </button>
              ${location}
            </div>
            ${date ? `<div class="date-row">${escapeHtml(date)}</div>` : ''}
          </article>
          ${info ? `<section class="info-panel"><p>${escapeHtml(info)}</p></section>` : ''}
        </div>
      </div>
      <footer class="viewer-footer">Travel Tracker · Erinnerungen, die bleiben</footer>
      <div class="route-flare" aria-hidden="true"></div>
    </section>`;
  }

  function buildViewer() {
    const trip = state.trip;
    state.goals = (trip.goals || []).filter(goal => goal?.photo);

    if (!state.goals.length) {
      showError('Die Reise enthält noch keine Fotos.');
      return;
    }

    document.title = `${trip.title || 'Reise'} · Travel Tracker`;
    app.style.setProperty('--bg-image', trip.backgroundCss || 'linear-gradient(135deg,#506780,#b19357)');

    const people = (trip.participants || []).filter(Boolean).join(', ') || 'uns';
    const slides = state.goals.map(renderSlide).join('');

    app.innerHTML = `
      <section class="intro-screen" id="introScreen">
        <div class="welcome">
          <div class="eyebrow">TRAVEL TRACKER</div>
          <h1>Willkommen auf der Reise von</h1>
          <h2>${escapeHtml(people)}</h2>
          <p>${escapeHtml(trip.title || 'Unsere Reise')}</p>
          <button class="start-btn" id="startJourneyBtn" type="button">Reise ansehen →</button>
        </div>
      </section>
      <section class="journey-screen" id="journeyScreen">
        <div class="slider-viewport" id="sliderViewport">
          <div class="slider-track" id="sliderTrack">${slides}</div>
        </div>
        <nav class="viewer-nav" aria-label="Reisenavigation">
          <button class="nav-arrow prev" id="prevBtn" type="button" aria-label="Vorheriges Ziel">‹</button>
          <button class="nav-arrow next" id="nextBtn" type="button" aria-label="Nächstes Ziel">›</button>
        </nav>
        <div class="counter-pill" id="counterPill">1 / ${state.goals.length}</div>
      </section>
      <div class="lightbox" id="lightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Fotoansicht">
        <button class="lightbox-close" id="lightboxClose" type="button" aria-label="Foto schließen">×</button>
        <img id="lightboxImage" alt="Vergrößertes Reisefoto">
      </div>`;

    bindViewerEvents();
    renderSlider(false);
  }

  function startJourney() {
    if (state.started) return;
    state.started = true;
    document.getElementById('introScreen')?.classList.add('hidden-view');
    document.getElementById('journeyScreen')?.classList.add('active');
    animateRoute();
  }

  function move(delta) {
    const nextIndex = Math.max(0, Math.min(state.goals.length - 1, state.current + delta));
    if (nextIndex === state.current) return;
    state.current = nextIndex;
    renderSlider(true);
  }

  function renderSlider(animate) {
    const track = document.getElementById('sliderTrack');
    if (!track) return;

    track.style.transform = `translate3d(${-state.current * 100}%,0,0)`;
    document.getElementById('prevBtn').hidden = state.current === 0;
    document.getElementById('nextBtn').hidden = state.current === state.goals.length - 1;
    document.getElementById('counterPill').textContent = `${state.current + 1} / ${state.goals.length}`;

    if (animate) animateRoute();
  }

  function animateRoute() {
    const flare = document.querySelector(`.slide[data-index="${state.current}"] .route-flare`);
    if (!flare) return;
    flare.classList.remove('animate');
    void flare.offsetWidth;
    flare.classList.add('animate');
  }

  function openLightbox(index) {
    const goal = state.goals[index];
    if (!goal) return;

    const image = document.getElementById('lightboxImage');
    image.src = goal.photo;
    image.alt = goal.name || `Ziel ${index + 1}`;

    const lightbox = document.getElementById('lightbox');
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.getElementById('lightboxClose')?.focus({ preventScroll: true });
  }

  function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox?.classList.contains('open')) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
  }

  function handleViewerClick(event) {
    if (event.target.closest('#startJourneyBtn')) {
      startJourney();
      return;
    }
    if (event.target.closest('#prevBtn')) {
      move(-1);
      return;
    }
    if (event.target.closest('#nextBtn')) {
      move(1);
      return;
    }

    const photoButton = event.target.closest('[data-photo-index]');
    if (photoButton) {
      openLightbox(Number(photoButton.dataset.photoIndex));
      return;
    }

    if (event.target.closest('#lightboxClose') || event.target.id === 'lightbox') {
      closeLightbox();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeLightbox();
      return;
    }
    if (!state.started) return;
    if (event.key === 'ArrowRight') move(1);
    if (event.key === 'ArrowLeft') move(-1);
  }

  function handlePointerDown(event) {
    if (!state.started || event.button > 0) return;
    state.swipeStartX = event.clientX;
    state.swipeStartY = event.clientY;
  }

  function handlePointerUp(event) {
    if (state.swipeStartX == null || state.swipeStartY == null) return;

    const deltaX = event.clientX - state.swipeStartX;
    const deltaY = event.clientY - state.swipeStartY;
    state.swipeStartX = null;
    state.swipeStartY = null;

    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    move(deltaX < 0 ? 1 : -1);
  }

  function bindViewerEvents() {
    app.addEventListener('click', handleViewerClick);
    window.addEventListener('keydown', handleKeydown);

    const viewport = document.getElementById('sliderViewport');
    viewport.addEventListener('pointerdown', handlePointerDown, { passive: true });
    viewport.addEventListener('pointerup', handlePointerUp, { passive: true });
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
