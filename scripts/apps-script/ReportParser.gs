/**
 * Doc mot file bao cao hoc vien (Google Sheet) thanh du lieu co cau truc.
 * Ham thuan tuy: khong goi dich vu Google nen kiem thu duoc bang Node (tests/report-parser.test.mjs).
 *
 * sheets = { "General": [[...hang 1...], [...hang 2...]], "RC1": [...], ... }  (o A1 = sheets.General[0][0])
 * Ngay trong o phai duoc doi thanh chuoi "yyyy-mm-dd" truoc khi truyen vao (xem Export.gs).
 */
function parseReport(sheets, meta) {
  meta = meta || {};
  var out = { fileName: meta.fileName || '', student: '', teacher: '', course: '', meetLink: '', book: '', scoreTable: [], attendance: [], rcs: [], warnings: [] };
  var warn = function (code, msg) { out.warnings.push({ code: code, msg: msg }); };
  var txt = function (v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); };
  var raw = function (v) { return v === null || v === undefined ? '' : String(v).trim(); };
  var at = function (rows, r, c) { return rows[r] && rows[r][c] !== undefined ? rows[r][c] : ''; };
  var isDate = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)); };
  var num = function (v, where) {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    var t = String(v).trim().replace(',', '.');
    if (/^\.\d+\.\d+$/.test(t)) { warn('score_fixed', 'Diem go sai ' + v + ' (' + where + ') da doc thanh ' + t.slice(1)); t = t.slice(1); }   // ".5.5" -> 5.5
    var n = Number(t);
    if (isFinite(n) && String(v).trim() !== '') return n;
    warn('score_text', 'Diem khong phai so (' + where + '): ' + v);
    return null;
  };
  var normStatus = function (s) {
    var k = txt(s).toLowerCase();
    if (!k) return '';
    if (k === 'present') return 'Present';
    if (k === 'absent') return 'Absent';
    if (k.indexOf('cancel') === 0) return 'Cancelled';
    if (k.replace(/[- ]/g, '') === 'makeup') return 'Makeup';
    warn('status_odd', 'Trang thai la: ' + s);
    return txt(s);
  };
  var names = Object.keys(sheets);
  var general = sheets[names.filter(function (n) { return /^general$/i.test(n); })[0]];
  if (!general) { warn('no_general', 'Khong co tab General'); general = []; }

  // ---- General: thong tin chung ----
  for (var i = 0; i < Math.min(general.length, 8); i++) {
    [1, 4, 6].forEach(function (c) {
      var label = txt(at(general, i, c)).toLowerCase(), val = at(general, i, c + 1);
      if (label === 'student name:') out.student = txt(val);
      else if (label === 'teacher:') out.teacher = txt(val);
      else if (label === 'course:') out.course = txt(val);
      else if (label === "class's link") out.meetLink = raw(val);
      else if (label === 'book title:') out.book = raw(val);
      else if (/^https?:\/\//i.test(raw(at(general, i, c))) && i >= 3) out.book = out.book || raw(at(general, i, c));
    });
  }
  if (!out.student) warn('no_student', 'Khong doc duoc ten hoc vien');

  // ---- General: bang diem Entrance / Exam n ----
  var hdr = -1;
  for (i = 0; i < general.length; i++) { if (txt(at(general, i, 1)).toLowerCase() === 'date') { hdr = i; break; } }
  if (hdr >= 0) {
    var heads = [];
    for (var c = 2; c < 14; c++) heads.push(txt(at(general, hdr, c)));
    var levelCol = heads.indexOf('Level'), remarkCol = heads.indexOf('Remark');
    var limit = levelCol >= 0 ? levelCol : heads.length;
    for (i = hdr + 1; i < general.length; i++) {
      var b = txt(at(general, i, 1));
      if (/^comparison table/i.test(b) || /^attendance/i.test(b)) break;
      var remark = remarkCol >= 0 ? txt(at(general, i, 2 + remarkCol)) : '';
      var date = at(general, i, 1), scores = {}, any = false;
      for (var k = 0; k < limit; k++) {
        if (!heads[k]) continue;
        var s = num(at(general, i, 2 + k), 'General ' + remark + ' ' + heads[k]);
        if (s !== null) { scores[heads[k]] = s; any = true; }
      }
      if (isDate(date) || any) out.scoreTable.push({ remark: remark, date: isDate(date) ? date : '', scores: scores, level: levelCol >= 0 ? txt(at(general, i, 2 + levelCol)) : '' });
    }
  }

  // ---- General: diem danh (moi nhom 3 hang: so thu tu, ngay, trang thai) ----
  var att = -1;
  for (i = 0; i < general.length; i++) { if (/^attendance/i.test(txt(at(general, i, 1)))) { att = i; break; } }
  if (att >= 0) {
    for (i = att + 1; i < general.length;) {
      if (!/^\d+$/.test(txt(at(general, i, 1)))) { i++; continue; }
      for (c = 1; c < 30 && /^\d+$/.test(txt(at(general, i, c))); c++) {
        var d = at(general, i + 1, c), st = at(general, i + 2, c);
        if (d === '' && st === '') continue;
        out.attendance.push({ no: Number(txt(at(general, i, c))), date: isDate(d) ? d : '', status: normStatus(st) });
        if (d !== '' && !isDate(d)) warn('attendance_date', 'Ngay diem danh khong hop le: ' + d);
      }
      i += 3;
    }
  }

  // ---- Cac tab RC ----
  names.filter(function (n) { return /^rc\s*\d+$/i.test(n); }).sort(function (a, b) { return Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')); }).forEach(function (name) {
    var rows = sheets[name], rcNo = Number(name.replace(/\D/g, ''));
    var rc = { rc: rcNo, sheet: name, sessions: [], evaluation: null };
    var evalRow = -1;
    for (i = 0; i < rows.length; i++) { if (/^evaluation$/i.test(txt(at(rows, i, 1)))) { evalRow = i; break; } }
    var end = evalRow >= 0 ? evalRow : rows.length, prevDate = '';
    for (i = 0; i < end; i++) {
      if (!/^date of class/i.test(txt(at(rows, i, 1)))) continue;
      var blk = { date: isDate(at(rows, i, 2)) ? at(rows, i, 2) : '', status: normStatus(at(rows, i, 4)), teacher: txt(at(rows, i, 6)), progress: '', academic: '', participation: '' };
      for (var j = i + 1; j < end && !/^date of class/i.test(txt(at(rows, j, 1))); j++) {
        var label = txt(at(rows, j, 1)).toLowerCase(), v = raw(at(rows, j, 2));
        if (label.indexOf('progress') === 0) blk.progress = v;
        else if (label.indexOf('academic') === 0) blk.academic = v;
        else if (label.indexOf('class participation') === 0) blk.participation = v;
      }
      if (!blk.date && !blk.progress && !blk.academic && !blk.participation) continue;   // khoi mau trong (chi co san chu Present)
      if (!blk.date) warn('no_date', name + ': co noi dung nhung khong co ngay (dong ' + (i + 1) + ')');
      else if (prevDate && blk.date < prevDate) warn('date_order', name + ': ngay ' + blk.date + ' nam sau ' + prevDate);
      if (blk.date) prevDate = blk.date;
      rc.sessions.push(blk);
    }
    if (evalRow >= 0) {
      var heads2 = [];
      for (c = 2; c < 14; c++) heads2.push(txt(at(rows, evalRow + 1, c)).replace(/\s*\(\d+\)\s*$/, ''));
      var vals = {}, anyScore = false;
      heads2.forEach(function (h2, idx) { if (!h2) return; var sc = num(at(rows, evalRow + 2, 2 + idx), name + ' ' + h2); if (sc !== null) { vals[h2] = sc; anyScore = true; } });
      var comments = {};
      for (i = evalRow + 3; i < rows.length; i++) { var lb = txt(at(rows, i, 1)), tv = raw(at(rows, i, 2)); if (lb && tv) comments[lb] = tv; }
      var edate = at(rows, evalRow + 2, 1);
      if (anyScore || Object.keys(comments).length) rc.evaluation = { date: isDate(edate) ? edate : '', scores: vals, comments: comments };
    }
    if (rc.sessions.length || rc.evaluation) out.rcs.push(rc);
  });

  // ---- Kiem tra cheo ----
  var counted = function (s) { return s === 'Present' || s === 'Absent'; };
  out.rcs.forEach(function (rc, idx) {
    var n = rc.sessions.filter(function (s) { return counted(s.status); }).length;
    if (n > 10) warn('rc_over', rc.sheet + ' co ' + n + ' buoi tinh (Present/Absent), nhieu hon 10');
    if (n < 10 && idx < out.rcs.length - 1) warn('rc_short', rc.sheet + ' chi co ' + n + ' buoi tinh trong khi da sang RC sau');
  });
  var reportCounted = 0; out.rcs.forEach(function (rc) { reportCounted += rc.sessions.filter(function (s) { return counted(s.status); }).length; });
  var attCounted = out.attendance.filter(function (a) { return counted(a.status); }).length;
  if (out.attendance.length && reportCounted !== attCounted) warn('count_mismatch', 'Bao cao co ' + reportCounted + ' buoi tinh, diem danh co ' + attCounted);
  return out;
}
