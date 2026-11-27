// Tab "Buổi học": admin xem buổi học và báo cáo, lọc theo giáo viên, học viên, ngày, trạng thái.
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { normName } from "./grid-core.js";
import { filterSessions, sessionStatus } from "./sessions-filter.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const STAT = { Present: "Có mặt", Absent: "Vắng", Cancelled: "Hủy", "": "Chưa điểm danh", mixed: "Hỗn hợp" };

export async function renderSessions(main, { db, h, alive = () => true }) {
  const [ts, ss] = await Promise.all([getDocs(collection(db, "teachers")), getDocs(collection(db, "students"))]);
  if (!alive()) return;
  const teachers = ts.docs.map((d) => ({ id: d.id, name: d.data().name || d.id })), names = Object.fromEntries(ss.docs.map((d) => [d.id, d.data().fullName || d.id]));
  const today = new Date(), from0 = new Date(today); from0.setDate(from0.getDate() - ((today.getDay() + 6) % 7)); const to0 = new Date(from0); to0.setDate(to0.getDate() + 6);
  const inp = (id, type, v, extra = {}) => h("input", { id, type, value: v, style: "width:auto", ...extra });
  const from = inp("seFrom", "date", iso(from0)), to = inp("seTo", "date", iso(to0)), stu = inp("seStudent", "search", "", { placeholder: "Tên hoặc mã học viên" });
  const tsel = h("select", { id: "seTeacher", style: "width:auto" }, h("option", { value: "" }, "Mọi giáo viên"), teachers.map((t) => h("option", { value: t.id }, t.name)));
  const ssel = h("select", { id: "seStatus", style: "width:auto" }, [["", "Mọi trạng thái"], ["none", "Chưa điểm danh"], ["Present", "Có mặt"], ["Absent", "Vắng"], ["Cancelled", "Hủy"]].map(([v, l]) => h("option", { value: v }, l)));
  const msg = h("div", { class: "msg", role: "status" }), out = h("div", {}), load = h("button", { class: "p", id: "seLoad", type: "button" }, "Xem");
  main.append(h("div", { class: "bar" }, h("h2", {}, "Buổi học và báo cáo")),
    h("div", { class: "wrap", style: "padding:16px" }, h("div", { class: "bar", style: "flex-wrap:wrap;gap:8px" }, "Từ ", from, " đến ", to, tsel, stu, ssel, load), msg), out);
  let data = [];
  const paint = () => {
    const rows = filterSessions(data, { teacherId: tsel.value, student: stu.value, status: ssel.value }, { names, normName });
    out.replaceChildren(h("p", { class: "note" }, `${rows.length} buổi` + (rows.length > 400 ? ", hiện 400 buổi đầu, hãy lọc thêm" : "")),
      h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Ngày", "Giờ", "Giáo viên", "Học viên", "Trạng thái", "RC", "Báo cáo"].map((t) => h("th", {}, t)))),
        h("tbody", {}, rows.slice(0, 400).map((s) => h("tr", { "data-session": s.id },
          h("td", {}, dmy(s.date)), h("td", {}, `${s.time || ""} (${s.minutes || 25}p)`), h("td", {}, teachers.find((t) => t.id === s.teacherId)?.name || s.teacherId || ""),
          h("td", {}, (s.scs || []).map((sc) => names[sc] || sc).join(", ") + (s.makeupOf ? " (học bù)" : "")), h("td", {}, STAT[sessionStatus(s)] || ""),
          h("td", {}, s.rcNo ? `RC${s.rcNo}·${s.rcSeq}` : ""),
          h("td", { style: "white-space:normal;min-width:240px" }, s.topic || s.lesson || s.feedback ? h("details", {}, h("summary", {}, (s.topic || "Xem báo cáo").slice(0, 60)),
            h("p", { style: "white-space:pre-wrap" }, [s.lesson, s.feedback].filter(Boolean).join("\n\n"))) : "")))))));
  };
  load.onclick = async () => {
    if (!from.value || !to.value || from.value > to.value) { msg.className = "msg err"; msg.textContent = "Khoảng ngày không hợp lệ."; return; }
    msg.className = "msg"; msg.textContent = "Đang tải...";
    try { const snap = await getDocs(query(collection(db, "sessions"), where("date", ">=", from.value), where("date", "<=", to.value))); if (!alive()) return; data = snap.docs.map((d) => ({ id: d.id, ...d.data() })); msg.textContent = ""; paint(); }
    catch (e) { msg.className = "msg err"; msg.textContent = "Không tải được: " + (e.code || e.message); }
  };
  for (const el of [tsel, ssel]) el.onchange = paint; stu.oninput = paint;
  load.click();
}
