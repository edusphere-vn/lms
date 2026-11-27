// Tao buoi hoc cu the (co ngay) tu luoi lich tuan lap lai. Khong dung DOM, kiem thu bang node.
import { normName, splitNames, parseKey, rowTime } from "./grid-core.js";

export const MINUTES_PER_CELL = 25;   // 1 o tren luoi = 1 khung 25 phut (2 o lien tiep = buoi 50 phut)
const pad = (n) => String(n).padStart(2, "0");
export function* dateRange(from, to) {
  const [y, m, d] = from.split("-").map(Number); let t = Date.UTC(y, m - 1, d);
  const end = Date.UTC(...to.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  for (; t <= end; t += 86400000) { const x = new Date(t); yield { iso: `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`, col: (x.getUTCDay() + 6) % 7 }; }
}
// Cac "dot" lien tiep cung noi dung tren moi cot cua mot giao vien: [{col, row, rows, text}]
export function runsOf(cells) {
  const byCol = {};
  for (const [k, cell] of Object.entries(cells || {})) { if (cell.k || !cell.t) continue; const { r, c } = parseKey(k); (byCol[c] ||= []).push({ r, t: cell.t }); }
  const out = [];
  for (const [c, list] of Object.entries(byCol)) {
    list.sort((a, b) => a.r - b.r);
    let cur = null;
    for (const x of list) {
      if (cur && x.r === cur.row + cur.rows && normName(x.t) === normName(cur.text)) cur.rows++;
      else { if (cur) out.push(cur); cur = { col: Number(c), row: x.r, rows: 1, text: x.t }; }
    }
    if (cur) out.push(cur);
  }
  return out;
}
// schedules: {teacherId: cells}; students: [{sc, fullName, agencyId}]; existing: Set(id) cua buoi da co trong khoang ngay.
export function generateSessions({ schedules, students, from, to, existing = new Set() }) {
  const byName = new Map();
  for (const s of students) { const k = normName(s.fullName); if (k) (byName.get(k) || byName.set(k, []).get(k)).push(s); }
  const days = [...dateRange(from, to)], sessions = [], unresolved = new Map(), usedIds = new Set(); let skippedExisting = 0;
  for (const [teacherId, cells] of Object.entries(schedules)) {
    const runs = runsOf(cells);
    for (const day of days) for (const run of runs.filter((r) => r.col === day.col).sort((a, b) => a.row - b.row)) {
      const scs = [], agencyIds = new Set(), flags = [];
      for (const name of splitNames(run.text)) {
        const hit = byName.get(normName(name));
        if (hit?.length === 1) { scs.push(hit[0].sc); if (hit[0].agencyId) agencyIds.add(hit[0].agencyId); }
        else { const key = `${teacherId}|${name}|${hit?.length ? "trung ten" : "khong co"}`; unresolved.set(key, { teacherId, name, reason: hit?.length ? "ambiguous" : "missing", count: (unresolved.get(key)?.count || 0) + 1 }); }
      }
      if (!scs.length) continue;
      const time = rowTime(run.row);
      let id = `${scs[0]}_${day.iso}`;
      if (existing.has(id) || usedIds.has(id)) { const alt = `${id}_${time.replace(":", "")}`; if (existing.has(id) && !usedIds.has(id)) { skippedExisting++; continue; } id = alt; if (existing.has(id)) { skippedExisting++; continue; } }
      usedIds.add(id);
      sessions.push({ id, data: { date: day.iso, time, minutes: run.rows * MINUTES_PER_CELL, teacherId, scs, agencyIds: [...agencyIds], attendance: {}, rcNo: null, rcSeq: null, flags, source: "schedule" } });
    }
  }
  const perTeacher = {}; for (const s of sessions) perTeacher[s.data.teacherId] = (perTeacher[s.data.teacherId] || 0) + 1;
  return { sessions, unresolved: [...unresolved.values()], skippedExisting, perTeacher };
}
