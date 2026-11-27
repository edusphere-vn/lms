// Giao diện học viên và agency: xem báo cáo (buổi học đã học, nhận xét, đánh giá cuối RC). Chỉ đọc.
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { buildReport } from "./report-core.js";

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
  const card = (s) => h("article", { class: "session" },
      h("header", {}, h("strong", {}, `${dmy(s.date)}${s.time ? " " + s.time : ""}`), s.rcInfo ? h("span", { class: "tag" }, `RC${s.rcInfo.no} · buổi ${s.rcInfo.seq}`) : null, h("span", { class: "note" }, s.status === "Absent" ? "Vắng" : "Có mặt")),
      s.topic ? h("p", {}, h("strong", {}, "Progress: "), s.topic) : null, s.lesson ? h("p", { style: "white-space:pre-wrap" }, h("strong", {}, "Academic Performance: "), s.lesson) : null,
      s.feedback ? h("p", { style: "white-space:pre-wrap" }, h("strong", {}, "Class Participation: "), s.feedback) : null);
  const from = h("input", { type: "date", "data-f": "from", style: "width:auto" }), to = h("input", { type: "date", "data-f": "to", style: "width:auto" });
  const stat = h("select", { "data-f": "status", style: "width:auto" }, [["", "Có mặt và vắng"], ["Present", "Chỉ có mặt"], ["Absent", "Chỉ vắng"]].map(([v, l]) => h("option", { value: v }, l)));
  const list = h("div", { class: "sessions" }), cnt = h("span", { class: "note" });
  const showList = () => { const items = r.items.filter((x) => (!from.value || x.date >= from.value) && (!to.value || x.date <= to.value) && (!stat.value || x.status === stat.value));
    cnt.textContent = items.length === r.items.length ? "" : `Hiện ${items.length}/${r.items.length} buổi`; list.replaceChildren(...(items.length ? items.map(card) : [h("p", { class: "empty" }, "Không có buổi học nào.")])); };
  for (const el of [from, to, stat]) el.onchange = showList;
  const filterBar = h("div", { class: "bar", style: "flex-wrap:wrap;gap:8px" }, "Từ ", from, " đến ", to, stat, cnt);
  showList();
  return h("section", { class: "report", "data-sc": sc },
    h("h2", {}, name || sc), h("p", { class: "note" }, `Mã ${sc}`),
    h("p", {}, h("strong", {}, `RC${r.rcNo}`), `: ${r.inRc}/10 buổi. Tổng ${r.counted} buổi đã học (${r.present} có mặt, ${r.absent} vắng).`),
    enr.length ? h("p", { class: "note" }, "Gói học: " + enr.map((e) => `${e.courseId || ""} ${e.startDate || ""}${e.endDate ? " - " + e.endDate : ""}${e.status ? " (" + e.status + ")" : ""}`).join("; ")) : null,
    r.evaluations.length ? [h("h3", {}, "Đánh giá"), h("div", { class: "wrap" }, h("table", {}, h("tbody", {}, r.evaluations.map((e) => h("tr", {}, h("td", {}, e.kind || `Exam ${e.rcNo}`), h("td", {}, dmy(e.date)), h("td", {}, Object.entries(e.scores || {}).map(([k, v]) => `${k}: ${v}`).join(", ")), h("td", {}, e.level || ""))))))] : null,
    upcoming.length ? [h("h3", {}, "Lịch sắp học"), h("div", { class: "wrap", id: "upcoming" }, h("table", {}, h("tbody", {}, upcoming.map((u) => h("tr", {}, h("td", {}, dmy(u.date)), h("td", {}, `${u.time || ""}${u.minutes ? " (" + u.minutes + "p)" : ""}`), h("td", {}, u.makeupOf ? "Học bù" : ""), h("td", {}, u.meetLink ? h("a", { href: u.meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : ""))))))] : null,
    h("h3", {}, "Các buổi học"),
    filterBar, list);
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
  main.replaceChildren(reportView(sc, me.fullName || profile.displayName, sessions, evaluations, enrollments, me.meetLink || ""));
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
  const box = h("div", {}), sel = h("select", { id: "agStudent" }), search = h("input", { type: "search", id: "agSearch", placeholder: "Tìm học viên theo tên hoặc mã...", style: "width:260px;margin-bottom:8px" });
  const fill = () => { const q = norm(search.value), cur = sel.value; const list = students.filter((s) => !q || norm(`${s.fullName || ""} ${s.id}`).includes(q));
    sel.replaceChildren(h("option", { value: "" }, `— Chọn học viên (${list.length}) —`), ...list.map((s) => h("option", { value: s.id, selected: s.id === cur }, `${s.fullName || s.id} (${s.id})`))); };
  search.oninput = fill; fill();
  sel.onchange = () => { const s = students.find((x) => x.id === sel.value); box.replaceChildren(...(s ? [reportView(s.id, s.fullName, sessions, evaluations, enrollments, s.meetLink || "")] : [])); };
  main.replaceChildren(h("h2", {}, profile.displayName || agencyId), h("p", { class: "note" }, `${students.length} học viên`), search, sel, box);
}
