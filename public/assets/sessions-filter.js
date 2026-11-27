// Loc danh sach buoi hoc (khong dung DOM, kiem thu bang node).
export function sessionStatus(s) {
  const st = (s.scs || []).map((sc) => s.attendance?.[sc] || ""), set = new Set(st);
  return set.size === 1 ? st[0] : st.includes("Present") ? "Present" : st.includes("Absent") ? "Absent" : set.size ? "mixed" : "";
}
export function filterSessions(list, { teacherId = "", student = "", status = "" }, { names = {}, normName = (x) => String(x).toLowerCase() } = {}) {
  const q = normName(student);
  return list.filter((s) => (!teacherId || s.teacherId === teacherId)
    && (!q || (s.scs || []).some((sc) => normName(sc).includes(q) || normName(names[sc] || "").includes(q)))
    && (!status || (status === "none" ? !(s.scs || []).some((sc) => s.attendance?.[sc]) : (s.scs || []).some((sc) => s.attendance?.[sc] === status))))
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}
