/**
 * Xuat toan bo file bao cao hoc vien (Google Sheet) trong mot thu muc Drive thanh 1 file JSON de nhap vao Edusphere LMS.
 * Chi DOC cac file bao cao, khong sua file nao. Ket qua nam trong thu muc "LMS_Export" ngay trong Drive cua ban.
 *
 * CACH DUNG (xem them docs/HUONG_DAN_XUAT_BAO_CAO.md):
 *   1. Tao project Apps Script moi (script.google.com), dan 2 file: ReportParser.gs va Export.gs.
 *   2. Kiem tra ROOT_FOLDER_ID ben duoi, bam Run > thuTren5File (chay thu 5 file dau, xem log).
 *   3. Bam Run > batDauXuat. Script tu chay tiep moi phut cho den khi xong, roi tu go bo bo hen gio.
 *   4. Mo thu muc LMS_Export, tai file lms_reports_export.json, tai len trang admin > Nhap bao cao.
 */
var CFG = {
  ROOT_FOLDER_ID: '1EEtONBuSfnC51O3ZSZ8FTugvOX62p-Ce',   // thu muc goc chua cac thu muc giao vien
  NAME_MUST_CONTAIN: 'report',                            // chi lay file co chu nay trong ten (khong phan biet hoa thuong)
  OUT_FOLDER: 'LMS_Export',
  TZ: 'Asia/Ho_Chi_Minh',
  BUDGET_MS: 4.5 * 60 * 1000,                             // moi lan chay toi da ~4.5 phut (gioi han Google la 6 phut)
  PART_SIZE: 15                                           // so file ghi moi dot, de khong mat tien do neu bi ngat
};

function outFolder_() {
  var it = DriveApp.getFoldersByName(CFG.OUT_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CFG.OUT_FOLDER);
}
function readJson_(folder, name) {
  var it = folder.getFilesByName(name);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}
function writeJson_(folder, name, obj) {
  var it = folder.getFilesByName(name), text = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(text); else folder.createFile(name, text, 'application/json');
}

// Liet ke de quy tat ca Google Sheet co ten phu hop
function listFiles_(folder, path, acc) {
  var files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().toLowerCase().indexOf(CFG.NAME_MUST_CONTAIN) < 0) continue;
    acc.push({ id: f.getId(), name: f.getName(), path: path, url: f.getUrl(), updated: Utilities.formatDate(f.getLastUpdated(), CFG.TZ, 'yyyy-MM-dd') });
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) { var s = subs.next(); listFiles_(s, path ? path + '/' + s.getName() : s.getName(), acc); }
  return acc;
}

// Doc 1 file bao cao: chi lay tab General va RC1, RC2, ...; doi o ngay thanh chuoi yyyy-mm-dd
function exportOne_(entry) {
  var ss = SpreadsheetApp.openById(entry.id), sheets = {};
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (!/^(general|rc\s*\d+)$/i.test(n)) return;
    var values = sh.getDataRange().getValues();
    sheets[n] = values.map(function (row) {
      return row.map(function (v) { return v instanceof Date ? Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd') : v; });
    });
  });
  var rep = parseReport(sheets, { fileName: entry.name });
  rep.fileId = entry.id; rep.url = entry.url; rep.path = entry.path; rep.updated = entry.updated;
  return rep;
}

/** Chay thu: doc 5 file dau va ghi log (khong luu gi) */
function thuTren5File() {
  var list = listFiles_(DriveApp.getFolderById(CFG.ROOT_FOLDER_ID), '', []);
  Logger.log('Tim thay %s file bao cao.', list.length);
  list.slice(0, 5).forEach(function (e) {
    var r = exportOne_(e);
    Logger.log('%s | hoc vien=%s | GV=%s | %s tab RC | %s buoi diem danh | canh bao=%s', e.name, r.student, r.teacher, r.rcs.length, r.attendance.length, r.warnings.length);
  });
}

/** Bat dau xuat: liet ke file, dat bo hen gio chay moi phut */
function batDauXuat() {
  var out = outFolder_(), list = listFiles_(DriveApp.getFolderById(CFG.ROOT_FOLDER_ID), '', []);
  writeJson_(out, '_queue.json', list);
  var it = out.getFiles();
  while (it.hasNext()) { var f = it.next(); if (/^_part_\d+\.json$/.test(f.getName())) f.setTrashed(true); }
  PropertiesService.getScriptProperties().setProperties({ idx: '0', parts: '0' });
  Logger.log('Se xuat %s file. Script se tu chay tiep moi phut.', list.length);
  huyHenGio_();
  ScriptApp.newTrigger('tiepTucXuat').timeBased().everyMinutes(1).create();
  tiepTucXuat();
}

function huyHenGio_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tiepTucXuat') ScriptApp.deleteTrigger(t); });
}

/** Duoc bo hen gio goi lai; cung co the bam Run tay */
function tiepTucXuat() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var t0 = Date.now(), props = PropertiesService.getScriptProperties(), out = outFolder_();
    var queue = readJson_(out, '_queue.json') || [], idx = Number(props.getProperty('idx') || 0), parts = Number(props.getProperty('parts') || 0);
    var batch = [];
    var flush = function () {
      if (batch.length) { parts++; writeJson_(out, '_part_' + ('0000' + parts).slice(-4) + '.json', batch); batch = []; }
      props.setProperties({ idx: String(idx), parts: String(parts) });
    };
    while (idx < queue.length && Date.now() - t0 < CFG.BUDGET_MS) {
      try { batch.push(exportOne_(queue[idx])); }
      catch (e) { batch.push({ fileId: queue[idx].id, fileName: queue[idx].name, path: queue[idx].path, url: queue[idx].url, error: String(e) }); }
      idx++;
      if (batch.length >= CFG.PART_SIZE) flush();
    }
    flush();
    Logger.log('Da xu ly %s/%s file.', idx, queue.length);
    if (idx >= queue.length) hoanTat_(out, queue.length, parts);
  } finally { lock.releaseLock(); }
}

function hoanTat_(out, total, parts) {
  var reports = [], errors = [];
  for (var p = 1; p <= parts; p++) {
    var arr = readJson_(out, '_part_' + ('0000' + p).slice(-4) + '.json') || [];
    arr.forEach(function (r) { (r.error ? errors : reports).push(r); });
  }
  var result = { exportedAt: new Date().toISOString(), rootFolderId: CFG.ROOT_FOLDER_ID, total: total, reports: reports, errors: errors };
  writeJson_(out, 'lms_reports_export.json', result);
  huyHenGio_();
  Logger.log('XONG: %s bao cao, %s file loi. Tai file lms_reports_export.json trong thu muc %s.', reports.length, errors.length, CFG.OUT_FOLDER);
}
