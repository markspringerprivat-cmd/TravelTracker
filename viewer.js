(() => {
  'use strict';

  const DB_NAME = 'travelTrackerDB';
  const DB_VERSION = 1;
  const STORE = 'trips';
  const app = document.getElementById('viewerApp');

  let trip = null;
  let goals = [];
  let current = 0;
  let started = false;
  let touchStartX = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getTrip(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'})} · ${d.toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'})} Uhr`;
  }

  function mapsUrl(goal) {
    const custom = goal?.location?.mapsUrl?.trim();
    if (custom) return custom;
    const place = goal?.location?.label?.trim();
    return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : '';
  }

  function setViewportHeight() {
    const h = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--viewport-h', `${Math.round(h)}px`);
  }

  function fail(message) {
    app.style.removeProperty('--bg-image');
    app.innerHTML = `<section class="viewer-message"><div><strong>Reise konnte nicht geöffnet werden.</strong><p>${esc(message)}</p><p><a href="index.html">Zurück zu Travel Tracker</a></p></div></section>`;
  }

  async function loadTrip() {
    const embedded = document.getElementById('embeddedTripData');
    if (embedded) {
      try { return JSON.parse(embedded.textContent); } catch (e) { throw new Error('Die eingebetteten Reisedaten sind beschädigt.'); }
    }
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('Es wurde keine Reise-ID übergeben.');
    const found = await getTrip(id);
    if (!found) throw new Error('Diese Reise ist in diesem Browser nicht gespeichert. Öffne sie auf dem Gerät, auf dem sie erstellt wurde.');
    return found;
  }

  function build() {
    goals = (trip.goals || []).filter(g => g.photo);
    if (!goals.length) {
      fail('Die Reise enthält noch keine Fotos.');
      return;
    }
    document.title = `${trip.title || 'Reise'} · Travel Tracker`;
    app.style.setProperty('--bg-image', trip.backgroundCss || 'linear-gradient(135deg,#506780,#b19357)');

    const people = (trip.participants || []).filter(Boolean).join(', ') || 'uns';
    const slides = goals.map((g, i) => {
      const location = g.location?.label?.trim();
      const locationLink = location ? `<a class="location-chip" href="${esc(mapsUrl(g))}" target="_blank" rel="noopener">${esc(location)}</a>` : '';
      const info = g.info?.trim() ? `<section class="info-panel"><p>${esc(g.info)}</p></section>` : '';
      const hasInfo = info ? ' has-info' : '';
      return `<section class="slide" data-index="${i}">
        <header class="destination-title"><span>ZIEL ${i+1}</span><h2>${esc(g.name || `Ziel ${i+1}`)}</h2></header>
        <div class="slide-center">
          <div class="content-stack${hasInfo}">
            <article class="memory-card">
              <div class="photo-wrap" role="button" tabindex="0" data-photo-index="${i}"><img src="${g.photo}" alt="${esc(g.name || `Ziel ${i+1}`)}">${locationLink}</div>
              <div class="date-row">${esc(formatDate(g.capturedAt))}</div>
            </article>
            ${info}
          </div>
        </div>
        <footer class="viewer-footer">Travel Tracker · Erinnerungen, die bleiben</footer>
        <div class="route-flare" aria-hidden="true"></div>
      </section>`;
    }).join('');

    app.innerHTML = `
      <section class="intro-screen" id="introScreen">
        <div class="welcome"><div class="eyebrow">TRAVEL TRACKER</div><h1>Willkommen auf der Reise von</h1><h2>${esc(people)}</h2><p>${esc(trip.title || 'Unsere Reise')}</p><button class="start-btn" id="startJourneyBtn" type="button">Reise ansehen →</button></div>
      </section>
      <section class="journey-screen" id="journeyScreen">
        <div class="slider-viewport"><div class="slider-track" id="sliderTrack">${slides}</div></div>
        <nav class="viewer-nav" aria-label="Reisenavigation"><button class="nav-arrow prev" id="prevBtn" type="button" aria-label="Vorheriges Ziel">‹</button><button class="nav-arrow next" id="nextBtn" type="button" aria-label="Nächstes Ziel">›</button></nav>
        <div class="counter-pill" id="counterPill">1 / ${goals.length}</div>
      </section>
      <div class="lightbox" id="lightbox" aria-hidden="true"><button class="lightbox-close" id="lightboxClose" type="button" aria-label="Foto schließen">×</button><img id="lightboxImage" alt="Vergrößertes Reisefoto"></div>`;

    bind();
    renderSlider(false);
  }

  function bind() {
    const intro = document.getElementById('introScreen');
    const journey = document.getElementById('journeyScreen');
    document.getElementById('startJourneyBtn').addEventListener('click', () => {
      started = true;
      intro.classList.add('hidden-view');
      journey.classList.add('active');
      animateRoute();
    });
    document.getElementById('prevBtn').addEventListener('click', () => move(-1));
    document.getElementById('nextBtn').addEventListener('click', () => move(1));

    document.querySelectorAll('.photo-wrap').forEach(el => {
      const open = () => openLightbox(Number(el.dataset.photoIndex));
      el.addEventListener('click', e => {
        if (e.target.closest('.location-chip')) return;
        open();
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });

    const lb = document.getElementById('lightbox');
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLightbox();
      if (!started) return;
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    });

    const viewport = document.querySelector('.slider-viewport');
    viewport.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0]?.clientX ?? null; }, {passive:true});
    viewport.addEventListener('touchend', e => {
      if (touchStartX == null) return;
      const endX = e.changedTouches[0]?.clientX ?? touchStartX;
      const delta = endX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) < 45) return;
      move(delta < 0 ? 1 : -1);
    }, {passive:true});
  }

  function move(delta) {
    const next = Math.max(0, Math.min(goals.length - 1, current + delta));
    if (next === current) return;
    current = next;
    renderSlider(true);
  }

  function renderSlider(animate) {
    const track = document.getElementById('sliderTrack');
    if (!track) return;
    track.style.transform = `translate3d(${-current * 100}%,0,0)`;
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    prev.hidden = current === 0;
    next.hidden = current === goals.length - 1;
    document.getElementById('counterPill').textContent = `${current + 1} / ${goals.length}`;
    if (animate) animateRoute();
  }

  function animateRoute() {
    const flare = document.querySelector(`.slide[data-index="${current}"] .route-flare`);
    if (!flare) return;
    flare.classList.remove('animate');
    void flare.offsetWidth;
    flare.classList.add('animate');
  }

  function openLightbox(index) {
    const img = document.getElementById('lightboxImage');
    img.src = goals[index].photo;
    img.alt = goals[index].name || `Ziel ${index + 1}`;
    const lb = document.getElementById('lightbox');
    lb.classList.add('open');
    lb.setAttribute('aria-hidden','false');
  }

  function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden','true');
  }

  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  window.visualViewport?.addEventListener('resize', setViewportHeight);
  window.addEventListener('orientationchange', () => setTimeout(setViewportHeight, 120));

  loadTrip().then(t => { trip = t; build(); }).catch(err => fail(err.message || 'Unbekannter Fehler.'));
})();
