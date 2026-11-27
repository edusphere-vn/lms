// Tab "Lương": tính lương giáo viên theo tháng (ngày 1 đến 30/31) từ buổi học đã điểm danh, xuất CSV, chốt lương.
import { collection, getDocs, doc, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { computePayroll, monthRange, payrollCsv } from "./payroll-core.js";

export async function renderPayroll(main, { db, h, alive = () => true }) {
  const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym = h("input", { type: "month", id: "payMonth", value: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`, style: "width:auto" });
  const go = h("button", { class: "p", id: "payGo", type: "button" }, "Tính lương"), msg = h("div", { class: "msg", role: "status" }), out = h("div", {});
  main.append(h("div", { class: "bar" }, h("h2", {}, "Lương giáo viên")),
    h("div", { class: "wrap", style: "padding:16px" },
      h("p", { class: "note" }, "Kỳ lương từ ngày 1 đến cuối tháng. Buổi Có mặt trả đủ, học viên Vắng trả mức vắng, Hủy bằng 0 (đã có buổi bù). Lớp nhóm tính theo buổi, chỉ cần một học viên Có mặt là trả đủ. Đơn giá lấy theo từng giáo viên, nếu để trống thì lấy đơn giá chung trong Cài đặt."),
      h("label", { class: "inline" }, "Tháng ", ym, " ", go), msg), out);
  const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };
  go.onclick = async () => {
    out.replaceChildren(); if (!ym.value) { say("Chọn tháng.", "err"); return; }
    say("Đang tính..."); const { from, to } = monthRange(ym.value);
    try {
      const [ss, ts, cs] = await Promise.all([getDocs(query(collection(db, "sessions"), where("date", ">=", from), where("date", "<=", to))), getDocs(collection(db, "teachers")), getDocs(collection(db, "config"))]);
      if (!alive()) return;
      const sessions = ss.docs.map((d) => ({ id: d.id, ...d.data() })), teachers = ts.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, ...d.data() }));
      const rows = computePayroll({ sessions, teachers, config: Object.fromEntries(cs.docs.map((d) => [d.id, d.data()])) });
      const sum = rows.reduce((a, r) => a + r.total, 0), unrep = rows.reduce((a, r) => a + r.unreported, 0), open = rows.reduce((a, r) => a + r.lines.filter((l) => !l.locked).length, 0);
      const csv = h("button", { class: "s", id: "payCsv", type: "button", onclick: () => {
        const a = h("a", { href: URL.createObjectURL(new Blob([payrollCsv(rows, ym.value)], { type: "text/csv;charset=utf-8" })), download: `luong-${ym.value}.csv` }); document.body.append(a); a.click(); a.remove(); } }, "Tải CSV");
      const ok = h("input", { type: "checkbox", id: "payOk" }), lock = h("button", { class: "danger", id: "payLock", type: "button", disabled: !open }, `Chốt lương (${open} buổi)`);
      ok.onchange = () => { lock.disabled = !ok.checked || !open; }; lock.disabled = true;
      lock.onclick = async () => {
        lock.disabled = true; say("Đang chốt...");
        try {
          const ids = rows.flatMap((r) => r.lines.filter((l) => !l.locked).map((l) => l.id));
          for (let i = 0; i < ids.length; i += 400) { const b = writeBatch(db); for (const id of ids.slice(i, i + 400)) b.update(doc(db, "sessions", id), { locked: true }); await b.commit(); }
          say(`Đã chốt ${ids.length} buổi. Giáo viên không sửa được các buổi này nữa.`, "ok"); go.click();
        } catch (e) { say("Không chốt được: " + (e.code || e.message), "err"); lock.disabled = false; }
      };
      out.replaceChildren(...[
        h("p", {}, h("strong", {}, `Tổng ${sum.toLocaleString("vi-VN")}`), ` cho ${rows.length} giáo viên, ${sessions.length} buổi trong kỳ.`, unrep ? ` Có ${unrep} buổi chưa điểm danh (tính 0, nên kiểm trước khi chốt).` : ""),
        h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Giáo viên", "Có mặt", "Vắng", "Hủy", "Chưa điểm danh", "Lương"].map((t) => h("th", {}, t)))),
          h("tbody", {}, rows.map((r) => h("tr", { "data-teacher": r.teacherId }, h("td", {}, h("details", {}, h("summary", {}, r.name),
            h("table", {}, h("tbody", {}, r.lines.map((l) => h("tr", {}, h("td", {}, l.date), h("td", {}, l.time), h("td", {}, `${l.minutes}p`), h("td", {}, l.scs.join(", ")), h("td", {}, l.status || "Chưa điểm danh"), h("td", {}, l.amount, l.locked ? " (đã chốt)" : ""))))))),
            h("td", {}, r.present), h("td", {}, r.absent), h("td", {}, r.cancelled), h("td", {}, r.unreported), h("td", {}, h("strong", {}, r.total.toLocaleString("vi-VN")))))))),
        h("div", { class: "row", style: "justify-content:space-between" }, csv, h("label", { class: "inline" }, ok, " Tôi đã kiểm tra, chốt lương kỳ này ", lock))].filter(Boolean));
      say("");
    } catch (e) { say("Không tính được: " + (e.code || e.message), "err"); }
  };
}
