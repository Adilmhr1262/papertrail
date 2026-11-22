/* PaperTrail app. Vanilla JS SPA: Dashboard, My Documents, Locations, Settings.
   All data lives in localStorage (with an in-memory fallback). No network. */
(function () {
  'use strict';

  var D = window.PTDate;
  var S = window.PTStorage;
  var B = window.PTBackup;

  var DEFAULT_SETTINGS = { thresholdDays: 30, theme: 'system' };

  var state = {
    documents: [],
    locations: [],
    settings: { thresholdDays: 30, theme: 'system' },
    view: 'dashboard',
    search: '',
    filterCategory: '',
    filterLocation: '',
    filterStatus: '',
    sort: 'expiry',
    editingLocationId: null,
    lastFocused: null
  };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function today() { return D.todayStr(); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function statusOf(doc) { return D.documentStatus(doc, today(), state.settings.thresholdDays); }
  function locationById(id) {
    for (var i = 0; i < state.locations.length; i++) if (state.locations[i].id === id) return state.locations[i];
    return null;
  }
  function docById(id) {
    for (var i = 0; i < state.documents.length; i++) if (state.documents[i].id === id) return state.documents[i];
    return null;
  }
  function locationName(id) {
    if (!id) return 'Unassigned';
    var loc = locationById(id);
    return loc ? loc.name : 'Unassigned';
  }
  function statusBadge(doc) {
    var st = statusOf(doc);
    var cls = st === 'Expired' ? 'badge-expired' : st === 'Expiring Soon' ? 'badge-soon' : st === 'Valid' ? 'badge-valid' : 'badge-noexpiry';
    return '<span class="badge ' + cls + '">' + esc(st) + '</span>';
  }
  function expiryText(doc) {
    if (!doc.expiryDate) return 'No expiry date';
    var days = D.daysUntilExpiry(doc, today());
    if (days === null) return 'No expiry date';
    if (days < 0) return 'Expired ' + Math.abs(days) + (Math.abs(days) === 1 ? ' day ago' : ' days ago') + ' · ' + D.formatDate(doc.expiryDate);
    if (days === 0) return 'Expires today · ' + D.formatDate(doc.expiryDate);
    if (days === 1) return 'Expires tomorrow · ' + D.formatDate(doc.expiryDate);
    return 'Expires in ' + days + ' days · ' + D.formatDate(doc.expiryDate);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3500);
  }

  function persist() {
    var okDocs = S.saveDocuments(state.documents);
    var okLocs = S.saveLocations(state.locations);
    var okSet = S.saveSettings(state.settings);
    if (!okDocs || !okLocs || !okSet) toast('Warning: browser storage is unavailable, changes may not survive a refresh.');
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    var choice = state.settings.theme || 'system';
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var radios = document.querySelectorAll('input[name="theme"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === choice;
  }

  /* ---------- navigation ---------- */
  function showView(name) {
    state.view = name;
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.toggle('is-active', views[i].id === 'view-' + name);
    var items = document.querySelectorAll('.nav-item[data-view]');
    for (var j = 0; j < items.length; j++) {
      var active = items[j].getAttribute('data-view') === name;
      items[j].classList.toggle('is-active', active);
      if (active) items[j].setAttribute('aria-current', 'page'); else items[j].removeAttribute('aria-current');
    }
    if (name === 'dashboard') renderDashboard();
    if (name === 'documents') renderDocuments();
    if (name === 'locations') renderLocations();
    if (name === 'settings') renderSettings();
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    var total = state.documents.length;
    var soon = 0, expired = 0, noExpiry = 0;
    var attention = [];
    state.documents.forEach(function (doc) {
      var st = statusOf(doc);
      if (st === 'Expired') { expired++; attention.push(doc); }
      else if (st === 'Expiring Soon') { soon++; attention.push(doc); }
      else if (st === 'No Expiry') { noExpiry++; }
    });
    $('statTotal').textContent = String(total);
    $('statSoon').textContent = String(soon);
    $('statExpired').textContent = String(expired);
    $('statNoExpiry').textContent = String(noExpiry);
    $('dashboard-date').textContent = 'Today is ' + D.formatDate(today()) + ' · warning window: ' + state.settings.thresholdDays + ' days';

    attention.sort(function (a, b) {
      var da = a.expiryDate || '9999-12-31', db = b.expiryDate || '9999-12-31';
      return D.compareDates(da, db);
    });
    var top = attention.slice(0, 5);
    $('attentionHint').textContent = attention.length ? attention.length + ' needing attention' : '';
    $('attentionEmpty').classList.toggle('is-visible', top.length === 0);
    $('attentionList').innerHTML = top.map(function (doc) {
      return '<li class="attention-item"><div><span class="doc-name"><button type="button" data-open-doc="' + esc(doc.id) + '">' + esc(doc.name) + '</button></span>' +
        '<span class="doc-meta"><span>' + esc(expiryText(doc)) + '</span><span>' + esc(locationName(doc.locationId)) + '</span></span></div>' +
        statusBadge(doc) + '</li>';
    }).join('');

    var recent = state.documents.slice().sort(function (a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }).slice(0, 3);
    $('recentEmpty').classList.toggle('is-visible', recent.length === 0);
    $('recentList').innerHTML = recent.map(function (doc) {
      return '<li class="recent-item"><div><span class="doc-name"><button type="button" data-open-doc="' + esc(doc.id) + '">' + esc(doc.name) + '</button></span>' +
        '<span class="doc-meta"><span>' + esc(doc.category) + ' · ' + esc(locationName(doc.locationId)) + '</span><span>' + esc(expiryText(doc)) + '</span></span></div>' +
        statusBadge(doc) + '</li>';
    }).join('');
  }

  /* ---------- documents ---------- */
  function filteredDocuments() {
    var q = state.search.trim().toLowerCase();
    var list = state.documents.filter(function (doc) {
      if (q && doc.name.toLowerCase().indexOf(q) === -1 && (doc.reference || '').toLowerCase().indexOf(q) === -1) return false;
      if (state.filterCategory && doc.category !== state.filterCategory) return false;
      if (state.filterLocation === '__none__') { if (doc.locationId) return false; }
      else if (state.filterLocation && doc.locationId !== state.filterLocation) return false;
      if (state.filterStatus && statusOf(doc) !== state.filterStatus) return false;
      return true;
    });
    if (state.sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (state.sort === 'recent') list.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    else list.sort(function (a, b) {
      var da = a.expiryDate || '9999-12-31', db = b.expiryDate || '9999-12-31';
      var c = D.compareDates(da, db);
      return c !== 0 ? c : a.name.localeCompare(b.name);
    });
    return list;
  }

  function renderDocuments() {
    /* location filter options */
    var sel = $('filterLocation');
    var current = state.filterLocation;
    sel.innerHTML = '<option value="">All locations</option><option value="__none__">Unassigned</option>' +
      state.locations.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
    sel.value = current;
    if (sel.value !== current) { state.filterLocation = ''; sel.value = ''; }

    var list = filteredDocuments();
    $('docCountLabel').textContent = list.length === state.documents.length
      ? state.documents.length + (state.documents.length === 1 ? ' document' : ' documents')
      : 'Showing ' + list.length + ' of ' + state.documents.length + ' documents';
    $('docEmpty').classList.toggle('is-visible', list.length === 0);
    $('docEmptyText').textContent = state.documents.length === 0
      ? 'Add a document to start tracking it.'
      : 'No documents match these filters. Try clearing the search or filters.';
    $('docList').innerHTML = list.map(function (doc) {
      var meta = [esc(doc.category)];
      if (doc.reference) meta.push('Ref: ' + esc(doc.reference));
      if (doc.issueDate) meta.push('Issued ' + esc(D.formatDate(doc.issueDate)));
      meta.push(esc(locationName(doc.locationId)));
      var notes = doc.notes ? '<p class="doc-notes">' + esc(doc.notes) + '</p>' : '';
      return '<li class="doc-item" data-doc-id="' + esc(doc.id) + '">' +
        '<div class="doc-main"><div class="doc-top"><span class="doc-name">' + esc(doc.name) + '</span>' + statusBadge(doc) + '</div>' +
        '<p class="doc-meta"><span>' + esc(expiryText(doc)) + '</span><span>' + meta.join('</span><span>') + '</span></p>' + notes + '</div>' +
        '<div class="doc-actions">' +
        '<button type="button" class="action-btn" data-edit-doc="' + esc(doc.id) + '">Edit</button>' +
        '<button type="button" class="action-btn" data-dup-doc="' + esc(doc.id) + '">Duplicate</button>' +
        '<button type="button" class="action-btn danger" data-del-doc="' + esc(doc.id) + '">Delete</button>' +
        '</div></li>';
    }).join('');
  }

  /* ---------- locations ---------- */
  function renderLocations() {
    $('locEmpty').classList.toggle('is-visible', state.locations.length === 0);
    $('locList').innerHTML = state.locations.map(function (loc) {
      var docs = state.documents.filter(function (d) { return d.locationId === loc.id; });
      var docItems = docs.length ? docs.map(function (d) {
        return '<li><button type="button" data-open-doc="' + esc(d.id) + '">' + esc(d.name) + '</button> · ' + esc(expiryText(d)) + '</li>';
      }).join('') : '<li>No documents stored here yet.</li>';
      return '<li class="loc-item" data-loc-id="' + esc(loc.id) + '">' +
        '<div class="loc-top"><div><span class="loc-name">' + esc(loc.name) + '</span>' +
        (loc.kind ? ' <span class="loc-kind">(' + (loc.kind === 'physical' ? 'Physical' : 'Digital') + ')</span>' : '') +
        (loc.notes ? '<p class="doc-notes">' + esc(loc.notes) + '</p>' : '') + '</div>' +
        '<div class="doc-actions">' +
        '<button type="button" class="action-btn" data-edit-loc="' + esc(loc.id) + '">Edit</button>' +
        '<button type="button" class="action-btn danger" data-del-loc="' + esc(loc.id) + '">Delete</button>' +
        '</div></div>' +
        '<ul class="loc-docs">' + docItems + '</ul></li>';
    }).join('');
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    $('thresholdSelect').value = String(state.settings.thresholdDays);
    $('dataSummary').textContent = state.documents.length + ' documents · ' + state.locations.length + ' locations stored on this device.';
    $('clearConfirm').value = '';
    $('clearAllBtn').disabled = true;
  }

  function renderAll() {
    renderDashboard();
    renderDocuments();
    renderLocations();
    renderSettings();
  }

  /* ---------- document modal ---------- */
  function fillLocationOptions(selectedId) {
    var sel = $('docLocation');
    sel.innerHTML = '<option value="">Unassigned</option>' +
      state.locations.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.name) + '</option>'; }).join('');
    sel.value = selectedId || '';
    if (sel.value !== (selectedId || '')) sel.value = '';
  }

  function openDocModal(doc) {
    state.lastFocused = document.activeElement;
    fillLocationOptions(doc ? doc.locationId : null);
    $('docModalTitle').textContent = doc ? 'Edit document' : 'Add document';
    $('docId').value = doc ? doc.id : '';
    $('docName').value = doc ? doc.name : '';
    $('docCategory').value = doc ? doc.category : 'Identity';
    $('docReference').value = doc ? (doc.reference || '') : '';
    $('docIssueDate').value = doc ? (doc.issueDate || '') : '';
    $('docExpiryDate').value = doc ? (doc.expiryDate || '') : '';
    $('docNotes').value = doc ? (doc.notes || '') : '';
    $('docError').hidden = true;
    $('docError').textContent = '';
    $('docModal').hidden = false;
    $('docName').focus();
  }

  function closeDocModal() {
    $('docModal').hidden = true;
    if (state.lastFocused && state.lastFocused.focus) state.lastFocused.focus();
  }

  function saveDocumentFromForm() {
    var id = $('docId').value;
    var doc = {
      id: id || B.newId('doc'),
      name: $('docName').value.trim(),
      category: $('docCategory').value,
      reference: $('docReference').value.trim(),
      issueDate: $('docIssueDate').value || null,
      expiryDate: $('docExpiryDate').value || null,
      locationId: $('docLocation').value || null,
      notes: $('docNotes').value.trim(),
      createdAt: ''
    };
    var existing = id ? docById(id) : null;
    doc.createdAt = existing ? existing.createdAt : new Date().toISOString();
    if (doc.locationId && !locationById(doc.locationId)) doc.locationId = null;
    var errors = D.validateDocument(doc, today());
    if (errors.length) {
      var el = $('docError');
      el.textContent = errors.join(' ');
      el.hidden = false;
      return;
    }
    if (existing) {
      var idx = state.documents.indexOf(existing);
      state.documents[idx] = doc;
      toast('Document updated.');
    } else {
      state.documents.push(doc);
      toast('Document added.');
    }
    persist();
    closeDocModal();
    renderAll();
  }

  function duplicateDocument(id) {
    var src = docById(id);
    if (!src) return;
    var copy = {
      id: B.newId('doc'),
      name: src.name + ' (copy)',
      category: src.category,
      reference: src.reference || '',
      issueDate: src.issueDate || null,
      expiryDate: src.expiryDate || null,
      locationId: src.locationId || null,
      notes: src.notes || '',
      createdAt: new Date().toISOString()
    };
    state.documents.push(copy);
    persist();
    renderAll();
    toast('Document duplicated.');
  }

  /* Two-step inline delete: first click arms, second click deletes. */
  function armDelete(btn, label, action) {
    if (btn.getAttribute('data-armed') === '1') {
      btn.removeAttribute('data-armed');
      btn.textContent = label;
      action();
      return;
    }
    btn.setAttribute('data-armed', '1');
    btn.textContent = 'Confirm delete?';
    setTimeout(function () {
      if (btn.isConnected) { btn.removeAttribute('data-armed'); btn.textContent = label; }
    }, 4000);
  }

  function deleteDocument(id) {
    state.documents = state.documents.filter(function (d) { return d.id !== id; });
    persist();
    renderAll();
    toast('Document deleted.');
  }

  function deleteLocation(id) {
    state.documents.forEach(function (d) { if (d.locationId === id) d.locationId = null; });
    state.locations = state.locations.filter(function (l) { return l.id !== id; });
    persist();
    renderAll();
    toast('Location deleted. Its documents are now unassigned.');
  }

  /* ---------- locations form ---------- */
  function saveLocationFromForm(e) {
    if (e) e.preventDefault();
    var name = $('locName').value.trim();
    var kind = $('locKind').value;
    var notes = $('locNotes').value.trim();
    var errEl = $('locError');
    if (name.length < 2) { errEl.textContent = 'Location name must be at least 2 characters.'; errEl.hidden = false; return; }
    if (name.length > 100) { errEl.textContent = 'Location name must be 100 characters or fewer.'; errEl.hidden = false; return; }
    if (kind && ['physical', 'digital'].indexOf(kind) === -1) { errEl.textContent = 'Location type is not recognised.'; errEl.hidden = false; return; }
    errEl.hidden = true;
    if (state.editingLocationId) {
      var loc = locationById(state.editingLocationId);
      if (loc) { loc.name = name; loc.kind = kind; loc.notes = notes; }
      state.editingLocationId = null;
      $('addLocBtn').textContent = 'Add location';
      toast('Location updated.');
    } else {
      state.locations.push({ id: B.newId('loc'), name: name, kind: kind, notes: notes, createdAt: new Date().toISOString() });
      toast('Location added.');
    }
    $('locForm').reset();
    persist();
    renderAll();
  }

  function editLocation(id) {
    var loc = locationById(id);
    if (!loc) return;
    state.editingLocationId = id;
    $('locName').value = loc.name;
    $('locKind').value = loc.kind || '';
    $('locNotes').value = loc.notes || '';
    $('addLocBtn').textContent = 'Save changes';
    $('locName').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- export / import / clear ---------- */
  function downloadFile(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function exportJSON() {
    var data = B.buildExport(state.documents, state.locations, state.settings);
    downloadFile('papertrail-backup-' + today() + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Backup exported.');
  }

  function exportCSV() {
    downloadFile('papertrail-documents-' + today() + '.csv', B.toCSV(state.documents, state.locations, today()), 'text/csv');
    toast('Document list exported.');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var result = B.parseAndValidate(String(reader.result || ''), today());
      var errEl = $('importError');
      if (!result.ok) {
        errEl.textContent = 'Import rejected: ' + result.errors.join(' ');
        errEl.hidden = false;
        return;
      }
      errEl.hidden = true;
      state.documents = result.documents;
      state.locations = result.locations;
      state.settings = result.settings;
      applyTheme();
      persist();
      renderAll();
      toast('Backup imported: ' + result.documents.length + ' documents, ' + result.locations.length + ' locations.');
    };
    reader.onerror = function () {
      var errEl = $('importError');
      errEl.textContent = 'Import rejected: the file could not be read.';
      errEl.hidden = false;
    };
    reader.readAsText(file);
  }

  function clearAll() {
    S.clearAll();
    state.documents = [];
    state.locations = [];
    state.settings = { thresholdDays: 30, theme: 'system' };
    state.editingLocationId = null;
    applyTheme();
    persist();
    renderAll();
    showView('dashboard');
    toast('All data deleted.');
  }

  /* ---------- init ---------- */
  function loadState() {
    state.documents = S.loadDocuments();
    state.locations = S.loadLocations();
    var saved = S.loadSettings();
    state.settings = saved ? {
      thresholdDays: [7, 14, 30, 60, 90].indexOf(saved.thresholdDays) !== -1 ? saved.thresholdDays : 30,
      theme: ['light', 'dark', 'system'].indexOf(saved.theme) !== -1 ? saved.theme : 'system'
    } : { thresholdDays: 30, theme: 'system' };
    /* Drop document references to locations that no longer exist. */
    var locIds = {};
    state.locations.forEach(function (l) { locIds[l.id] = true; });
    state.documents.forEach(function (d) { if (d.locationId && !locIds[d.locationId]) d.locationId = null; });
  }

  function bind() {
    document.querySelectorAll('.nav-item[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () { showView(btn.getAttribute('data-view')); });
    });

    $('dashAddDocBtn').addEventListener('click', function () { openDocModal(null); });
    $('emptyAddDocBtn').addEventListener('click', function () { openDocModal(null); });
    $('addDocBtn').addEventListener('click', function () { openDocModal(null); });
    $('docEmptyAddBtn').addEventListener('click', function () { openDocModal(null); });
    $('viewAllDocsBtn').addEventListener('click', function () { showView('documents'); });

    $('docModalClose').addEventListener('click', closeDocModal);
    $('docCancelBtn').addEventListener('click', closeDocModal);
    $('docModal').addEventListener('click', function (e) { if (e.target === $('docModal')) closeDocModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('docModal').hidden) closeDocModal(); });
    $('docForm').addEventListener('submit', function (e) { e.preventDefault(); saveDocumentFromForm(); });

    $('docSearch').addEventListener('input', function () { state.search = $('docSearch').value; renderDocuments(); });
    $('filterCategory').addEventListener('change', function () { state.filterCategory = $('filterCategory').value; renderDocuments(); });
    $('filterLocation').addEventListener('change', function () { state.filterLocation = $('filterLocation').value; renderDocuments(); });
    $('filterStatus').addEventListener('change', function () { state.filterStatus = $('filterStatus').value; renderDocuments(); });
    $('sortDocs').addEventListener('change', function () { state.sort = $('sortDocs').value; renderDocuments(); });

    /* Delegated clicks inside dynamic lists. */
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-open-doc]');
      if (t) { openDocModal(docById(t.getAttribute('data-open-doc'))); return; }
      var ed = e.target.closest('[data-edit-doc]');
      if (ed) { openDocModal(docById(ed.getAttribute('data-edit-doc'))); return; }
      var du = e.target.closest('[data-dup-doc]');
      if (du) { duplicateDocument(du.getAttribute('data-dup-doc')); return; }
      var del = e.target.closest('[data-del-doc]');
      if (del) { armDelete(del, 'Delete', function () { deleteDocument(del.getAttribute('data-del-doc')); }); return; }
      var el = e.target.closest('[data-edit-loc]');
      if (el) { editLocation(el.getAttribute('data-edit-loc')); return; }
      var dl = e.target.closest('[data-del-loc]');
      if (dl) { armDelete(dl, 'Delete', function () { deleteLocation(dl.getAttribute('data-del-loc')); }); return; }
    });

    $('locForm').addEventListener('submit', saveLocationFromForm);

    $('thresholdSelect').addEventListener('change', function () {
      state.settings.thresholdDays = parseInt($('thresholdSelect').value, 10);
      persist();
      renderAll();
      toast('Warning window updated.');
    });
    document.querySelectorAll('input[name="theme"]').forEach(function (r) {
      r.addEventListener('change', function () {
        state.settings.theme = r.value;
        applyTheme();
        persist();
      });
    });

    $('exportBtn').addEventListener('click', exportJSON);
    $('exportCsvBtn').addEventListener('click', exportCSV);
    $('importFile').addEventListener('change', function () {
      if ($('importFile').files && $('importFile').files[0]) importJSON($('importFile').files[0]);
      $('importFile').value = '';
    });
    $('clearConfirm').addEventListener('input', function () {
      $('clearAllBtn').disabled = $('clearConfirm').value.trim() !== 'DELETE';
    });
    $('clearAllBtn').addEventListener('click', clearAll);

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (state.settings.theme === 'system') applyTheme();
      });
    }
  }

  loadState();
  applyTheme();
  bind();
  renderAll();
  showView('dashboard');
  if (!S.isAvailable()) toast('Browser storage is unavailable on this device. Changes will be lost when you leave this page.');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline support is optional */ });
    });
  }
})();
