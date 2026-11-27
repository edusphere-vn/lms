// Tinh luong giao vien theo ky (ngay 1 den 30/31). Khong dung DOM, kiem thu bang node.
// Quy tac (Peter, tam thoi): 25p = rate_25, 50p = rate_50; hoc vien vang = rate_absent_*; lop nhom tinh theo buoi,
// chi can mot hoc vien Present la tra du; tat ca Cancelled hoac chua diem danh = 0 (chua diem danh duoc bao rieng).
export const DEFAULT_RATES = { r25: 100, r50: 200, a25: 25, a50: 50 };
const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export function ratesFor(config, teacher) {
  const c = (k, d) => num(config?.[k]?.value) ?? d;
  const base = { r25: c("rate_25", DEFAULT_RATES.r25), r50: c("rate_50", DEFAULT_RATES.r50), a25: c("rate_absent_25", DEFAULT_RATES.a25), a50: c("rate_absent_50", DEFAULT_RATES.a50) };
  const t = teacher || {};
  return { r25: num(t.rate25) ?? base.r25, r50: num(t.rate50) ?? base.r50, a25: num(t.rateAbsent25) ?? base.a25, a50: num(t.rateAbsent50) ?? base.a50 };
}
export function sessionPay(s, rates) {
  const long = (s.minutes || 25) >= 50, st = (s.scs || []).map((sc) => s.attendance?.[sc] || "");
  if (st.includes("Present")) return { status: "Present", amount: long ? rates.r50 : rates.r25 };
  if (st.includes("Absent")) return { status: "Absent", amount: long ? rates.a50 : rates.a25 };
  if (st.length && st.every((x) => x === "Cancelled")) return { status: "Cancelled", amount: 0 };
  return { status: "", amount: 0 };   // chua diem danh (hoac vua Cancelled vua trong)
}
export const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` }; };
// sessions: buoi trong ky; teachers: [{id, name, rate25...}]; config: {rate_25:{value}}
export function computePayroll({ sessions, teachers, config }) {
  const tmap = Object.fromEntries(teachers.map((t) => [t.id, t])), out = new Map();
  for (const s of [...sessions].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))) {
    const tid = s.teacherId || "";
    if (!out.has(tid)) out.set(tid, { teacherId: tid, name: tmap[tid]?.name || tid || "(chưa có giáo viên)", total: 0, present: 0, absent: 0, cancelled: 0, unreported: 0, locked: 0, lines: [] });
    const row = out.get(tid), p = sessionPay(s, ratesFor(config, tmap[tid]));
    row.total += p.amount; row.lines.push({ id: s.id, date: s.date, time: s.time || "", minutes: s.minutes || 25, scs: s.scs || [], status: p.status, amount: p.amount, locked: !!s.locked });
    if (p.status === "Present") row.present++; else if (p.status === "Absent") row.absent++; else if (p.status === "Cancelled") row.cancelled++; else row.unreported++;
    if (s.locked) row.locked++;
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export const payrollCsv = (rows, label) => "﻿" + [["Kỳ", "Giáo viên", "Ngày", "Giờ", "Phút", "Học viên", "Trạng thái", "Lương"].map(q).join(",")]
  .concat(rows.flatMap((r) => r.lines.map((l) => [label, r.name, l.date, l.time, l.minutes, l.scs.join("+"), l.status || "Chưa điểm danh", l.amount].map(q).join(","))))
  .concat(rows.map((r) => [label, r.name, "TỔNG", "", "", "", "", r.total].map(q).join(","))).join("\n");
