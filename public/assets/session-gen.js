// Hộp thoại "Tạo buổi học từ lịch": biến lưới lịch tuần lặp lại thành các buổi có ngày cụ thể để giáo viên điểm danh và nhập báo cáo.
import { collection, getDocs, doc, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { generateSessions } from "./session-gen-core.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export function openGenerate({ db, h, dlg }) {
  const mon = mondayOf(new Date()), sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  const from = h("input", { type: "date", id: "genFrom", value: iso(mon), style: "width:auto" }), to = h("input", { type: "date", id: "genTo", value: iso(sun), style: "width:auto" });
  const msg = h("div", { class: "msg", role: "status" }), out = h("div", {});
  const preview = h("button", { type: "button", class: "s", id: "genPreview" }, "Xem trước");
  dlg.className = "wide";
  dlg.replaceChildren(h("h3", {}, "Tạo buổi học từ lịch giáo viên"),
    h("p", { class: "note" }, "Mỗi cụm ô liền nhau của một học viên trên lưới (1 ô = 25 phút) thành một buổi học vào ngày tương ứng. Buổi đã có sẽ được giữ nguyên, chạy lại không tạo trùng."),
    h("label", { class: "inline" }, "Từ ngày ", from, " đến ngày ", to, preview), msg, out,
    h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Đóng")));
  dlg.showModal();
  const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };
  preview.onclick = async () => {
    out.replaceChildren(); say("Đang tính...");
    if (!from.value || !to.value || from.value > to.value) { say("Khoảng ngày không hợp lệ.", "err"); return; }
    if ((new Date(to.value) - new Date(from.value)) / 86400000 > 62) { say("Chỉ tạo tối đa khoảng 2 tháng mỗi lần.", "err"); return; }
    try {
      const [st, sc, tc, ex] = await Promise.all([getDocs(collection(db, "students")), getDocs(collection(db, "schedule")), getDocs(collection(db, "teachers")),
        getDocs(query(collection(db, "sessions"), where("date", ">=", from.value), where("date", "<=", to.value)))]);
      const students = st.docs.map((d) => ({ sc: d.id, ...d.data() })), names = Object.fromEntries(tc.docs.map((d) => [d.id, d.data().name || d.id]));
      const schedules = Object.fromEntries(sc.docs.map((d) => [d.id, d.data().cells || {}]));
      const plan = generateSessions({ schedules, students, from: from.value, to: to.value, existing: new Set(ex.docs.map((d) => d.id)) });
      const go = h("button", { type: "button", class: "p", id: "genGo", disabled: !plan.sessions.length }, `Tạo ${plan.sessions.length} buổi học`);
      out.replaceChildren(...[
        h("p", {}, `Sẽ tạo ${plan.sessions.length} buổi học` + (plan.skippedExisting ? `, bỏ qua ${plan.skippedExisting} buổi đã có.` : ".")),
        Object.keys(plan.perTeacher).length ? h("div", { class: "wrap" }, h("table", {}, h("tbody", {}, Object.entries(plan.perTeacher).map(([t, n]) => h("tr", {}, h("td", {}, names[t] || t), h("td", {}, `${n} buổi`)))))) : null,
        plan.unresolved.length ? [h("h4", {}, "Tên trên lưới chưa khớp được học viên (các buổi này chưa được tạo)"),
          h("ul", {}, plan.unresolved.map((u) => h("li", {}, `${names[u.teacherId] || u.teacherId}: "${u.name}" (${u.reason === "ambiguous" ? "trùng tên với nhiều học viên" : "không có học viên này"})`)))] : null,
        h("div", { class: "row" }, go)].flat().filter(Boolean));
      go.onclick = async () => {
        go.disabled = true; say("Đang ghi...");
        try {
          const now = Date.now();
          for (let i = 0; i < plan.sessions.length; i += 400) { const b = writeBatch(db); for (const s of plan.sessions.slice(i, i + 400)) b.set(doc(db, "sessions", s.id), { ...s.data, createdAt: now }); await b.commit(); }
          say(`Xong. Đã tạo ${plan.sessions.length} buổi học.`, "ok");
        } catch (e) { say("Không ghi được: " + (e.code || e.message), "err"); go.disabled = false; }
      };
      say("");
    } catch (e) { say("Không tính được: " + (e.code || e.message), "err"); }
  };
}
