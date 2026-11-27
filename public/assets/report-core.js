// Du lieu cho trang bao cao cua hoc vien/agency (khong dung DOM, kiem thu bang node).
// Buoi Cancelled khong hien trong bao cao (van nam trong du lieu diem danh).
import { isCounted } from "./rc-core.js";
export function buildReport({ sc, sessions, evaluations = [] }) {
  const mine = sessions.filter((s) => (s.scs || []).includes(sc)).map((s) => ({ ...s, status: s.attendance?.[sc] || "", rcInfo: s.rc?.[sc] || (s.scs?.[0] === sc && s.rcNo ? { no: s.rcNo, seq: s.rcSeq } : null) }));
  const shown = mine.filter((s) => isCounted(s.status)).sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  const counted = shown.length, rcNo = Math.floor(counted / 10) + (counted % 10 ? 1 : 0) || 1, inRc = counted === 0 ? 0 : ((counted - 1) % 10) + 1;
  const evs = evaluations.filter((e) => e.sc === sc).sort((a, b) => a.rcNo - b.rcNo);
  return { counted, rcNo, inRc, present: shown.filter((s) => s.status === "Present").length, absent: shown.filter((s) => s.status === "Absent").length, items: shown, evaluations: evs };
}
