// Trang Tổng quan của admin: số liệu chính, buổi học hôm nay và việc cần xử lý.
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { pendingMakeups } from "./rc-core.js";
import { sessionStatus } from "./sessions-filter.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const STAT = { Present: ["Có mặt", "ok"], Absent: ["Vắng", "warn"], Cancelled: ["Hủy", "bad"], mixed: ["Hỗn hợp", "info"], "": ["Chưa điểm danh", "info"] };

export async function renderDashboard(main, { db, h, alive = () => true, go = () => {} }) {
  const now = new Date(), today = iso(now), ym = today.slice(0, 7), first = `${ym}-01`, last = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const pendingEvals = await getDocs(query(collection(db, "evaluations"), where("status", "==", "Submitted"))).then((x) => x.size, () => 0);
  const [ts, ss, es, ms] = await Promise.all([getDocs(collection(db, "teachers")), getDocs(collection(db, "students")), getDocs(collection(db, "enrollments")),
    getDocs(query(collection(db, "sessions"), where("date", ">=", first), where("date", "<=", last)))]);
  if (!alive()) return;
  const teachers = Object.fromEntries(ts.docs.map((d) => [d.id, d.data().name || d.id])), students = Object.fromEntries(ss.docs.map((d) => [d.id, d.data().fullName || d.id]));
  const sessions = ms.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activeT = ts.docs.filter((d) => (d.data().status || "Active") === "Active").length, activeS = ss.docs.filter((d) => (d.data().status || "Active") === "Active").length;
  const activeE = es.docs.filter((d) => (d.data().status || "Active") === "Active").length;
  const counted = sessions.filter((s) => ["Present", "Absent"].includes(sessionStatus(s))).length, past = sessions.filter((s) => s.date <= today);
  const unreported = past.filter((s) => sessionStatus(s) === "" && s.date < today).length, makeups = pendingMakeups(sessions).length;
  const todays = sessions.filter((s) => s.date === today).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const stat = (v, label, color) => h("div", { class: "stat-card" }, h("div", { class: "value", style: color ? `color:${color}` : "" }, v), h("div", { class: "label" }, label));
  main.replaceChildren(h("div", { class: "bar" }, h("h2", {}, "Tổng quan")),
    h("div", { class: "stats", id: "dashStats" }, stat(activeT, "Giáo viên đang dạy", "var(--accent)"), stat(activeS, "Học viên đang học", "var(--s)"), stat(activeE, "Gói học đang chạy", "var(--a)"),
      stat(`${counted}/${sessions.length}`, "Buổi tính trong tháng / tổng số buổi", "#8B5CF6")),
    h("div", { class: "card" }, h("h3", {}, "Cần xử lý"),
      h("div", { class: "rowline" }, h("span", {}, h("strong", {}, unreported), " buổi quá hạn chưa điểm danh trong tháng này"), h("button", { class: "s", onclick: () => go("sessions") }, "Xem buổi học")),
      h("div", { class: "rowline" }, h("span", {}, h("strong", {}, makeups), " buổi hủy chưa có buổi học bù trong tháng này"), h("button", { class: "s", onclick: () => go("schedule") }, "Mở RC và học bù")),
      h("div", { class: "rowline" }, h("span", {}, h("strong", { id: "dashEvals" }, pendingEvals), " đánh giá cuối RC đang chờ duyệt"), h("button", { class: "s", onclick: () => go("dossiers") }, "Duyệt đánh giá")),
      h("div", { class: "rowline" }, h("span", {}, "Kỳ lương tháng này kết thúc ngày ", h("strong", {}, last.slice(8) + "/" + last.slice(5, 7))), h("button", { class: "s", onclick: () => go("payroll") }, "Tính lương"))),
    h("div", { class: "card" }, h("h3", {}, `Buổi học hôm nay (${todays.length})`),
      todays.length ? h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Giờ", "Giáo viên", "Học viên", "Trạng thái"].map((t) => h("th", {}, t)))),
        h("tbody", {}, todays.map((s) => { const [l, c] = STAT[sessionStatus(s)] || STAT[""]; return h("tr", {}, h("td", {}, `${s.time || ""} (${s.minutes || 25}p)`), h("td", {}, teachers[s.teacherId] || s.teacherId || ""),
          h("td", {}, (s.scs || []).map((x) => students[x] || x).join(", ")), h("td", {}, h("span", { class: "badge " + c }, l))); })))) : h("p", { class: "note" }, "Hôm nay không có buổi học nào.")));
}
