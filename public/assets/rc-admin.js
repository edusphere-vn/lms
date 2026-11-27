// Hộp thoại "RC & học bù": tính lại số RC cho mọi buổi, và tạo buổi học bù cho các buổi bị hủy.
import { collection, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { recomputeRc, pendingMakeups, makeupSession } from "./rc-core.js";

export function openRcTools({ db, h, dlg }) {
  const msg = h("div", { class: "msg", role: "status" }), body = h("div", {});
  const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };
  dlg.className = "wide";
  dlg.replaceChildren(h("h3", {}, "RC và buổi học bù"),
    h("p", { class: "note" }, "Mỗi 10 buổi Có mặt/Vắng của một học viên là một RC (Hủy không tính). Số RC tính theo thứ tự ngày giờ trên tất cả giáo viên."),
    msg, body, h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Đóng")));
  dlg.showModal();
  load();

  async function load() {
    say("Đang tải buổi học..."); body.replaceChildren();
    try {
      const [ss, ts] = await Promise.all([getDocs(collection(db, "sessions")), getDocs(collection(db, "teachers"))]);
      const sessions = ss.docs.map((d) => ({ id: d.id, ...d.data() })), teachers = ts.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));
      const rc = recomputeRc(sessions), pend = pendingMakeups(sessions);
      const apply = h("button", { type: "button", class: "p", id: "rcApply", disabled: !rc.updates.length }, `Cập nhật số RC cho ${rc.updates.length} buổi`);
      apply.onclick = async () => {
        apply.disabled = true; say("Đang ghi...");
        try {
          for (let i = 0; i < rc.updates.length; i += 400) { const b = writeBatch(db); for (const u of rc.updates.slice(i, i + 400)) b.update(doc(db, "sessions", u.id), u.data); await b.commit(); }
          await load(); say(`Xong. Đã cập nhật ${rc.updates.length} buổi.`, "ok");
        } catch (e) { say("Không ghi được: " + (e.code || e.message), "err"); apply.disabled = false; }
      };
      const rows = pend.map((p) => {
        const date = h("input", { type: "date", style: "width:auto" }), time = h("input", { type: "time", step: 1800, value: p.time, style: "width:auto" });
        const tsel = h("select", { style: "width:auto" }, teachers.map((t) => h("option", { value: t.id, selected: t.id === p.teacherId }, t.name)));
        const go = h("button", { type: "button", class: "s", onclick: async () => {
          if (!date.value || !time.value) { say("Chọn ngày và giờ học bù.", "err"); return; }
          go.disabled = true;
          try { const m = makeupSession(p, { date: date.value, time: time.value, teacherId: tsel.value }); const b = writeBatch(db); b.set(doc(db, "sessions", m.id), { ...m.data, createdAt: Date.now() }); await b.commit(); await load(); say("Đã tạo buổi học bù.", "ok"); }
          catch (e) { say("Không tạo được: " + (e.code || e.message), "err"); go.disabled = false; }
        } }, "Tạo buổi bù");
        return h("tr", { "data-makeup": p.id }, h("td", {}, p.sc), h("td", {}, `${p.date} ${p.time}`), h("td", {}, date, " ", time), h("td", {}, tsel), h("td", {}, go));
      });
      body.replaceChildren(...[
        h("p", {}, rc.updates.length ? `${rc.updates.length} buổi cần cập nhật số RC.` : "Số RC đã đúng cho mọi buổi." + (rc.skippedLocked ? "" : "")),
        rc.skippedLocked ? h("p", { class: "note" }, `${rc.skippedLocked} buổi đã chốt lương nên giữ nguyên.`) : null, apply,
        h("h4", {}, `Buổi hủy chưa học bù (${pend.length})`),
        pend.length ? h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Học viên", "Buổi bị hủy", "Học bù vào", "Giáo viên", ""].map((t) => h("th", {}, t)))), h("tbody", {}, rows))) : h("p", { class: "note" }, "Không có buổi hủy nào chờ học bù.")].filter(Boolean));
      say("");
    } catch (e) { say("Không tải được: " + (e.code || e.message), "err"); }
  }
}
