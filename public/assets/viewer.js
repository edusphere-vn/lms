// Giao diện học viên và agency: xem báo cáo (buổi học đã học, nhận xét, đánh giá cuối RC). Chỉ đọc.
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { buildReport } from "./report-core.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const docs = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));

function reportView(sc, name, sessions, evaluations, enrollments) {
  const r = buildReport({ sc, sessions, evaluations }), enr = enrollments.filter((e) => e.sc === sc).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  return h("section", { class: "report", "data-sc": sc },
    h("h2", {}, name || sc), h("p", { class: "note" }, `Mã ${sc}`),
    h("p", {}, h("strong", {}, `RC${r.rcNo}`), `: ${r.inRc}/10 buổi. Tổng ${r.counted} buổi đã học (${r.present} có mặt, ${r.absent} vắng).`),
    enr.length ? h("p", { class: "note" }, "Gói học: " + enr.map((e) => `${e.courseId || ""} ${e.startDate || ""}${e.endDate ? " - " + e.endDate : ""}${e.status ? " (" + e.status + ")" : ""}`).join("; ")) : null,
    r.evaluations.length ? [h("h3", {}, "Đánh giá"), h("div", { class: "wrap" }, h("table", {}, h("tbody", {}, r.evaluations.map((e) => h("tr", {}, h("td", {}, e.kind || `Exam ${e.rcNo}`), h("td", {}, dmy(e.date)), h("td", {}, Object.entries(e.scores || {}).map(([k, v]) => `${k}: ${v}`).join(", ")), h("td", {}, e.level || ""))))))] : null,
    h("h3", {}, "Các buổi học"),
    r.items.length ? r.items.map((s) => h("article", { class: "session" },
      h("header", {}, h("strong", {}, `${dmy(s.date)}${s.time ? " " + s.time : ""}`), s.rcInfo ? h("span", { class: "tag" }, `RC${s.rcInfo.no} · buổi ${s.rcInfo.seq}`) : null, h("span", { class: "note" }, s.status === "Absent" ? "Vắng" : "Có mặt")),
      s.topic ? h("p", {}, h("strong", {}, "Progress: "), s.topic) : null, s.lesson ? h("p", { style: "white-space:pre-wrap" }, h("strong", {}, "Academic Performance: "), s.lesson) : null,
      s.feedback ? h("p", { style: "white-space:pre-wrap" }, h("strong", {}, "Class Participation: "), s.feedback) : null)) : h("p", { class: "empty" }, "Chưa có buổi học nào."));
}

export async function startStudent({ db, user, profile, main }) {
  const claims = (await user.getIdTokenResult()).claims, sc = claims.sc || profile.sc;
  if (claims.role !== "student" || !claims.sc) throw new Error("Tài khoản chưa có quyền học viên (thiếu claim). Nhờ admin bấm Đặt lại mật khẩu.");
  main.replaceChildren(h("p", {}, "Đang tải..."));
  const [sessions, evaluations, enrollments] = await Promise.all([
    docs(query(collection(db, "sessions"), where("scs", "array-contains", sc))),
    docs(query(collection(db, "evaluations"), where("sc", "==", sc), where("status", "==", "Approved"))),
    docs(query(collection(db, "enrollments"), where("sc", "==", sc)))]);
  main.replaceChildren(reportView(sc, profile.displayName, sessions, evaluations, enrollments));
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
  const box = h("div", {}), sel = h("select", { id: "agStudent" }, h("option", { value: "" }, "— Chọn học viên —"), students.map((s) => h("option", { value: s.id }, `${s.fullName || s.id} (${s.id})`)));
  sel.onchange = () => { const s = students.find((x) => x.id === sel.value); box.replaceChildren(...(s ? [reportView(s.id, s.fullName, sessions, evaluations, enrollments)] : [])); };
  main.replaceChildren(h("h2", {}, profile.displayName || agencyId), h("p", { class: "note" }, `${students.length} học viên`), sel, box);
}
