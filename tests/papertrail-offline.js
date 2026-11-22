/* PaperTrail offline verification: service worker controls the page, the
   browser goes offline, the page reloads from cache, data entry works
   offline, and a second offline reload keeps the data.
   Usage: node tests/papertrail-offline.js */
const { firefox } = require('/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT = '/home/hatch/workspace/daily-projects/2026-11-22-papertrail';
const PORT = 8147;
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

async function bodyText(page) { return await page.evaluate(() => document.body.innerText); }
async function storedDocs(page) {
  return await page.evaluate(() => JSON.parse(localStorage.getItem('papertrail.v1.documents') || '[]'));
}

(async () => {
  const server = await serve();
  const browser = await firefox.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('requestfailed', r => failedRequests.push(r.url()));

  // 1. Online first visit: service worker registers and caches the shell
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(1500);
  const swControlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  check('service worker controls the page', swControlled);
  const swKeys = await page.evaluate(() => caches.keys());
  check('cache papertrail-v1 present', swKeys.includes('papertrail-v1'), JSON.stringify(swKeys));
  const cached = await page.evaluate(() => caches.open('papertrail-v1').then(c => c.keys()).then(ks => ks.map(k => k.url)));
  check('app shell cached', cached.some(u => u.endsWith('/index.html')) && cached.some(u => u.endsWith('/app.js')) && cached.some(u => u.endsWith('/styles.css')), JSON.stringify(cached));

  // 2. Go offline and reload: the page must load from cache
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);
  check('page loads offline', (await bodyText(page)).includes('PaperTrail'));
  check('dashboard renders offline', (await bodyText(page)).includes('Total Documents'));
  check('empty state renders offline', (await bodyText(page)).includes('Nothing needs attention'));

  // 3. Create a location and a document offline
  await page.click('.sidebar [data-view="locations"]');
  await sleep(300);
  await page.fill('#locName', 'Safe box');
  await page.selectOption('#locKind', 'physical');
  await page.click('#addLocBtn');
  await sleep(300);
  await page.click('.sidebar [data-view="documents"]');
  await sleep(300);
  await page.click('#addDocBtn');
  await page.waitForSelector('#docName:visible');
  await page.fill('#docName', 'Passport');
  await page.selectOption('#docCategory', 'Identity');
  const expiry = await page.evaluate(() => {
    const d = new Date(Date.now() + 20 * 86400000);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  });
  await page.fill('#docExpiryDate', expiry);
  await page.click('#docSaveBtn');
  await sleep(400);
  let docs = await storedDocs(page);
  check('document created offline', docs.length === 1 && docs[0].name === 'Passport');

  // 4. Second offline reload: data survives
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);
  check('page still loads offline after data entry', (await bodyText(page)).includes('PaperTrail'));
  docs = await storedDocs(page);
  check('document survives offline reload', docs.length === 1 && docs[0].name === 'Passport');
  await page.click('.sidebar [data-view="dashboard"]');
  await sleep(400);
  check('dashboard shows 1 document offline', (await page.evaluate(() => document.querySelector('#statTotal').textContent)) === '1');
  check('dashboard shows 1 expiring soon offline', (await page.evaluate(() => document.querySelector('#statSoon').textContent)) === '1');

  // 5. Cleanliness while offline
  check('zero console errors offline', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('zero page errors offline', pageErrors.length === 0, pageErrors.join(' | '));
  check('zero failed requests offline', failedRequests.length === 0, failedRequests.join(', '));

  await context.setOffline(false);
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed.' + (failures.length ? ' Failed: ' + failures.join('; ') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
