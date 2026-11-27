/**
 * Sao luu Firestore ra Google Sheet moi dem (chi doc, khong sua du lieu).
 * Cach cai: xem docs/HUONG_DAN_SAO_LUU.md.
 * Script Properties can co: SA_EMAIL, SA_KEY (khoa rieng cua service account, nguyen van), PROJECT_ID, SHEET_ID.
 */
var COLLECTIONS = ['teachers', 'students', 'agencies', 'courses', 'enrollments', 'billing', 'schedule', 'sessions', 'evaluations', 'config', 'users'];

function b64u_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function token_() {
  var p = PropertiesService.getScriptProperties(), now = Math.floor(Date.now() / 1000);
  var head = b64u_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim = b64u_(JSON.stringify({ iss: p.getProperty('SA_EMAIL'), scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3300 }));
  var sig = b64u_(Utilities.computeRsaSha256Signature(head + '.' + claim, p.getProperty('SA_KEY').replace(/\\n/g, '\n')));
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Khong lay duoc token: ' + res.getContentText());
  return JSON.parse(res.getContentText()).access_token;
}
function plain_(v) {   // gia tri Firestore REST -> JS
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain_);
  if ('mapValue' in v) { var o = {}, f = v.mapValue.fields || {}; for (var k in f) o[k] = plain_(f[k]); return o; }
  return null;
}
function listAll_(coll, tok, project) {
  var out = [], next = '';
  do {
    var url = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/' + coll + '?pageSize=300' + (next ? '&pageToken=' + encodeURIComponent(next) : '');
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error(coll + ': ' + res.getContentText());
    var j = JSON.parse(res.getContentText());
    (j.documents || []).forEach(function (d) { var o = {}, f = d.fields || {}; for (var k in f) o[k] = plain_(f[k]); out.push([d.name.split('/').pop(), JSON.stringify(o)]); });
    next = j.nextPageToken || '';
  } while (next);
  return out;
}
function saoLuuNgay() {
  var p = PropertiesService.getScriptProperties(), tok = token_(), ss = SpreadsheetApp.openById(p.getProperty('SHEET_ID')), project = p.getProperty('PROJECT_ID'), log = [];
  COLLECTIONS.forEach(function (c) {
    var rows = listAll_(c, tok, project), sh = ss.getSheetByName(c) || ss.insertSheet(c);
    sh.clearContents(); sh.getRange(1, 1, 1, 2).setValues([['id', 'json']]);
    // moi o toi da 50.000 ky tu: chia thanh nhieu hang neu qua dai
    var flat = [];
    rows.forEach(function (r) { var s = r[1]; if (s.length <= 49000) flat.push([r[0], s]); else for (var i = 0, n = 0; i < s.length; i += 49000, n++) flat.push([r[0] + '#' + n, s.substr(i, 49000)]); });
    if (flat.length) sh.getRange(2, 1, flat.length, 2).setValues(flat);
    log.push(c + ': ' + rows.length);
  });
  var meta = ss.getSheetByName('_lan_sao_luu') || ss.insertSheet('_lan_sao_luu');
  meta.appendRow([new Date(), log.join(', ')]);
}
function datLichMoiDem() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'saoLuuNgay'; }).forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('saoLuuNgay').timeBased().everyDays(1).atHour(2).create();
}
