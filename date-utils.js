/* PaperTrail date utilities. Local calendar dates only (YYYY-MM-DD).
   Never compares with UTC dates. Works in the browser and in Node. */
(function () {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysInMonth(y, m) {
    var table = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return table[m - 1];
  }

  /* Strict YYYY-MM-DD check against the real calendar. */
  function isValidDateStr(s) {
    if (typeof s !== 'string') return false;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12) return false;
    if (d < 1 || d > daysInMonth(y, mo)) return false;
    return true;
  }

  /* Today's local date as YYYY-MM-DD. */
  function todayStr(dateObj) {
    var d = dateObj || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* Parse a valid YYYY-MM-DD into {y, m, d} or null. */
  function parseDate(s) {
    if (!isValidDateStr(s)) return null;
    var p = s.split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }

  /* Days from a to b (b - a). Negative when b is before a. */
  function daysBetween(a, b) {
    var pa = parseDate(a), pb = parseDate(b);
    if (!pa || !pb) return null;
    var ua = Date.UTC(pa.y, pa.m - 1, pa.d);
    var ub = Date.UTC(pb.y, pb.m - 1, pb.d);
    return Math.round((ub - ua) / 86400000);
  }

  /* -1, 0, 1 comparison of two YYYY-MM-DD strings. */
  function compareDates(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function addDays(dateStr, n) {
    var p = parseDate(dateStr);
    if (!p) return null;
    var d = new Date(Date.UTC(p.y, p.m - 1, p.d) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /* "Nov 22, 2026" for display. Returns the input unchanged when invalid. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatDate(s) {
    var p = parseDate(s);
    if (!p) return s || '';
    return MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y;
  }

  var CATEGORIES = ['Identity', 'Education', 'Employment', 'Banking', 'Medical', 'Vehicle', 'Property', 'Other'];

  /*
   * Document status for a given "today" (YYYY-MM-DD) and warning threshold
   * in days. Returns one of: 'Expired' | 'Expiring Soon' | 'Valid' | 'No Expiry'.
   * Expiry equal to today is still valid through today, but counts as
   * Expiring Soon so it shows in the attention list.
   */
  function documentStatus(doc, today, thresholdDays) {
    if (!doc || !doc.expiryDate) return 'No Expiry';
    if (!isValidDateStr(doc.expiryDate)) return 'No Expiry';
    var daysLeft = daysBetween(today, doc.expiryDate);
    if (daysLeft < 0) return 'Expired';
    if (daysLeft <= thresholdDays) return 'Expiring Soon';
    return 'Valid';
  }

  function daysUntilExpiry(doc, today) {
    if (!doc || !doc.expiryDate || !isValidDateStr(doc.expiryDate)) return null;
    return daysBetween(today, doc.expiryDate);
  }

  /* Validate a document record. Returns an array of error strings (empty = ok). */
  function validateDocument(doc, today) {
    var errors = [];
    if (!doc || typeof doc !== 'object') return ['Document must be an object.'];
    if (typeof doc.name !== 'string' || doc.name.trim().length < 2) errors.push('Name must be at least 2 characters.');
    if (typeof doc.name === 'string' && doc.name.trim().length > 100) errors.push('Name must be 100 characters or fewer.');
    if (CATEGORIES.indexOf(doc.category) === -1) errors.push('Category is not recognised.');
    if (doc.reference != null && doc.reference !== '' && (typeof doc.reference !== 'string' || doc.reference.length > 100)) errors.push('Reference must be 100 characters or fewer.');
    if (doc.notes != null && doc.notes !== '' && (typeof doc.notes !== 'string' || doc.notes.length > 500)) errors.push('Notes must be 500 characters or fewer.');
    if (doc.issueDate != null && doc.issueDate !== '' && !isValidDateStr(doc.issueDate)) errors.push('Issue date is not a valid date.');
    if (doc.expiryDate != null && doc.expiryDate !== '' && !isValidDateStr(doc.expiryDate)) errors.push('Expiry date is not a valid date.');
    if (isValidDateStr(doc.issueDate) && isValidDateStr(doc.expiryDate) && compareDates(doc.expiryDate, doc.issueDate) < 0) {
      errors.push('Expiry date must not be earlier than the issue date.');
    }
    if (doc.locationId != null && doc.locationId !== '' && typeof doc.locationId !== 'string') errors.push('Location must be a valid location.');
    return errors;
  }

  var api = {
    isLeapYear: isLeapYear,
    daysInMonth: daysInMonth,
    isValidDateStr: isValidDateStr,
    todayStr: todayStr,
    parseDate: parseDate,
    daysBetween: daysBetween,
    compareDates: compareDates,
    addDays: addDays,
    formatDate: formatDate,
    documentStatus: documentStatus,
    daysUntilExpiry: daysUntilExpiry,
    validateDocument: validateDocument,
    CATEGORIES: CATEGORIES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PTDate = api;
})();
