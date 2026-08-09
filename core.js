(() => {
  'use strict';

  const DB_NAME = 'travel-tracker-db';
  const DB_VERSION = 1;
  const STORE = 'trips';
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Datenbank konnte nicht geöffnet werden.'));
    });
    return dbPromise;
  }


  async function getTrip(id) {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllTrips() {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function putTrip(trip) {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(trip);
      request.onsuccess = () => resolve(trip);
      request.onerror = () => reject(request.error);
    });
  }

  async function putTrips(trips) {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      trips.forEach(trip => store.put(trip));
      transaction.oncomplete = () => resolve(trips);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function deleteTrip(id) {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
  }

  function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Datei konnte nicht gelesen werden.'));
      reader.readAsDataURL(blob);
    });
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })} · ${date.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' })} Uhr`;
  }

  function mapsCoordinatesUrl(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'https://www.google.com/maps';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat.toFixed(7)},${lng.toFixed(7)}`)}`;
  }

  function slugify(value) {
    return String(value || 'reise').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'reise';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  window.TravelTrackerCore = Object.freeze({
    db: Object.freeze({ getTrip, getAllTrips, putTrip, putTrips, deleteTrip }),
    createId, escapeHtml, readAsDataURL, formatDateTime, mapsCoordinatesUrl, slugify, downloadBlob
  });
})();
