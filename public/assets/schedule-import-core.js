// Doc sheet lich giao vien (ClassSKD): cac khoi giao vien xep chong nhau, moi khoi co dong tieu de "VN Time | PH Time | Monday..Sunday"
// va cac dong 30 phut. Mau o (nen) cho biet o "Khong ranh" (do sam) hoac "Giu cho" (vang).
import { normName, START_MIN, STEP, ROWS, cellKey } from "./grid-core.js";
import { teacherKey, titleCase } from "./import-core.js";

const NA_FILLS = new Set(["980000", "85200C", "FF0000"]), RES_FILLS = new Set(["FFFF00"]);
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const hex = (rgb) => String(rgb || "").toUpperCase().slice(-6);
const minutesOf = (v) => {
  if (typeof v === "number") return Math.round((v % 1) * 1440);
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// rows: mang cac dong (sheet_to_json header:1); fillAt(rowIndex, colIndex) -> ma mau nen "RRGGBB" hoac "".
export function parseClassSkd(rows, fillAt = () => "") {
  const blocks = []; let cur = null, dropped = 0;
  rows.forEach((row, i) => {
    const a = row[0], b = row[1];
    if (clean(a) === "" && typeof b === "string" && clean(b) && !/phil|ph time/i.test(b)) {   // dong ten giao vien
      cur = { rowNo: i + 1, rawName: clean(b), key: teacherKey(b), name: titleCase(clean(b).replace(/^(sir|ms|mr|mrs|miss|teacher)[.\s]+/i, "")), cells: {} }; blocks.push(cur); return;
    }
    if (!cur) return;
    const mins = minutesOf(a);
    if (mins == null || typeof a === "string" && !/^\d{1,2}:\d{2}/.test(a)) return;
    const r = (mins - START_MIN) / STEP;
    for (let d = 0; d < 7; d++) {
      const text = clean(row[2 + d]), f = hex(fillAt(i, 2 + d)), kind = NA_FILLS.has(f) ? "na" : RES_FILLS.has(f) ? "res" : "";
      if (!text && !kind) continue;
      if (!Number.isInteger(r) || r < 0 || r >= ROWS) { dropped++; continue; }
      cur.cells[cellKey(r, d)] = { t: text, ...(kind ? { k: kind } : {}) };
    }
  });
  for (const b of blocks) { b.count = Object.values(b.cells).filter((c) => c.t && !c.k).length; b.marked = Object.values(b.cells).filter((c) => c.k).length; }
  return { blocks: blocks.filter((b) => Object.keys(b.cells).length), dropped };
}

// Ke hoach ghi: map { blockKey: teacherId | "__new__" }, existingIds de dat ma T moi, overwrite=false thi chi dien o trong.
export function buildScheduleWrites(blocks, { teacherMap, existingIds = [], existingCells = {}, overwrite = true }) {
  const used = new Set(existingIds); let n = Math.max(0, ...[...used].map((id) => Number(/^T(\d+)$/.exec(id)?.[1] || 0)));
  const created = new Map(), writes = [];
  for (const b of blocks) {
    let tid = teacherMap[b.key];
    if (!tid || tid === "__new__") { if (!created.has(b.key)) { const id = `T${++n}`; created.set(b.key, id); writes.push({ path: `teachers/${id}`, data: { name: b.name, status: "Active" } }); } tid = created.get(b.key); }
    const prev = existingCells[tid] || {};
    const cells = overwrite ? b.cells : { ...b.cells, ...prev };
    writes.push({ path: `schedule/${tid}`, data: { teacherId: tid, cells } });
  }
  return { writes, newTeachers: created.size };
}
