/* PaperTrail verification suite (headless Firefox via playwright-core).
   Serves the project over local HTTP, then runs the order's 12-point
   acceptance checklist plus validation and edge cases.
   Usage: node tests/papertrail-test.js */
const { firefox } = require('/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT = '/home/hatch/workspace/daily-projects/2026-11-22-papertrail';
const PORT = 8146;
const BASE = 'http://127.0.0.1:' + PORT + '/index.html';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; failures.push(name); console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.join(PROJECT, urlPath);
      if (!file.startsWith(PROJECT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function statValue(page, label) {
  return await page.evaluate((lbl) => {
    const cards = Array.from(document.querySelectorAll('.stat-card'));
    const card = cards.find(c => c.querySelector('.stat-label') && c.querySelector('.stat-label').textContent.trim() === lbl);
    return card ? card.querySelector('.stat-value').textContent.trim() : null;
  }, label);
}

async function pageDate(page, offsetDays) {
  return await page.evaluate((off) => {
    const d = new Date(Date.now() + off * 86400000);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }, offsetDays);
}

async function docCount(page) {
  return await page.evaluate(() => document.querySelectorAll('#docList .doc-item').length);
}
async function bodyText(page) { return await page.evaluate(() => document.body.innerText); }
async function isVisible(page, sel) {
  return await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && !el.hidden;
  }, sel);
}

async function addLocation(page, name, kind, notes) {
  await page.click('.sidebar [data-view="locations"]');
  await sleep(250);
  await page.fill('#locName', name);
  if (kind) await page.selectOption('#locKind', kind);
  if (notes) await page.fill('#locNotes', notes);
  await page.click('#addLocBtn');
  await sleep(250);
}

async function addDocument(page, opts) {
  await page.click('.sidebar [data-view="documents"]');
  await sleep(250);
  await page.click('#addDocBtn');
  await page.waitForSelector('#docName:visible');
  await page.fill('#docName', opts.name);
  await page.selectOption('#docCategory', opts.category);
  if (opts.reference) await page.fill('#docReference', opts.reference);
  if (opts.issueDate) await page.fill('#docIssueDate', opts.issueDate);
  if (opts.expiryDate) await page.fill('#docExpiryDate', opts.expiryDate);
  if (opts.locationLabel) {
    const value = await page.evaluate((label) => {
      const sel = document.querySelector('#docLocation');
      const opt = Array.from(sel.options).find(o => o.textContent.trim() === label);
      return opt ? opt.value : null;
    }, opts.locationLabel);
    if (value) await page.selectOption('#docLocation', value);
  }
  if (opts.notes) await page.fill('#docNotes', opts.notes);
  await page.click('#docSaveBtn');
  await sleep(300);
}

(async () => {
  const server = await serve();
  let browser;
  const externalRequests = [];
  const pageErrors = [];
  const consoleErrors = [];
  try {
    browser = await firefox.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:' + PORT)) externalRequests.push(u); });
    page.on('pageerror', e => pageErrors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('dialog', d => d.dismiss());

    await page.goto(BASE, { waitUntil: 'load' });
    await sleep(600);

    // --- 1. Fresh install is completely empty ---
    check('fresh: total 0', (await statValue(page, 'Total Documents')) === '0');
    check('fresh: expiring soon 0', (await statValue(page, 'Expiring Soon')) === '0');
    check('fresh: expired 0', (await statValue(page, 'Expired')) === '0');
    check('fresh: no expiry 0', (await statValue(page, 'No Expiry Date')) === '0');
    check('fresh: dashboard empty states visible', await isVisible(page, '#attentionEmpty') && await isVisible(page, '#recentEmpty'));
    await page.click('.sidebar [data-view="locations"]');
    await sleep(250);
    check('fresh: locations empty state', await isVisible(page, '#locEmpty'));
    const freshStore = await page.evaluate(() => ({
      docs: JSON.parse(localStorage.getItem('papertrail.v1.documents') || '[]').length,
      locs: JSON.parse(localStorage.getItem('papertrail.v1.locations') || '[]').length
    }));
    check('fresh: storage starts empty', freshStore.docs === 0 && freshStore.locs === 0);

    // --- 2. Location CRUD ---
    await addLocation(page, 'Home drawer', 'physical', 'Top drawer, blue folder');
    await addLocation(page, 'Google Drive', 'digital');
    let locs = await page.evaluate(() => document.querySelectorAll('#locList .loc-item').length);
    check('locations: 2 added', locs === 2);
    check('locations: kind shown', (await bodyText(page)).includes('Physical') && (await bodyText(page)).includes('Digital'));

    // --- 3. Document CRUD with real dates ---
    const expSoon = await pageDate(page, 10);
    const expPast = await pageDate(page, -5);
    const expToday = await pageDate(page, 0);
    const issue = await pageDate(page, -365);
    await addDocument(page, { name: 'Passport', category: 'Identity', reference: 'P123456', issueDate: issue, expiryDate: expSoon, locationLabel: 'Home drawer', notes: 'In the blue folder' });
    await addDocument(page, { name: 'Driving licence', category: 'Vehicle', issueDate: issue, expiryDate: expPast, locationLabel: 'Home drawer' });
    await addDocument(page, { name: 'Degree certificate', category: 'Education', locationLabel: 'Google Drive' });
    await addDocument(page, { name: 'Insurance card', category: 'Medical', expiryDate: expToday, locationLabel: 'Google Drive' });
    check('documents: 4 added', (await docCount(page)) === 4);

    // --- 4. Dashboard totals match stored records ---
    await page.click('.sidebar [data-view="dashboard"]');
    await sleep(300);
    check('dashboard: total 4', (await statValue(page, 'Total Documents')) === '4');
    check('dashboard: expiring soon 2 (10-day + today)', (await statValue(page, 'Expiring Soon')) === '2');
    check('dashboard: expired 1', (await statValue(page, 'Expired')) === '1');
    check('dashboard: no expiry 1', (await statValue(page, 'No Expiry Date')) === '1');
    const attention = await page.evaluate(() => Array.from(document.querySelectorAll('#attentionList .attention-item .doc-name')).map(e => e.textContent.trim()));
    check('attention: expired first, then today, then 10-day', attention.length === 3 && attention[0] === 'Driving licence' && attention[1] === 'Insurance card' && attention[2] === 'Passport', attention.join(', '));
    check('attention: expires today text', (await bodyText(page)).includes('Expires today'));
    check('attention: expired days text', (await bodyText(page)).includes('Expired 5 days ago'));

    // --- 5. Validation: expiry before issue rejected ---
    await page.click('.sidebar [data-view="documents"]');
    await sleep(250);
    await page.click('#addDocBtn');
    await page.waitForSelector('#docName:visible');
    await page.fill('#docName', 'Bad dates doc');
    await page.selectOption('#docCategory', 'Other');
    await page.fill('#docIssueDate', await pageDate(page, 0));
    await page.fill('#docExpiryDate', await pageDate(page, -10));
    await page.click('#docSaveBtn');
    await sleep(300);
    const errVisible = await page.evaluate(() => { const el = document.querySelector('#docError'); return el && !el.hidden && el.textContent.includes('earlier than the issue date'); });
    const modalStillOpen = await page.evaluate(() => !document.querySelector('#docModal').hidden);
    check('validation: expiry before issue rejected with message', errVisible && modalStillOpen);
    await page.keyboard.press('Escape');
    await sleep(200);
    check('validation: bad doc not saved', (await docCount(page)) === 4);

    // --- 6. Edit: move passport expiry to +60 days -> becomes Valid ---
    const editBtn = await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('#docList .doc-item')).find(el => el.textContent.includes('Passport'));
      return !!item;
    });
    check('edit: passport row found', editBtn);
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('#docList .doc-item')).find(el => el.textContent.includes('Passport'));
      item.querySelector('[data-edit-doc]').click();
    });
    await page.waitForSelector('#docName:visible');
    await page.fill('#docExpiryDate', await pageDate(page, 60));
    await page.click('#docSaveBtn');
    await sleep(300);
    await page.click('.sidebar [data-view="dashboard"]');
    await sleep(300);
    check('edit: soon drops to 1 after expiry moved out', (await statValue(page, 'Expiring Soon')) === '1');
    check('edit: total still 4', (await statValue(page, 'Total Documents')) === '4');

    // --- 7. Duplicate ---
    await page.click('.sidebar [data-view="documents"]');
    await sleep(250);
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('#docList .doc-item')).find(el => el.textContent.includes('Degree certificate') && !el.textContent.includes('(copy)'));
      item.querySelector('[data-dup-doc]').click();
    });
    await sleep(300);
    check('duplicate: total 5', (await docCount(page)) === 5);
    check('duplicate: copy named', (await bodyText(page)).includes('Degree certificate (copy)'));

    // --- 8. Search, filters, sort ---
    await page.fill('#docSearch', 'pass');
    await sleep(250);
    check('search: "pass" finds 1', (await docCount(page)) === 1);
    await page.fill('#docSearch', '');
    await page.selectOption('#filterCategory', 'Vehicle');
    await sleep(250);
    check('filter: category Vehicle finds 1', (await docCount(page)) === 1);
    await page.selectOption('#filterCategory', '');
    await page.selectOption('#filterStatus', 'Expired');
    await sleep(250);
    check('filter: status Expired finds 1', (await docCount(page)) === 1);
    await page.selectOption('#filterStatus', '');
    await page.selectOption('#filterLocation', { label: 'Home drawer' });
    await sleep(250);
    check('filter: location Home drawer finds 2', (await docCount(page)) === 2);
    await page.selectOption('#filterLocation', '');
    await page.selectOption('#sortDocs', 'name');
    await sleep(250);
    const firstName = await page.evaluate(() => document.querySelector('#docList .doc-item .doc-name').textContent.trim());
    check('sort: name A-Z first is Degree certificate', firstName === 'Degree certificate', firstName);
    await page.selectOption('#sortDocs', 'expiry');
    await sleep(250);
    const firstByExpiry = await page.evaluate(() => document.querySelector('#docList .doc-item .doc-name').textContent.trim());
    check('sort: nearest expiry first is Driving licence', firstByExpiry === 'Driving licence', firstByExpiry);

    // --- 9. Location delete preserves documents (become unassigned) ---
    await page.click('.sidebar [data-view="locations"]');
    await sleep(250);
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('#locList .loc-item')).find(el => el.textContent.includes('Home drawer'));
      const btn = item.querySelector('[data-del-loc]');
      btn.click(); btn.click();
    });
    await sleep(300);
    check('location delete: 1 location left', (await page.evaluate(() => document.querySelectorAll('#locList .loc-item').length)) === 1);
    await page.click('.sidebar [data-view="documents"]');
    await sleep(250);
    check('location delete: docs intact (5)', (await docCount(page)) === 5);
    check('location delete: docs now unassigned', (await bodyText(page)).includes('Unassigned'));

    // --- 10. Location edit ---
    await page.click('.sidebar [data-view="locations"]');
    await sleep(250);
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('#locList .loc-item')).find(el => el.textContent.includes('Google Drive'));
      item.querySelector('[data-edit-loc]').click();
    });
    await sleep(200);
    await page.fill('#locName', 'Drive folder');
    await page.click('#addLocBtn');
    await sleep(300);
    check('location edit: renamed', (await bodyText(page)).includes('Drive folder'));

    // --- 11. Settings: threshold + theme persist after reload ---
    await page.click('.sidebar [data-view="settings"]');
    await sleep(250);
    await page.selectOption('#thresholdSelect', '7');
    await sleep(300);
    await page.click('.sidebar [data-view="dashboard"]');
    await sleep(300);
    check('threshold 7: soon still 1 (today only)', (await statValue(page, 'Expiring Soon')) === '1');
    await page.click('.sidebar [data-view="settings"]');
    await sleep(250);
    await page.check('input[name="theme"][value="dark"]');
    await sleep(300);
    check('theme: dark applied', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
    await page.reload({ waitUntil: 'load' });
    await sleep(600);
    check('persistence: theme dark after reload', await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
    check('persistence: threshold 7 after reload', await page.evaluate(() => document.querySelector('#thresholdSelect').value === '7'));
    check('persistence: total 5 after reload', (await statValue(page, 'Total Documents')) === '5');

    // --- 12. JSON export + import (valid then invalid) ---
    await page.click('.sidebar [data-view="settings"]');
    await sleep(250);
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await page.click('#exportBtn');
    const download = await downloadPromise;
    const dlPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
    check('export: valid PaperTrail backup', exported.app === 'PaperTrail' && exported.schemaVersion === 1);
    check('export: 5 docs, 1 location', exported.documents.length === 5 && exported.locations.length === 1);
    check('export: settings kept (threshold 7, dark)', exported.settings.thresholdDays === 7 && exported.settings.theme === 'dark');

    const importData = JSON.parse(JSON.stringify(exported));
    importData.documents.push({ id: 'doc-imported-1', name: 'Imported doc', category: 'Other', reference: '', issueDate: null, expiryDate: null, locationId: null, notes: '', createdAt: new Date().toISOString() });
    const importPath = '/tmp/papertrail-import-test.json';
    fs.writeFileSync(importPath, JSON.stringify(importData));
    await page.setInputFiles('#importFile', importPath);
    await sleep(500);
    await page.click('.sidebar [data-view="dashboard"]');
    await sleep(300);
    check('import: valid file adds the document (6)', (await statValue(page, 'Total Documents')) === '6');

    const badData = JSON.parse(JSON.stringify(exported));
    badData.schemaVersion = 99;
    const badPath = '/tmp/papertrail-import-bad.json';
    fs.writeFileSync(badPath, JSON.stringify(badData));
    await page.click('.sidebar [data-view="settings"]');
    await sleep(250);
    await page.setInputFiles('#importFile', badPath);
    await sleep(500);
    const importErr = await page.evaluate(() => { const el = document.querySelector('#importError'); return el && !el.hidden && el.textContent.length > 0; });
    check('import: invalid file rejected with message', importErr);
    await page.click('.sidebar [data-view="dashboard"]');
    await sleep(300);
    check('import: data intact after bad import (6)', (await statValue(page, 'Total Documents')) === '6');

    // --- 13. Delete a document (two-step) ---
    await page.click('.sidebar [data-view="documents"]');
    await sleep(250);
    await page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('#docList .doc-item')).find(el => el.textContent.includes('Imported doc'));
      const btn = item.querySelector('[data-del-doc]');
      btn.click(); btn.click();
    });
    await sleep(300);
    check('delete: document removed (5)', (await docCount(page)) === 5);

    // --- 14. Responsive: 375px bottom nav, no overflow; 1440 sidebar ---
    await page.setViewportSize({ width: 375, height: 700 });
    await sleep(400);
    const overflow375 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('responsive 375: no horizontal overflow', overflow375 <= 1, 'overflow ' + overflow375 + 'px');
    check('responsive 375: bottom nav visible', await isVisible(page, '.bottom-nav'));
    check('responsive 375: sidebar hidden', !(await isVisible(page, '.sidebar')));
    await page.setViewportSize({ width: 768, height: 900 });
    await sleep(300);
    check('responsive 768: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    await page.setViewportSize({ width: 1024, height: 800 });
    await sleep(300);
    check('responsive 1024: sidebar visible', await isVisible(page, '.sidebar'));
    check('responsive 1024: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(300);
    check('responsive 1440: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

    // --- 15. Keyboard: tab reaches nav, Esc closes modal ---
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press('Tab');
    await sleep(200);
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement;
      return el && (el.classList.contains('skip-link') || el.classList.contains('nav-item') || el.tagName === 'BUTTON');
    });
    check('keyboard: Tab moves focus to a control', focusVisible);
    await page.click('.sidebar [data-view="documents"]');
    await sleep(250);
    await page.click('#addDocBtn');
    await page.waitForSelector('#docName:visible');
    await page.keyboard.press('Escape');
    await sleep(200);
    check('keyboard: Esc closes modal', await page.evaluate(() => document.querySelector('#docModal').hidden));

    // --- 16. Clear all (gated on DELETE) ---
    await page.click('.sidebar [data-view="settings"]');
    await sleep(250);
    check('clear-all: button disabled until DELETE typed', await page.evaluate(() => document.querySelector('#clearAllBtn').disabled));
    await page.fill('#clearConfirm', 'DELETE');
    await sleep(200);
    check('clear-all: button enabled after DELETE', await page.evaluate(() => !document.querySelector('#clearAllBtn').disabled));
    await page.click('#clearAllBtn');
    await sleep(400);
    check('clear-all: total back to 0', (await statValue(page, 'Total Documents')) === '0');
    check('clear-all: locations empty again', (await page.evaluate(() => JSON.parse(localStorage.getItem('papertrail.v1.locations') || '[]').length)) === 0);

    // --- 17. Cleanliness ---
    check('no external requests', externalRequests.length === 0, externalRequests.join(', '));
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
    check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) console.log('Failures: ' + failures.join('; '));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('SUITE ERROR: ' + (e && e.stack ? e.stack : e));
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
})();
