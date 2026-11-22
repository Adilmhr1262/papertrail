/* PaperTrail backup: JSON export and validated import.
   Import validates the WHOLE file before anything is replaced, so a bad
   file can never wipe good data. Pure logic, no DOM, Node-testable. */
(function () {
  'use strict';

  var D = null;
  if (typeof require !== 'undefined') { try { D = require('./date-utils.js'); } catch (e) { D = null; } }
  if (!D && typeof window !== 'undefined') D = window.PTDate;

  var SCHEMA_VERSION = 1;

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function buildExport(documents, locations, settings) {
    return {
      app: 'PaperTrail',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      documents: documents || [],
      locations: locations || [],
      settings: settings || { thresholdDays: 30, theme: 'system' }
    };
  }

  /* Validate a parsed backup object. Returns { ok, errors[], documents, locations, settings }. */
  function validateImport(data, today) {
    var errors = [];
    var out = { ok: false, errors: errors, documents: [], locations: [], settings: null };
    if (!isPlainObject(data)) { errors.push('Backup file is not a valid PaperTrail backup.'); return out; }
    if (data.app !== 'PaperTrail') errors.push('Backup file is not from PaperTrail.');
    if (data.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported backup version: ' + String(data.schemaVersion) + '.');
    if (!Array.isArray(data.documents)) errors.push('Backup is missing a documents list.');
    if (!Array.isArray(data.locations)) errors.push('Backup is missing a locations list.');
    if (errors.length) return out;

    var seenDocIds = {};
    var cleanDocs = [];
    data.documents.forEach(function (doc, i) {
      var label = 'Document #' + (i + 1);
      if (!isPlainObject(doc)) { errors.push(label + ' is not an object.'); return; }
      if (typeof doc.id !== 'string' || !doc.id) { errors.push(label + ' has no id.'); return; }
      if (seenDocIds[doc.id]) { errors.push(label + ' has a duplicate id: ' + doc.id + '.'); return; }
      seenDocIds[doc.id] = true;
      var errs = D.validateDocument(doc, today);
      if (errs.length) { errors.push(label + ' (' + (doc.name || 'unnamed') + '): ' + errs.join(' ')); return; }
      cleanDocs.push({
        id: doc.id,
        name: String(doc.name).trim(),
        category: doc.category,
        reference: typeof doc.reference === 'string' ? doc.reference : '',
        issueDate: doc.issueDate || null,
        expiryDate: doc.expiryDate || null,
        locationId: typeof doc.locationId === 'string' ? doc.locationId : null,
        notes: typeof doc.notes === 'string' ? doc.notes : '',
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : ''
      });
    });

    var seenLocIds = {};
    var cleanLocs = [];
    data.locations.forEach(function (loc, i) {
      var label = 'Location #' + (i + 1);
      if (!isPlainObject(loc)) { errors.push(label + ' is not an object.'); return; }
      if (typeof loc.id !== 'string' || !loc.id) { errors.push(label + ' has no id.'); return; }
      if (seenLocIds[loc.id]) { errors.push(label + ' has a duplicate id: ' + loc.id + '.'); return; }
      seenLocIds[loc.id] = true;
      if (typeof loc.name !== 'string' || loc.name.trim().length < 2) { errors.push(label + ' has an invalid name.'); return; }
      if (loc.name.trim().length > 100) { errors.push(label + ' name is too long.'); return; }
      if (loc.kind != null && loc.kind !== '' && ['physical', 'digital'].indexOf(loc.kind) === -1) { errors.push(label + ' has an unknown kind.'); return; }
      cleanLocs.push({
        id: loc.id,
        name: loc.name.trim(),
        kind: loc.kind || '',
        notes: typeof loc.notes === 'string' ? loc.notes : '',
        createdAt: typeof loc.createdAt === 'string' ? loc.createdAt : ''
      });
    });

    /* Documents pointing at a location that is not in the backup become unassigned. */
    var locIds = {};
    cleanLocs.forEach(function (l) { locIds[l.id] = true; });
    cleanDocs.forEach(function (d) { if (d.locationId && !locIds[d.locationId]) d.locationId = null; });

    var settings = { thresholdDays: 30, theme: 'system' };
    if (isPlainObject(data.settings)) {
      var t = data.settings.thresholdDays;
      if (typeof t === 'number' && [7, 14, 30, 60, 90].indexOf(t) !== -1) settings.thresholdDays = t;
      var th = data.settings.theme;
      if (['light', 'dark', 'system'].indexOf(th) !== -1) settings.theme = th;
    }

    if (errors.length) return out;
    out.ok = true;
    out.documents = cleanDocs;
    out.locations = cleanLocs;
    out.settings = settings;
    return out;
  }

  /* Parse raw file text, then validate. Returns the validateImport result. */
  function parseAndValidate(text, today) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { return { ok: false, errors: ['File is not valid JSON.'], documents: [], locations: [], settings: null }; }
    return validateImport(data, today);
  }

  /* CSV export of documents (for a spreadsheet). Neutralises formula injection. */
  function toCSV(documents, locations, today) {
    var locName = {};
    (locations || []).forEach(function (l) { locName[l.id] = l.name; });
    function cell(v) {
      var s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var lines = [['Name', 'Category', 'Reference', 'Issue date', 'Expiry date', 'Status', 'Location', 'Notes'].map(cell).join(',')];
    (documents || []).forEach(function (d) {
      lines.push([
        d.name, d.category, d.reference || '', d.issueDate || '', d.expiryDate || '',
        D.documentStatus(d, today, 30), d.locationId ? (locName[d.locationId] || 'Unassigned') : 'Unassigned',
        d.notes || ''
      ].map(cell).join(','));
    });
    return lines.join('\r\n');
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    newId: newId,
    buildExport: buildExport,
    validateImport: validateImport,
    parseAndValidate: parseAndValidate,
    toCSV: toCSV
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PTBackup = api;
})();
