// Loi nhap danh sach hoc vien tu sheet "SL-Going" (khong dung DOM de kiem thu bang node --test).
// Dau vao: rows = mang cac dong (moi dong la mang o) doc tu xlsx/csv. Dau ra: ban ghi da chuan hoa + canh bao "can kiem".
import { normName } from "./grid-core.js";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const COURSE_MAP = { "esl speaking": "ESL_SP", "esl adult": "ESL_AD", "ielts speaking": "IELTS_SP", "ielts writing": "IELTS_WR", "ielts speaking+writing": "IELTS_SW", "business speaking": "BIZ_EN", "business english": "BIZ_EN", "visa interview": "VISA_F1", "visa f1": "VISA_F1" };
const STATUS_MAP = { done: "Done", processing: "Processing", cancelled: "Cancelled", canceled: "Cancelled", hold: "Hold" };
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
export const slug = (s) => normName(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();

export function courseId(raw) {
  const k = normName(raw);
  if (COURSE_MAP[k]) return COURSE_MAP[k];
  if (k.includes("ielts") && k.includes("writing") && k.includes("speaking")) return "IELTS_SW";
  return "";
}
// "Mon-Wed-Fri", "Tue - Thu", "MOn-Wed-Fri", "MTWTF" -> { days: [0..6], flexible }
export function parseSkd(raw) {
  const s = String(raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!s) return { days: [], flexible: false };
  if (/^mtwtf$/.test(s)) return { days: [0, 1, 2, 3, 4], flexible: true };   // gõ tắt = linh hoạt thứ 2-6, không chắc chắn
  const found = [...s.matchAll(/mon|tue|wed|thu|fri|sat|sun/g)].map((m) => DAY_KEYS.indexOf(m[0]));
  return { days: [...new Set(found)].sort((a, b) => a - b), flexible: false };
}
export function parseDate(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);   // d/m/yyyy (kieu Viet Nam)
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}
export function parseTime(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") { const m = Math.round((v % 1) * 1440); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, "0")}:${String(v.getUTCMinutes()).padStart(2, "0")}`;
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null; };
export const titleCase = (s) => clean(s).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export function lev(a, b) {   // khoang cach Levenshtein nho de goi y "Kristea" ~ "Krishtea"
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const mostCommon = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""; };

const COLS = { sc: "sc", agency: "agency", name: "name", course: "course", period: "weeks", class: "sessions", skd: "skd", length: "minutes", vtime: "vtime", start: "start", end: "end", invoice: "invoice", paid: "paid", status: "status", type: "kind", teacher: "teacher" };

