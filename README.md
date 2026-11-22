# PaperTrail — Document Location & Renewal Tracker

A private, offline-first website that remembers where your important
documents are stored, when they expire, and which ones need renewal.
It tracks document information and locations, not the actual files.

## Features

- **Dashboard** — Total Documents, Expiring Soon, Expired, No Expiry Date,
  plus up to five documents needing attention, nearest expiry first.
- **My Documents** — add, edit, duplicate, and delete records. Each record
  has a name, category (Identity, Education, Employment, Banking, Medical,
  Vehicle, Property, Other), optional reference, issue date, expiry date,
  storage location, and notes.
- **Expiry tracking** — Expired, Expiring Soon, Valid, and No Expiry,
  calculated from the browser's local calendar date. A document expiring
  today is still valid through today and shows in the attention list.
  An expiry date earlier than the issue date is rejected.
- **Locations** — create physical or digital storage locations
  (a drawer, a folder, a safe, a drive) and assign documents to them.
  Deleting a location leaves its documents intact and unassigned.
- **Search, filters, sorting** — search by name or reference; filter by
  category, location, and status; sort by nearest expiry, name A–Z,
  or recently added.
- **Settings** — expiry warning window (7/14/30/60/90 days), light/dark/
  system theme, JSON backup export with validated restore, CSV export
  of the document list, and delete-all (type DELETE to confirm).
- **Privacy** — everything is stored in the browser (localStorage).
  No accounts, no servers, no external requests, no tracking.
  Works offline via a service worker.

## Run locally

Open `index.html` directly, or serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/

## Tests

```sh
node tests/papertrail-unit.js      # date, status, validation, backup logic
node tests/papertrail-test.js      # full browser acceptance suite (headless Firefox)
node tests/papertrail-offline.js   # service worker + offline behaviour
node tests/papertrail-live-check.js # live GitHub Pages smoke check
```

## Files

- `index.html` — app shell and all four views
- `styles.css` — styling, light/dark themes, responsive layout
- `app.js` — UI, CRUD, filters, theme, export/import
- `storage.js` — localStorage wrapper with in-memory fallback
- `date-utils.js` — local-date parsing, status, and validation
- `backup.js` — JSON backup build/validate, CSV export
- `sw.js` — offline app-shell cache
