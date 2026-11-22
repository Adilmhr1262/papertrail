/* PaperTrail storage. localStorage with an in-memory fallback when browser
   storage is unavailable (private mode, disabled storage). Never throws:
   every failure is reported through `available` and the last error. */
(function () {
  'use strict';

  var PREFIX = 'papertrail.v1.';
  var KEYS = { documents: PREFIX + 'documents', locations: PREFIX + 'locations', settings: PREFIX + 'settings' };

  var memory = {};
  var storageAvailable = null; /* null = not yet probed */
  var lastError = null;

  function probe() {
    if (storageAvailable !== null) return storageAvailable;
    try {
      var t = '__papertrail_probe__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      storageAvailable = true;
    } catch (e) {
      storageAvailable = false;
      lastError = e && e.message ? e.message : String(e);
    }
    return storageAvailable;
  }

  function readRaw(key) {
    if (probe()) {
      try { return window.localStorage.getItem(key); }
      catch (e) { lastError = e && e.message ? e.message : String(e); return memory[key] || null; }
    }
    return memory[key] || null;
  }

  function writeRaw(key, value) {
    if (probe()) {
      try { window.localStorage.setItem(key, value); return true; }
      catch (e) {
        lastError = e && e.message ? e.message : String(e);
        memory[key] = value; /* keep the session working */
        return false;
      }
    }
    memory[key] = value;
    return true;
  }

  function removeRaw(key) {
    if (probe()) {
      try { window.localStorage.removeItem(key); } catch (e) { lastError = String(e); }
    }
    delete memory[key];
  }

  function load(key, fallback) {
    var raw = readRaw(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      lastError = 'Stored data for ' + key + ' is corrupted and was ignored.';
      return fallback;
    }
  }

  function save(key, value) {
    try { return writeRaw(key, JSON.stringify(value)); }
    catch (e) { lastError = e && e.message ? e.message : String(e); return false; }
  }

  var api = {
    KEYS: KEYS,
    isAvailable: probe,
    lastError: function () { return lastError; },
    loadDocuments: function () { var v = load(KEYS.documents, []); return Array.isArray(v) ? v : []; },
    saveDocuments: function (docs) { return save(KEYS.documents, docs); },
    loadLocations: function () { var v = load(KEYS.locations, []); return Array.isArray(v) ? v : []; },
    saveLocations: function (locs) { return save(KEYS.locations, locs); },
    loadSettings: function () { var v = load(KEYS.settings, null); return v && typeof v === 'object' ? v : null; },
    saveSettings: function (s) { return save(KEYS.settings, s); },
    clearAll: function () { removeRaw(KEYS.documents); removeRaw(KEYS.locations); removeRaw(KEYS.settings); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PTStorage = api;
})();