// Tim dong tieu de roi chuan hoa tung dong. existing = { teachers:[{id,name}], agencies:[{id,name}] } (co the bo trong)
export function parseStudentList(rows, existing = {}) {
  const hi = rows.findIndex((r) => r.some((c) => normName(c) === "sc") && r.some((c) => normName(c) === "name"));
  if (hi < 0) return { error: "Không tìm thấy dòng tiêu đề (cần có cột SC và Name).", records: [] };
  const header = rows[hi].map((c) => normName(c)), idx = {};
  header.forEach((c, i) => { if (COLS[c] && idx[COLS[c]] == null) idx[COLS[c]] = i; });
  const extraStart = Math.max(...Object.values(idx)) + 1;
  const records = [], seenSc = new Map(); let skipped = 0;
  rows.slice(hi + 1).forEach((r, n) => {
    const g = (k) => (idx[k] == null ? "" : r[idx[k]]);
    const sc = clean(g("sc")).toUpperCase(), name = clean(g("name"));
    if (!sc && !name) return;
    if (!sc && !clean(g("course")) && !clean(g("start")) && !clean(g("teacher"))) { skipped++; return; }   // dong tong ket/rac cuoi sheet
    const flags = [], flag = (code, msg, level = "check") => flags.push({ code, msg, level });
    const status = STATUS_MAP[normName(g("status"))] || (clean(g("status")) ? clean(g("status")) : "");
    if (status && !Object.values(STATUS_MAP).includes(status)) flag("status_odd", `Trạng thái lạ: ${status}`);
    const kindRaw = normName(g("kind")), kind = kindRaw === "new" ? "New" : kindRaw === "extend" ? "Extend" : "";
    const paid = clean(g("paid")), paidNorm = normName(paid) === "paid" ? "Paid" : paid;
    if (paid && paidNorm !== "Paid") flag("paid_odd", `Cột Paid có giá trị khác "Paid": ${paid}`, "info");
    if (status === "Cancelled" && paidNorm === "Paid") flag("cancelled_paid", "Đã hủy nhưng đã Paid");
    const courseRaw = clean(g("course")), cid = courseId(courseRaw);
    if (!cid) flag("course_unknown", `Khóa học không nhận ra: ${courseRaw || "(trống)"}`);
    const startDate = parseDate(g("start")), endDate = parseDate(g("end"));
    if (startDate && endDate && endDate < startDate) flag("end_before_start", "Ngày kết thúc sớm hơn ngày bắt đầu");
    const weeks = num(g("weeks")), sessions = num(g("sessions")), minutes = num(g("minutes"));
    const skdRaw = clean(g("skd")), skd = parseSkd(skdRaw);
    if (skdRaw && !skd.days.length) flag("skd_unknown", `Không đọc được lịch tuần: ${skdRaw}`);
    if (skd.flexible) flag("skd_flexible", "Lịch viết tắt MTWTF: coi là linh hoạt (cần xếp lại)", "info");
    else if (skd.days.length && weeks && sessions && skd.days.length * weeks !== sessions) flag("skd_mismatch", `Lịch ${skd.days.length} buổi/tuần x ${weeks} tuần ≠ ${sessions} buổi`, "info");
    if (!sc) flag("sc_missing", "Thiếu mã SC");
    else if (!seenSc.has(sc)) seenSc.set(sc, { row: hi + 2 + n, nameKey: normName(name) });
    else if (seenSc.get(sc).nameKey !== normName(name)) flag("sc_name_conflict", `Mã SC này đã dùng cho học viên khác ở dòng ${seenSc.get(sc).row}`);
    const teacherName = clean(g("teacher"));
    if (!teacherName) flag("teacher_missing", "Chưa có giáo viên", "info");
    let meetLink = "", note = "";
    for (let i = extraStart; i < r.length; i++) { const v = clean(r[i]); if (!v) continue; if (/^https?:\/\//i.test(v)) meetLink ||= v; else note += (note ? "; " : "") + v; }
    records.push({
      rowNo: hi + 2 + n, sc, name, nameKey: normName(name), agencyName: clean(g("agency")), courseRaw, courseId: cid, weeks, sessions, minutes,
      skdRaw, days: skd.days, startTime: parseTime(g("vtime")), startDate, endDate, invoice: clean(g("invoice")), paid: paidNorm, status, kind,
      teacherName, meetLink, note, flags, dup: false,
    });
  });
  // Dong trung hoan toan (cung hoc vien, khoa, giao vien, ngay) -> mac dinh bo qua
  const sig = new Map();
  for (const r of records) {
    const k = [r.nameKey, r.courseId, r.normTeacher = normName(r.teacherName), r.startDate, r.endDate].join("|");
    if (sig.has(k)) { r.dup = true; r.flags.push({ code: "dup_row", msg: `Trùng hệt dòng ${sig.get(k)} (bỏ qua mặc định)`, level: "check" }); } else sig.set(k, r.rowNo);
  }
  // Giao vien: gop theo ten da chuan hoa, goi y giao vien san co gan nhat
  const exT = existing.teachers || [];
  const teachers = new Map();
  for (const r of records) {
    if (!r.teacherName) continue;
    const t = teachers.get(r.normTeacher) || { key: r.normTeacher, spellings: [], count: 0 };
    t.spellings.push(titleCase(r.teacherName)); t.count++; teachers.set(r.normTeacher, t);
  }
  for (const t of teachers.values()) {
    t.name = mostCommon(t.spellings);
    const exact = exT.find((e) => normName(e.name) === t.key || normName(e.id) === t.key);
    const near = exact || exT.find((e) => t.key.length >= 5 && lev(normName(e.name), t.key) <= 1);
    t.suggestId = (exact || near)?.id || ""; t.exact = !!exact;
  }
  const sameTeacher = [...teachers.values()];   // goi y gop ten gan giong nhau (Kristea ~ Krishtea)
  for (const a of sameTeacher) for (const b of sameTeacher) if (a.key < b.key && a.key.length >= 5 && b.key.length >= 5 && lev(a.key, b.key) <= 1 && !a.suggestId && !b.suggestId) (a.similarTo ||= []).push(b.name);
  // Agency: gop theo ten da chuan hoa
  const agencies = new Map();
  for (const r of records) {
    if (!r.agencyName) { r.agencyId = ""; continue; }
    const key = normName(r.agencyName), ex = (existing.agencies || []).find((e) => normName(e.name) === key || normName(e.id) === key);
    r.agencyId = ex?.id || slug(r.agencyName);
    const a = agencies.get(r.agencyId) || { id: r.agencyId, spellings: [], count: 0, existing: !!ex };
    a.spellings.push(r.agencyName); a.count++; agencies.set(r.agencyId, a);
  }
  for (const a of agencies.values()) a.name = a.existing ? (existing.agencies.find((e) => e.id === a.id)?.name || a.id) : mostCommon(a.spellings.some((x) => x !== x.toLowerCase()) ? a.spellings.filter((x) => x !== x.toLowerCase()) : a.spellings);   // uu tien cach viet co chu hoa
  // Cung ten nhung khac SC: co the la cung mot hoc vien (de admin quyet dinh gop hay khong)
  const byName = new Map();
  for (const r of records) if (r.sc && r.nameKey) (byName.get(r.nameKey) || byName.set(r.nameKey, new Set()).get(r.nameKey)).add(r.sc);
  for (const r of records) if (byName.get(r.nameKey)?.size > 1) r.flags.push({ code: "same_name", msg: `Cùng tên với SC khác: ${[...byName.get(r.nameKey)].filter((x) => x !== r.sc).join(", ")}`, level: "info" });
  return { records, skipped, teachers: [...teachers.values()], agencies: [...agencies.values()] };
}

// Tao danh sach ghi Firestore tu cac dong duoc chon.
// opts: { include:Set(rowNo), teacherMap:{normTeacher: teacherId | "__new__"}, existingTeacherIds:[...], mergeByName:bool (gop cac SC cung ten, mac dinh tat) }
export function buildWrites(parsed, opts) {
  const include = opts.include, teacherMap = opts.teacherMap || {}, writes = [];
  const used = new Set(opts.existingTeacherIds || []);
  let n = Math.max(0, ...[...used].map((id) => Number(/^T(\d+)$/.exec(id)?.[1] || 0)));
  const newTeacher = new Map();   // normTeacher -> id
  const teacherId = (r) => {
    if (!r.teacherName) return "";
    let key = r.normTeacher, m = teacherMap[key];
    if (m?.startsWith("~")) { key = m.slice(1); m = teacherMap[key]; if (m?.startsWith("~")) m = "__new__"; }   // "~ten": gop voi giao vien khac trong file
    if (m && m !== "__new__") return m;
    if (!newTeacher.has(key)) { const id = `T${++n}`; newTeacher.set(key, id); const t = parsed.teachers.find((x) => x.key === key); writes.push({ path: `teachers/${id}`, data: { name: t?.name || titleCase(r.teacherName), status: "Active" } }); }
    return newTeacher.get(key);
  };
  const chosen = parsed.records.filter((r) => include.has(r.rowNo) && r.sc);
  for (const a of parsed.agencies) if (!a.existing && chosen.some((r) => r.agencyId === a.id)) writes.push({ path: `agencies/${a.id}`, data: { name: a.name } });
  // Hoc vien = SC (Extend giu nguyen SC nen nhieu goi chung 1 hoc vien). Tuy chon: gop cac SC cung ten.
  const groups = new Map(), eids = new Set();
  for (const r of chosen) { const gk = opts.mergeByName ? r.nameKey : r.sc; (groups.get(gk) || groups.set(gk, []).get(gk)).push(r); }
  let students = 0, enrollments = 0;
  for (const rs of groups.values()) {
    rs.sort((a, b) => (a.startDate || "9").localeCompare(b.startDate || "9") || a.sc.localeCompare(b.sc));
    const sc = rs[0].sc, last = rs[rs.length - 1];
    const tids = new Set();
    for (const r of rs) {
      const tid = teacherId(r); if (tid && r.status !== "Cancelled") tids.add(tid);
      let eid = `${r.sc}_${r.startDate || "r" + r.rowNo}`; if (eids.has(eid)) eid += `_r${r.rowNo}`; eids.add(eid); r.eid = eid;
      writes.push({ path: `enrollments/${eid}`, data: {
        sc, packageSc: r.sc, courseId: r.courseId, agencyId: r.agencyId, teacherId: tid, teacherName: r.teacherName, weeks: r.weeks, sessions: r.sessions, minutes: r.minutes,
        days: r.days, skdRaw: r.skdRaw, startTime: r.startTime, startDate: r.startDate, endDate: r.endDate, kind: r.kind, status: r.status, note: r.note,
        flags: r.flags.filter((f) => f.level === "check").map((f) => f.code), source: "SL-Going" } });
      enrollments++;
      if (r.paid || r.invoice) writes.push({ path: `billing/${eid}`, data: { sc, packageSc: r.sc, enrollmentId: eid, agencyId: r.agencyId, paid: r.paid, invoice: r.invoice } });
    }
    const sts = rs.map((r) => r.status);
    const status = sts.includes("Processing") ? "Active" : sts.includes("Hold") ? "Hold" : sts.some(Boolean) ? "Inactive" : "";
    const meet = [...rs].reverse().find((r) => r.meetLink)?.meetLink || "";
    writes.push({ path: `students/${sc}`, data: {
      fullName: mostCommon(rs.map((r) => r.name)) || last.name, agencyId: last.agencyId, ...(meet ? { meetLink: meet } : {}), ...(status ? { status } : {}),
      packageScs: rs.map((r) => r.sc) }, union: { teacherIds: [...tids] } });
    students++;
  }
  return { writes, students, enrollments, newTeachers: newTeacher.size };
}

// Khop ten giao vien trong file (vd "Sir JULES ") voi giao vien da co: bo danh xung, so khop khong dau, cho phep sai 1 ky tu.
export const teacherKey = (name) => normName(name).replace(/^(sir|ms|mr|mrs|miss|teacher|t)[.\s]+/, "");
export function matchTeacher(name, teachers) {
  const k = teacherKey(name);
  const exact = teachers.find((t) => teacherKey(t.name) === k || normName(t.id) === k);
  if (exact) return { id: exact.id, exact: true };
  const near = k.length >= 5 ? teachers.find((t) => lev(teacherKey(t.name), k) <= 1) : null;
  return near ? { id: near.id, exact: false } : null;
}
