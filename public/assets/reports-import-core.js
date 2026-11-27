// Chuyen ket qua doc file bao cao (ReportParser.gs) thanh cac ban ghi Firestore: sessions va evaluations (khong dung DOM, kiem thu bang node).
import { normName } from "./grid-core.js";
import { lev } from "./import-core.js";

const counted = (s) => s === "Present" || s === "Absent";

// Tim hoc vien theo ten: khop chinh xac (khong dau) hoac gan giong (sai toi da 2 ky tu)
export function matchStudents(name, students) {
  const k = normName(name);
  if (!k) return { exact: [], near: [] };
  const exact = students.filter((s) => normName(s.fullName) === k);
  if (exact.length) return { exact, near: [] };
  return { exact: [], near: students.filter((s) => k.length >= 5 && lev(normName(s.fullName), k) <= 2) };
}

// Ghep khoi bao cao voi dong diem danh: cung so buoi tinh thi ghep theo thu tu (ngay go sai trong bao cao van ghep dung), khong thi ghep theo ngay.
function pairUp(blocks, att) {
  const cb = blocks.filter((b) => counted(b.status)), ca = att.filter((a) => counted(a.status)), pairs = [];
  if (cb.length && cb.length === ca.length) cb.forEach((b, i) => pairs.push([b, ca[i]]));
  else for (const b of cb) { const a = b.date && ca.find((x) => x.date === b.date && !pairs.some((p) => p[1] === x)); if (a) pairs.push([b, a]); }
  return pairs;
}

// rep: ket qua parseReport (kem url). ctx: { sc, teacherIdFor(name), agencyId, minDate, student }
export function planReport(rep, ctx) {
  const sc = ctx.sc, warnings = [], flagsAll = new Set();
  const blocks = []; rep.rcs.forEach((rc) => rc.sessions.forEach((s) => blocks.push({ ...s, sheetRc: rc.rc })));
  const att = [...rep.attendance].sort((a, b) => a.no - b.no);
  const pairs = pairUp(blocks, att), usedB = new Set(pairs.map((p) => p[0])), usedA = new Set(pairs.map((p) => p[1]));
  const raw = [];
  for (const [b, a] of pairs) {
    const f = [];
    if (b.date && a.date && b.date !== a.date) f.push("date_differs");
    if (a.status !== b.status) f.push("status_differs");
    raw.push({ date: a.date || b.date, status: a.status || b.status, block: b, flags: f, reportDate: b.date && b.date !== (a.date || b.date) ? b.date : undefined });
  }
  for (const b of blocks) if (!usedB.has(b)) raw.push({ date: b.date, status: b.status, block: b, flags: ["report_only"] });
  for (const a of att) if (!usedA.has(a)) raw.push({ date: a.date, status: a.status, block: null, flags: counted(a.status) ? ["attendance_only"] : [] });
  const order = new Map(raw.map((x, i) => [x, i]));
  const dated = raw.filter((x) => x.date && (!ctx.minDate || x.date >= ctx.minDate));
  const noDate = raw.filter((x) => !x.date).length; if (noDate) warnings.push(`${noDate} buổi không có ngày nên bỏ qua`);
  dated.sort((a, b) => a.date.localeCompare(b.date) || order.get(a) - order.get(b));
  let seq = 0; const writes = [], used = new Map(); let flagged = 0;
  const ownerTeacher = ctx.teacherIdFor(rep.teacher);
  for (const x of dated) {
    let rcSeq = null, rcNo = null;
    if (counted(x.status)) { seq++; rcSeq = ((seq - 1) % 10) + 1; rcNo = Math.floor((seq - 1) / 10) + 1; }
    const flags = [...x.flags]; if (x.block && rcNo && x.block.sheetRc !== rcNo) flags.push("rc_differs");
    if (!x.status) flags.push("no_status");
    const n = (used.get(x.date) || 0) + 1; used.set(x.date, n);
    const b = x.block, tname = b?.teacher || rep.teacher, tid = ctx.teacherIdFor(tname) || ownerTeacher || "";
    if (!tid) flags.push("no_teacher");
    flags.forEach((f) => flagsAll.add(f)); if (flags.some((f) => f !== "rc_differs")) flagged++;
    writes.push({ path: `sessions/${sc}_${x.date}${n > 1 ? "_" + n : ""}`, data: {
      date: x.date, teacherId: tid, scs: [sc], agencyIds: ctx.agencyId ? [ctx.agencyId] : [], attendance: { [sc]: x.status || "" },
      rcNo, rcSeq, ...(b ? { topic: b.progress || "", lesson: b.academic || "", feedback: b.participation || "" } : {}),
      sheetRc: b ? b.sheetRc : null, ...(x.reportDate ? { reportDate: x.reportDate } : {}), flags, source: "report-import" } });
  }
  const sessions = writes.length;
  // Danh gia: bang diem o General (Entrance / Exam n) la nguon chinh; nhan xet lay tu tab RC co cung diem.
  const evs = []; const unmatched = new Set(rep.rcs.filter((rc) => rc.evaluation).map((rc) => rc.rc));
  for (const row of rep.scoreTable) {
    const m = /^exam\s*(\d+)$/i.exec(row.remark), rcNo = /^entrance$/i.test(row.remark) ? 0 : m ? Number(m[1]) : null;
    if (rcNo == null || (!row.date && !Object.keys(row.scores).length)) continue;
    const keys = Object.keys(row.scores);
    const rcMatch = rep.rcs.find((rc) => rc.evaluation && keys.length >= 3 && keys.every((k) => k === "Band Score" || rc.evaluation.scores[k] === row.scores[k]));
    if (rcMatch) unmatched.delete(rcMatch.rc);
    evs.push({ path: `evaluations/${sc}_${rcNo}`, data: { sc, rcNo, kind: rcNo === 0 ? "Entrance" : `Exam ${rcNo}`, date: row.date, scores: row.scores, level: row.level || "", comments: rcMatch?.evaluation.comments || {}, teacherId: ownerTeacher || "", agencyId: ctx.agencyId || "", status: "Approved", source: "report-import" } });
  }
  if (unmatched.size) warnings.push(`Đánh giá ở tab RC${[...unmatched].join(", RC")} không khớp bảng điểm General nên không nhập`);
  rep.warnings.forEach((w) => warnings.push(w.msg));
  writes.push(...evs);
  const patch = { legacyReportUrl: rep.url || "", ...(rep.meetLink && !ctx.student?.meetLink ? { meetLink: rep.meetLink } : {}) };
  writes.push({ path: `students/${sc}`, data: patch });
  return { writes, sessions, evaluations: evs.length, flagged, flags: [...flagsAll], warnings };
}
