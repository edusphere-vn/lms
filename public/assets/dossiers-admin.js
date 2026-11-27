// Trang "Hồ sơ học viên" của admin: lọc theo giáo viên, khóa, agency, tên; mở hồ sơ lớp (General, RC1-n, đánh giá) và duyệt đánh giá giáo viên gửi lên.
import { collection, getDocs, query, where, updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { auth } from "./firebase.js";
import { normName } from "./grid-core.js";
import { openDossier } from "./dossier.js";
import { evalId, kindOf } from "./eval-core.js";

const docs = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

export async function renderDossiers(main, { db, h, alive = () => true }) {
  main.append(h("div", { class: "bar" }, h("h2", {}, "Hồ sơ học viên")), h("p", { class: "note" }, "Đang tải..."));
  const [ts, ss, es, subs] = await Promise.all([getDocs(collection(db, "teachers")), getDocs(collection(db, "students")), getDocs(collection(db, "enrollments")), docs(query(collection(db, "evaluations"), where("status", "==", "Submitted")))]);
  if (!alive()) return;
  const teachers = Object.fromEntries(ts.docs.map((d) => [d.id, d.data().name || d.id]));
  const students = ss.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fullName || a.id).localeCompare(b.fullName || b.id));
  const byId = Object.fromEntries(students.map((s) => [s.id, s]));
  const enrolls = es.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const courseOf = {}; for (const e of enrolls) courseOf[e.sc] = e;
  let queue = subs;

  const open = async (sc, focusTab) => {
    const [sessions, evaluations] = await Promise.all([docs(query(collection(db, "sessions"), where("scs", "array-contains", sc))), docs(query(collection(db, "evaluations"), where("sc", "==", sc)))]);
    const ctx = { db, user: auth.currentUser, role: "admin", students: byId, sessions, courseOf: { ...courseOf }, evaluations, teachers, onChange: () => {} };
    openDossier(ctx, [sc]);
    document.getElementById("dossier").addEventListener("close", refreshQueue, { once: true });
  };
  const refreshQueue = async () => { try { queue = await docs(query(collection(db, "evaluations"), where("status", "==", "Submitted"))); } catch { /* giữ danh sách cũ */ } if (alive()) paintQueue(); };

  const qbox = h("div", { class: "card", id: "evalQueue" });
  const paintQueue = () => {
    qbox.replaceChildren(...[h("h3", {}, `Đánh giá chờ duyệt (${queue.length})`),
      queue.length ? h("div", { class: "todaylist" }, queue.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((e) => h("div", { class: "todayitem", "data-eval": e.id },
        h("strong", {}, byId[e.sc]?.fullName || e.sc), h("span", { class: "note" }, `${e.kind || kindOf(e.rcNo)} · ${dmy(e.date)} · ${teachers[e.teacherId] || e.teacherId || ""}`), h("span", { class: "badge warn" }, `${e.total ?? ""}${e.level ? " · " + e.level : ""}`),
        h("button", { class: "s", type: "button", onclick: () => open(e.sc) }, "Xem hồ sơ"),
        h("button", { class: "p", type: "button", "data-approve": e.id, onclick: async (ev) => { ev.target.disabled = true; try { await updateDoc(doc(db, "evaluations", e.id || evalId(e.sc, e.rcNo)), { status: "Approved" }); queue = queue.filter((x) => x.id !== e.id); paintQueue(); } catch (err) { ev.target.disabled = false; ev.target.textContent = "Lỗi: " + (err.code || err.message); } } }, "Duyệt")))) : h("p", { class: "note" }, "Không có đánh giá nào đang chờ duyệt.")]);
  };

  const search = h("input", { type: "search", id: "dsSearch", placeholder: "Tên hoặc mã học viên", style: "width:240px" });
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();
  const sel = (id, label, opts) => h("select", { id, style: "width:auto" }, h("option", { value: "" }, label), opts.map(([v, l]) => h("option", { value: v }, l)));
  const tsel = sel("dsTeacher", "Mọi giáo viên", Object.entries(teachers).sort((a, b) => a[1].localeCompare(b[1]))), csel = sel("dsCourse", "Mọi khóa", uniq(enrolls.map((e) => e.courseId)).map((c) => [c, c])), asel = sel("dsAgency", "Mọi agency", uniq(students.map((s) => s.agencyId)).map((a) => [a, a]));
  const count = h("span", { class: "note", id: "dsCount" }), tbody = h("tbody", {});
  const paint = () => {
    const q = normName(search.value), rows = students.filter((s) => (!q || normName(`${s.fullName || ""} ${s.id}`).includes(q)) && (!tsel.value || (s.teacherIds || []).includes(tsel.value)) && (!csel.value || courseOf[s.id]?.courseId === csel.value) && (!asel.value || s.agencyId === asel.value));
    count.textContent = `${rows.length}/${students.length} học viên`;
    tbody.replaceChildren(...rows.slice(0, 300).map((s) => h("tr", { "data-sc": s.id }, h("td", {}, h("strong", {}, s.fullName || s.id)), h("td", {}, s.id), h("td", {}, courseOf[s.id]?.courseId || ""), h("td", {}, (s.teacherIds || []).map((t) => teachers[t] || t).join(", ")), h("td", {}, s.agencyId || ""),
      h("td", { class: "act" }, h("button", { class: "p", type: "button", "data-open": s.id, onclick: () => open(s.id) }, "Hồ sơ")))));
  };
  for (const el of [tsel, csel, asel]) el.onchange = paint; search.oninput = paint;
  main.replaceChildren(h("div", { class: "bar" }, h("h2", {}, "Hồ sơ học viên"), count), qbox,
    h("div", { class: "card" }, h("div", { class: "bar", style: "flex-wrap:wrap;gap:8px;margin-top:0" }, search, tsel, csel, asel),
      h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Học viên", "Mã", "Khóa", "Giáo viên", "Agency", ""].map((t) => h("th", {}, t)))), tbody))));
  paintQueue(); paint();
}
