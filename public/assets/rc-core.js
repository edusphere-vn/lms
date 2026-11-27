// Danh so RC (moi 10 buoi tinh = 1 RC) va tim buoi huy can hoc bu. Khong dung DOM, kiem thu bang node.
export const isCounted = (st) => st === "Present" || st === "Absent";   // Present va Absent tinh, Cancelled thi khong
const sortKey = (s) => `${s.date || ""}|${s.time || ""}|${s.id}`;

// sessions: [{id, date, time, scs, attendance, rc?, rcNo?, rcSeq?, locked?}] cua TAT CA giao vien.
// Tra ve { updates:[{id, data:{rc, rcNo, rcSeq}}], skippedLocked } chi gom buoi co thay doi.
// rc = { [sc]: {no, seq} } cho tung hoc vien (lop nhom moi nguoi co so rieng); rcNo/rcSeq = so cua hoc vien dau (hien thi).
// only (tuy chon, Set cac SC): chi cap nhat so RC cua cac hoc vien nay, giu nguyen so cua hoc vien khac trong lop nhom
// (dung khi chi co lich su cua mot so hoc vien duoc nap, vi du Worker tinh lai sau khi giao vien luu).
export function recomputeRc(sessions, only = null) {
  const seq = {}, rc = new Map();
  for (const s of [...sessions].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) {
    const m = only ? Object.fromEntries(Object.entries(s.rc || {}).filter(([sc]) => !only.has(sc))) : {};
    for (const sc of s.scs || []) if (isCounted(s.attendance?.[sc])) { const n = (seq[sc] = (seq[sc] || 0) + 1); if (!only || only.has(sc)) m[sc] = { no: Math.floor((n - 1) / 10) + 1, seq: ((n - 1) % 10) + 1 }; }
    rc.set(s.id, m);
  }
  const updates = []; let skippedLocked = 0;
  for (const s of sessions) {
    const m = rc.get(s.id), first = m[(s.scs || [])[0]], data = { rc: m, rcNo: first ? first.no : null, rcSeq: first ? first.seq : null };
    if (JSON.stringify(s.rc || {}) === JSON.stringify(m) && (s.rcNo ?? null) === data.rcNo && (s.rcSeq ?? null) === data.rcSeq) continue;
    if (s.locked) { skippedLocked++; continue; }
    updates.push({ id: s.id, data });
  }
  return { updates, skippedLocked };
}

// Buoi co hoc vien bi Cancelled ma chua co buoi hoc bu (buoi khac co makeupOf = id nay cho cung hoc vien).
export function pendingMakeups(sessions) {
  const done = new Set(sessions.filter((s) => s.makeupOf).flatMap((s) => (s.scs || []).map((sc) => `${s.makeupOf}|${sc}`)));
  const out = [];
  for (const s of sessions) for (const sc of s.scs || []) if (s.attendance?.[sc] === "Cancelled" && !done.has(`${s.id}|${sc}`)) out.push({ id: s.id, sc, date: s.date, time: s.time || "", minutes: s.minutes || 25, teacherId: s.teacherId, agencyIds: s.agencyIds || [] });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
export function makeupSession(p, { date, time, teacherId, minutes }) {
  return { id: `${p.sc}_${date}_${time.replace(":", "")}_mk`, data: { date, time, minutes: Number(minutes) || p.minutes, teacherId, scs: [p.sc], agencyIds: p.agencyIds, attendance: {}, rcNo: null, rcSeq: null, rc: {}, makeupOf: p.id, flags: [], source: "makeup" } };
}
