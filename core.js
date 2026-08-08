(() => {
  'use strict';

  const DB_NAME = 'travelTrackerDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'trips';

  let dbPromise = null;

  function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden.'));
      };
    });

    return dbPromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Datenbankabfrage fehlgeschlagen.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Datenbanktransaktion fehlgeschlagen.'));
      transaction.onabort = () => reject(transaction.error || new Error('Datenbanktransaktion wurde abgebrochen.'));
    });
  }

  async function getTrip(id) {
    if (!id) return null;
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(tx.objectStore(STORE_NAME).get(id));
    return result || null;
  }

  async function getAllTrips() {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(tx.objectStore(STORE_NAME).getAll());
    return Array.isArray(result) ? result : [];
  }

  async function putTrip(trip) {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(trip);
    await transactionDone(tx);
    return trip;
  }

  async function putTrips(trips) {
    if (!trips?.length) return;
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    trips.forEach(trip => store.put(trip));
    await transactionDone(tx);
  }

  async function deleteTrip(id) {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await transactionDone(tx);
  }

  function createId() {
    return crypto.randomUUID?.() || `tt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]);
  }

  function deepClone(value) {
    return typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Datei konnte nicht gelesen werden.'));
      reader.readAsDataURL(blob);
    });
  }

  function nowLocalDateTimeInput() {
    return toLocalDateTimeInput(new Date().toISOString());
  }

  function toLocalDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromLocalDateTimeInput(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const time = date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${day} · ${time} Uhr`;
  }

  function mapsSearchUrl(place) {
    const query = String(place || '').trim();
    return query
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
      : 'https://www.google.com/maps';
  }

  function normalizeMapsUrl(value, place = '') {
    const candidate = String(value || '').trim();
    if (candidate) {
      try {
        const url = new URL(candidate);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      } catch {
        // Fall back to a Maps search URL below.
      }
    }
    return mapsSearchUrl(place);
  }


  function mapsCoordinatesUrl(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'https://www.google.com/maps';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat.toFixed(7)},${lng.toFixed(7)}`)}`;
  }

  function slugify(value) {
    return String(value || 'reise')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'reise';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.TravelTrackerCore = Object.freeze({
    db: Object.freeze({
      getTrip,
      getAllTrips,
      putTrip,
      putTrips,
      deleteTrip
    }),
    createId,
    escapeHtml,
    deepClone,
    readAsDataURL,
    nowLocalDateTimeInput,
    toLocalDateTimeInput,
    fromLocalDateTimeInput,
    formatDateTime,
    mapsSearchUrl,
    mapsCoordinatesUrl,
    normalizeMapsUrl,
    slugify,
    downloadBlob
  });
})();
