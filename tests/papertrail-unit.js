/* PaperTrail Node unit checks for date-utils.js and backup.js.
   Usage: node tests/papertrail-unit.js */
const D = require('../date-utils.js');
const BK = require('../backup.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; failures.push(name); console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}

// --- date validity ---
check('valid date', D.isValidDateStr('2026-11-22'));
check('reject month 13', !D.isValidDateStr('2026-13-01'));
check('reject Feb 30', !D.isValidDateStr('2026-02-30'));
check('accept Feb 29 leap', D.isValidDateStr('2024-02-29'));
check('reject Feb 29 non-leap', !D.isValidDateStr('2027-02-29'));
check('reject garbage', !D.isValidDateStr('not-a-date'));
check('reject empty', !D.isValidDateStr(''));
check('reject null', !D.isValidDateStr(null));
check('leap 2024', D.isLeapYear(2024));
check('not leap 2027', !D.isLeapYear(2027));
check('leap 2000', D.isLeapYear(2000));
check('not leap 1900', !D.isLeapYear(1900));
check('days in Feb 2027', D.daysInMonth(2027, 2) === 28);
check('days in Feb 2024', D.daysInMonth(2024, 2) === 29);

// --- arithmetic / comparison ---
check('add 7 days', D.addDays('2026-11-22', 7) === '2026-11-29');
check('add days over month', D.addDays('2026-11-28', 5) === '2026-12-03');
check('add days over year', D.addDays('2026-12-30', 5) === '2027-01-04');
check('add negative days', D.addDays('2026-11-22', -22) === '2026-10-31');
check('compare earlier', D.compareDates('2026-11-20', '2026-11-21') === -1);
check('compare equal', D.compareDates('2026-11-21', '2026-11-21') === 0);
check('compare later', D.compareDates('2026-11-22', '2026-11-21') === 1);
check('days between', D.daysBetween('2026-11-21', '2026-11-28') === 7);
check('days between negative', D.daysBetween('2026-11-28', '2026-11-21') === -7);
check('days between same', D.daysBetween('2026-11-21', '2026-11-21') === 0);
check('days between bad input null', D.daysBetween('2026-02-30', '2026-11-21') === null);
check('format date', D.formatDate('2026-11-22') === 'Nov 22, 2026');
check('format invalid passthrough', D.formatDate('junk') === 'junk');

// --- document status (today 2026-11-22, threshold 30) ---
const TODAY = '2026-11-22';
const T = 30;
function doc(expiryDate, extra) {
  return Object.assign({ id: 'd1', name: 'Passport', category: 'Identity', reference: '', issueDate: null, expiryDate: expiryDate, locationId: null, notes: '', createdAt: '' }, extra || {});
}
check('status no expiry', D.documentStatus(doc(null), TODAY, T) === 'No Expiry');
check('status expired yesterday', D.documentStatus(doc('2026-11-21'), TODAY, T) === 'Expired');
check('status expired long ago', D.documentStatus(doc('2025-01-01'), TODAY, T) === 'Expired');
check('status expiring today counts as soon', D.documentStatus(doc('2026-11-22'), TODAY, T) === 'Expiring Soon');
check('status expiring tomorrow', D.documentStatus(doc('2026-11-23'), TODAY, T) === 'Expiring Soon');
check('status expiring in 30 days', D.documentStatus(doc('2026-12-22'), TODAY, T) === 'Expiring Soon');
check('status valid at 31 days', D.documentStatus(doc('2026-12-23'), TODAY, T) === 'Valid');
check('status threshold 7: 8 days is valid', D.documentStatus(doc('2026-11-30'), TODAY, 7) === 'Valid');
check('status threshold 7: 7 days is soon', D.documentStatus(doc('2026-11-29'), TODAY, 7) === 'Expiring Soon');
check('days until expiry today 0', D.daysUntilExpiry(doc('2026-11-22'), TODAY) === 0);
check('days until expiry past -1', D.daysUntilExpiry(doc('2026-11-21'), TODAY) === -1);
check('days until expiry none null', D.daysUntilExpiry(doc(null), TODAY) === null);

// --- document validation ---
const good = doc('2027-11-22', { issueDate: '2022-11-22' });
check('document ok', D.validateDocument(good, TODAY).length === 0);
check('document no dates ok', D.validateDocument(doc(null), TODAY).length === 0);
check('name 1 char rejected', D.validateDocument(doc(null, { name: 'x' }), TODAY).length === 1);
check('name 101 chars rejected', D.validateDocument(doc(null, { name: 'a'.repeat(101) }), TODAY).length === 1);
check('bad category rejected', D.validateDocument(doc(null, { category: 'Pets' }), TODAY).length === 1);
check('expiry before issue rejected', D.validateDocument(doc('2022-01-01', { issueDate: '2022-06-01' }), TODAY).length === 1);
check('expiry equal issue ok', D.validateDocument(doc('2022-06-01', { issueDate: '2022-06-01' }), TODAY).length === 0);
check('bad expiry date rejected', D.validateDocument(doc('2026-02-30'), TODAY).length === 1);
check('bad issue date rejected', D.validateDocument(doc(null, { issueDate: '2026-13-01' }), TODAY).length === 1);
check('reference 101 chars rejected', D.validateDocument(doc(null, { reference: 'r'.repeat(101) }), TODAY).length === 1);
check('notes 501 chars rejected', D.validateDocument(doc(null, { notes: 'n'.repeat(501) }), TODAY).length === 1);

// --- backup build / validate ---
const loc = { id: 'loc-1', name: 'Home drawer', kind: 'physical', notes: '', createdAt: '2026-11-22T00:00:00.000Z' };
const docs = [Object.assign({}, good, { id: 'doc-1', locationId: 'loc-1' }), doc(null, { id: 'doc-2', name: 'Birth certificate' })];
const settings = { thresholdDays: 14, theme: 'dark' };
const exp = BK.buildExport(docs, [loc], settings);
check('export app tag', exp.app === 'PaperTrail');
check('export schema 1', exp.schemaVersion === 1);
check('export keeps docs', exp.documents.length === 2);
check('export keeps settings', exp.settings.theme === 'dark' && exp.settings.thresholdDays === 14);

const valid = BK.validateImport(JSON.parse(JSON.stringify(exp)), TODAY);
check('valid backup imports', valid.ok && valid.errors.length === 0);
check('valid backup keeps 2 docs', valid.documents.length === 2);
check('valid backup keeps location', valid.locations.length === 1);

check('reject non-JSON', !BK.parseAndValidate('{oops', TODAY).ok);
check('reject empty string', !BK.parseAndValidate('', TODAY).ok);
check('reject wrong app', !BK.validateImport({ app: 'Other', schemaVersion: 1, documents: [], locations: [] }, TODAY).ok);
check('reject schema 99', !BK.validateImport({ app: 'PaperTrail', schemaVersion: 99, documents: [], locations: [] }, TODAY).ok);
check('reject missing docs list', !BK.validateImport({ app: 'PaperTrail', schemaVersion: 1, locations: [] }, TODAY).ok);
const dup = JSON.parse(JSON.stringify(exp));
dup.documents.push(Object.assign({}, dup.documents[0]));
check('reject duplicate doc ids', !BK.validateImport(dup, TODAY).ok);
const badDate = JSON.parse(JSON.stringify(exp));
badDate.documents[0].expiryDate = '2026-02-30';
check('reject invalid expiry in backup', !BK.validateImport(badDate, TODAY).ok);
const badRange = JSON.parse(JSON.stringify(exp));
badRange.documents[0].issueDate = '2027-01-01';
badRange.documents[0].expiryDate = '2026-01-01';
check('reject expiry before issue in backup', !BK.validateImport(badRange, TODAY).ok);
const orphan = JSON.parse(JSON.stringify(exp));
orphan.locations = [];
const orphanRes = BK.validateImport(orphan, TODAY);
check('orphan doc location becomes unassigned', orphanRes.ok && orphanRes.documents[0].locationId === null);
const badSettings = JSON.parse(JSON.stringify(exp));
badSettings.settings = { thresholdDays: 999, theme: 'pink' };
const bsRes = BK.validateImport(badSettings, TODAY);
check('bad settings fall back to defaults', bsRes.ok && bsRes.settings.thresholdDays === 30 && bsRes.settings.theme === 'system');

// --- CSV ---
const csv = BK.toCSV(docs, [loc], TODAY);
check('csv header', csv.split('\r\n')[0].indexOf('"Name","Category"') === 0);
check('csv has 2 rows', csv.split('\r\n').length === 3);
check('csv formula neutralised', BK.toCSV([doc(null, { id: 'd9', name: '=2+2' })], [], TODAY).indexOf('"\'=2+2"') !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('Failures: ' + failures.join('; ')); process.exit(1); }
