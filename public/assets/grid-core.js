// Loi tinh toan cua luoi lich (khong dung DOM de co the kiem thu bang node --test).
// Luoi: 7 cot (Thu Hai..Chu nhat) x 36 dong (06:00..23:30, moi dong 30 phut), gio VN.
// Mot o = { t: "ten hoc vien", k: "na" | "res" | undefined }. k="na": Khong ranh, k="res": Giu cho.
export const DAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
export const START_MIN = 6 * 60, END_MIN = 24 * 60, STEP = 30;
export const ROWS = (END_MIN - START_MIN) / STEP, COLS = 7;

export const hhmm = (min) => String(Math.floor(min / 60) % 24).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
export const rowTime = (r) => hhmm(START_MIN + r * STEP);
export const cellKey = (r, c) => `${c}_${rowTime(r).replace(":", "")}`;
export const parseKey = (k) => {
  const [c, t] = k.split("_");
  return { c: Number(c), r: (Number(t.slice(0, 2)) * 60 + Number(t.slice(2)) - START_MIN) / STEP };
};
export const inGrid = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

// Chuan hoa ten de so khop: bo dau, chu thuong, gop khoang trang.
export const normName = (s) => String(s ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
// Mot o co the chua nhieu hoc vien (lop nhom) ngan cach bang dau phay, +, ; hoac xuong dong.
export const splitNames = (t) => String(t ?? "").split(/[,+;\n]/).map((s) => s.trim()).filter(Boolean);

export const rect = (a, b) => ({ r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) });

// ---------- TSV (dinh dang Google Sheets/Excel dung khi copy) ----------
export function parseTSV(text) {
  const rows = []; let row = [], cur = "", q = false, i = 0;
  const s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < s.length) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"' && cur === "") q = true;
    else if (ch === "\t") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
    i++;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export const toTSV = (matrix) => matrix.map((r) => r.map((v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join("\t")).join("\n");

// ---------- thao tac tren cells (luon tra ve ban sao moi) ----------
export const getCell = (cells, r, c) => cells[cellKey(r, c)] || null;
export const matrixOf = (cells, rc) => {
  const m = [];
  for (let r = rc.r0; r <= rc.r1; r++) { const row = []; for (let c = rc.c0; c <= rc.c1; c++) row.push(getCell(cells, r, c)); m.push(row); }
  return m;
};
const clean = (cell) => (cell && (cell.t || cell.k) ? { ...(cell.t ? { t: cell.t } : { t: "" }), ...(cell.k ? { k: cell.k } : {}) } : null);
export function setCell(cells, r, c, cell) {
  if (!inGrid(r, c)) return cells;
  const out = { ...cells }, k = cellKey(r, c), v = clean(cell);
  if (v) out[k] = v; else delete out[k];
  return out;
}
export function clearRect(cells, rc) {
  const out = { ...cells };
  for (let r = rc.r0; r <= rc.r1; r++) for (let c = rc.c0; c <= rc.c1; c++) delete out[cellKey(r, c)];
  return out;
}
// Dan ma tran cac o (hoac null) bat dau tu (r0, c0); phan vuot ngoai luoi bi bo.
export function pasteMatrix(cells, r0, c0, matrix) {
  let out = cells;
  matrix.forEach((row, i) => row.forEach((cell, j) => { out = setCell(out, r0 + i, c0 + j, cell); }));
  return out;
}
export const textMatrix = (tsvRows) => tsvRows.map((row) => row.map((t) => (t.trim() ? { t: t.trim() } : null)));
// Keo o (fill handle): lap lai mau nguon tren vung dich.
export function fillRect(cells, src, dst) {
  const h = src.r1 - src.r0 + 1, w = src.c1 - src.c0 + 1;
  let out = cells;
  for (let r = dst.r0; r <= dst.r1; r++) for (let c = dst.c0; c <= dst.c1; c++) {
    const sr = src.r0 + ((((r - src.r0) % h) + h) % h), sc = src.c0 + ((((c - src.c0) % w) + w) % w);
    out = setCell(out, r, c, getCell(cells, sr, sc));
  }
  return out;
}
// Vung dich khi keo tu vung nguon toi o (r, c): chon huong (doc/ngang) lech nhieu hon.
export function fillTarget(src, r, c) {
  const dr = r > src.r1 ? r - src.r1 : r < src.r0 ? r - src.r0 : 0, dc = c > src.c1 ? c - src.c1 : c < src.c0 ? c - src.c0 : 0;
  if (!dr && !dc) return null;
  if (Math.abs(dr) >= Math.abs(dc)) return dr > 0 ? { r0: src.r1 + 1, r1: r, c0: src.c0, c1: src.c1 } : { r0: r, r1: src.r0 - 1, c0: src.c0, c1: src.c1 };
  return dc > 0 ? { r0: src.r0, r1: src.r1, c0: src.c1 + 1, c1: c } : { r0: src.r0, r1: src.r1, c0: c, c1: src.c0 - 1 };
}
export const unionRect = (a, b) => ({ r0: Math.min(a.r0, b.r0), r1: Math.max(a.r1, b.r1), c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1) });

// Dem so o 30 phut co hoc vien (bo qua Khong ranh / Giu cho). 33 o = "33" ben canh ten giao vien.
export const countSlots = (cells) => Object.values(cells || {}).filter((x) => x.t && !x.k).length;

// Tim o trung: cung mot hoc vien o cung khung gio cua hai giao vien khac nhau.
// all = { teacherId: cells }. Tra ve { teacherId: Set(cellKey) }.
export function findConflicts(all) {
  const seen = new Map();   // "key|ten" -> Set(teacherId)
  for (const [tid, cells] of Object.entries(all)) for (const [k, cell] of Object.entries(cells || {})) {
    if (cell.k) continue;
    for (const n of splitNames(cell.t)) { const id = `${k}|${normName(n)}`; if (!seen.has(id)) seen.set(id, new Set()); seen.get(id).add(tid); }
  }
  const out = {};
  for (const [tid, cells] of Object.entries(all)) for (const [k, cell] of Object.entries(cells || {})) {
    if (cell.k) continue;
    if (splitNames(cell.t).some((n) => seen.get(`${k}|${normName(n)}`).size > 1)) (out[tid] ||= new Set()).add(k);
  }
  return out;
}

// Lich tuan cua mot hoc vien (theo ten, khong dau) tu tat ca luoi: gop cac o 30 phut lien tiep thanh khoang gio.
// Tra ve [{teacherId, day, from:"20:00", to:"21:00"}] sap xep theo thu roi gio.
export function slotsForName(all, name) {
  const want = normName(name), out = [];
  if (!want) return out;
  for (const [tid, cells] of Object.entries(all)) {
    const hit = new Set();
    for (const [k, cell] of Object.entries(cells || {})) if (!cell.k && splitNames(cell.t).some((n) => normName(n) === want)) hit.add(k);
    const byDay = {};
    for (const k of hit) { const { r, c } = parseKey(k); (byDay[c] ||= []).push(r); }
    for (const [c, rs] of Object.entries(byDay)) {
      rs.sort((a, b) => a - b);
      let start = rs[0], prev = rs[0];
      for (const r of [...rs.slice(1), Infinity]) {
        if (r !== prev + 1) { out.push({ teacherId: tid, day: Number(c), from: rowTime(start), to: hhmm(START_MIN + (prev + 1) * STEP) }); start = r; }
        prev = r;
      }
    }
  }
  return out.sort((a, b) => a.day - b.day || a.from.localeCompare(b.from));
}
