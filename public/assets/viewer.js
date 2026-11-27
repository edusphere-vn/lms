// Giao diện học viên và agency: xem báo cáo (buổi học đã học, nhận xét, đánh giá cuối RC). Chỉ đọc.
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { buildReport } from "./report-core.js";
import { mountShell } from "./shell.js";
import { noticesView } from "./notices-view.js";
import { mountDossier } from "./dossier.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const norm = (x) => String(x ?? "").toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const docs = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));

function reportView(sc, name, sessions, evaluations, enrollments, meetLink = "") {
  const r = buildReport({ sc, sessions, evaluations }), enr = enrollments.filter((e) => e.sc === sc).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const today = new Date(), todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const upcoming = sessions.filter((x) => (x.scs || []).includes(sc) && x.date >= todayIso && !["Present", "Absent", "Cancelled"].includes(x.attendance?.[sc])).map((x) => ({ ...x, meetLink })).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 14);
  const head = h("section", { class: "report card", "data-sc": sc },
    h("h2", { style: "margin:0 0 4px" }, name || sc), h("p", { class: "note" }, `Mã ${sc}`),
    h("p", {}, h("strong", {}, `RC${r.rcNo}`), `: ${r.inRc}/10 buổi. Tổng ${r.counted} buổi đã học (${r.present} có mặt, ${r.absent} vắng).`),
    h("div", { class: "progress" }, h("div", { style: `width:${Math.min(100, Math.round(r.inRc * 10))}%` })),
    enr.length ? h("p", { class: "note" }, "Gói học: " + enr.map((e) => `${e.courseId || ""} ${e.startDate || ""}${e.endDate ? " - " + e.endDate : ""}${e.status ? " (" + e.status + ")" : ""}`).join("; ")) : null);
  const upEl = upcoming.length ? [h("h3", {}, "Lịch sắp học"), h("div", { class: "wrap", id: "upcoming" }, h("table", {}, h("tbody", {}, upcoming.map((u) => h("tr", {}, h("td", {}, dmy(u.date)), h("td", {}, `${u.time || ""}${u.minutes ? " (" + u.minutes + "p)" : ""}`), h("td", {}, u.makeupOf ? "Học bù" : ""), h("td", {}, u.meetLink ? h("a", { href: u.meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : ""))))))] : null;
  return { head, upEl: upEl && h("div", { class: "card" }, upEl) };
}

const safeUrl = (u) => (/^https:\/\/\S+$/.test(u || "") ? u : null);
function materialsView(list) {
  return list.length ? h("div", { class: "card", id: "materials" }, h("h3", {}, "Tài liệu học"), h("ul", {}, list.map((m) => h("li", {}, safeUrl(m.url) ? h("a", { href: m.url, target: "_blank", rel: "noopener noreferrer" }, m.title || m.id) : (m.title || m.id), m.level ? ` · ${m.level}` : "", m.note ? h("span", { class: "note" }, ` ${m.note}`) : null)))) : null;
}

export async function startStudent({ db, user, profile, main }) {
  const claims = (await user.getIdTokenResult()).claims, sc = claims.sc || profile.sc;
  if (claims.role !== "student" || !claims.sc) throw new Error("Tài khoản chưa có quyền học viên (thiếu claim). Nhờ admin bấm Đặt lại mật khẩu.");
  main.replaceChildren(h("p", {}, "Đang tải..."));
  const [sessions, evaluations, enrollments] = await Promise.all([
    docs(query(collection(db, "sessions"), where("scs", "array-contains", sc))),
    docs(query(collection(db, "evaluations"), where("sc", "==", sc), where("status", "==", "Approved"))),
    docs(query(collection(db, "enrollments"), where("sc", "==", sc)))]);
  const me = (await getDoc(doc(db, "students", sc)).catch(() => null))?.data?.() || {};
  const myCourses = new Set(enrollments.map((e) => e.courseId).filter(Boolean));
  const materials = (await docs(query(collection(db, "materials"), where("forStudents", "==", true))).catch(() => [])).filter((m) => !m.courseId || myCourses.has(m.courseId)).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const rv = reportView(sc, me.fullName || profile.displayName, sessions, evaluations, enrollments, me.meetLink || "");
  const courseOf = {}; for (const e of [...enrollments].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))) courseOf[e.sc] = e;
  const ctx = { db, user, role: "student", students: { [sc]: { ...me, id: sc } }, sessions, courseOf, evaluations, teachers: {} };
  await mountShell({ main, tabs: [
    { key: "schedule", title: "Lịch học", render: (el) => el.append(...[rv.head, rv.upEl || h("div", { class: "card" }, h("p", { class: "note" }, "Chưa có buổi học sắp tới."))].filter(Boolean)) },
    { key: "reports", title: "Báo cáo", render: (el) => { const box = h("div", { class: "card", id: "reportsCard" }); el.append(box); mountDossier(ctx, [sc], box); } },
    { key: "materials", title: "Tài liệu", render: (el) => el.append(materialsView(materials) || h("div", { class: "card" }, h("p", { class: "note" }, "Chưa có tài liệu."))) },
    { key: "notices", title: "Thông báo", render: async (el) => el.append(await noticesView(db, "student", h)) }] });
}

export async function startAgency({ db, user, profile, main }) {
  const claims = (await user.getIdTokenResult()).claims, agencyId = claims.agencyId || profile.agencyId;
  if (claims.role !== "agency" || !claims.agencyId) throw new Error("Tài khoản chưa có quyền agency (thiếu claim). Nhờ admin bấm Đặt lại mật khẩu.");
  main.replaceChildren(h("p", {}, "Đang tải..."));
  const [students, sessions, evaluations, enrollments] = await Promise.all([
    docs(query(collection(db, "students"), where("agencyId", "==", agencyId))),
    docs(query(collection(db, "sessions"), where("agencyIds", "array-contains", agencyId))),
    docs(query(collection(db, "evaluations"), where("agencyId", "==", agencyId), where("status", "==", "Approved"))),
    docs(query(collection(db, "enrollments"), where("agencyId", "==", agencyId)))]);
  students.sort((a, b) => (a.fullName || a.id).localeCompare(b.fullName || b.id));
  const courseOf = {}; for (const e of [...enrollments].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))) courseOf[e.sc] = e;
  const box = h("div", {}), sel = h("select", { id: "agStudent" }), search = h("input", { type: "search", id: "agSearch", placeholder: "Tìm học viên theo tên hoặc mã...", style: "width:260px;margin-bottom:8px" });
  const fill = () => { const q = norm(search.value), cur = sel.value; const list = students.filter((s) => !q || norm(`${s.fullName || ""} ${s.id}`).includes(q));
    sel.replaceChildren(h("option", { value: "" }, `— Chọn học viên (${list.length}) —`), ...list.map((s) => h("option", { value: s.id, selected: s.id === cur }, `${s.fullName || s.id} (${s.id})`))); };
  search.oninput = fill; fill();
  sel.onchange = () => { const s = students.find((x) => x.id === sel.value); box.replaceChildren(); if (s) { const card = h("div", { class: "card", id: "reportsCard", "data-sc": s.id }); box.append(card); mountDossier({ db, user, role: "agency", students: Object.fromEntries(students.map((x) => [x.id, x])), sessions, courseOf, evaluations, teachers: {} }, [s.id], card); } };
  await mountShell({ main, tabs: [
    { key: "students", title: "Học viên", render: (el) => el.append(h("div", { class: "card" }, h("h3", {}, profile.displayName || agencyId), h("p", { class: "note" }, `${students.length} học viên`), search, sel), box) },
    { key: "notices", title: "Thông báo", render: async (el) => el.append(await noticesView(db, "agency", h)) }] });
}
