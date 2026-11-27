// Hộp thoại "Nhập lịch từ file Excel" (sheet ClassSKD): đọc cả màu ô để nhận ô "Không rảnh" (đỏ sẫm) và "Giữ chỗ" (vàng).
import { collection, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { parseClassSkd, buildScheduleWrites } from "./schedule-import-core.js";
import { matchTeacher } from "./import-core.js";

const loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => {
  const s = document.createElement("script"); s.src = "vendor/xlsx.full.min.js";
  s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("Không tải được bộ đọc Excel.")); document.head.append(s);
});

export function openScheduleImport({ db, h, dlg, reload }) {
  const msg = h("div", { class: "msg", role: "status" }), body = h("div", {});
  const file = h("input", { type: "file", id: "skdFile", accept: ".xlsx,.xls" });
  dlg.className = "wide";
  dlg.replaceChildren(h("h3", {}, "Nhập lịch giáo viên từ file Excel"),
    h("p", { class: "note" }, "Chọn file có sheet lịch dạng ClassSKD (mỗi giáo viên một khối, cột Monday..Sunday, dòng 30 phút). Hệ thống đọc cả màu ô. Chưa ghi gì cho đến khi anh bấm Nhập."),
    file, msg, body, h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Đóng")));
  dlg.showModal();
  const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };
  let wb = null, teachers = [], current = {};
  file.addEventListener("change", async () => {
    body.replaceChildren(); if (!file.files[0]) return; say("Đang đọc file...");
    try {
      const X = await loadXlsx();
      wb = X.read(await file.files[0].arrayBuffer(), { type: "array", cellStyles: true });
      const [t, s] = await Promise.all(["teachers", "schedule"].map((c) => getDocs(collection(db, c))));
      teachers = t.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));
      current = Object.fromEntries(s.docs.map((d) => [d.id, d.data().cells || {}]));
      const guess = wb.SheetNames.find((n) => /skd|sched|lich|lịch/i.test(n)) || wb.SheetNames[0];
      const pick = h("select", { id: "skdSheet" }, wb.SheetNames.map((n) => h("option", { value: n, selected: n === guess }, n)));
      pick.addEventListener("change", () => show(pick.value));
      body.append(h("label", {}, "Chọn sheet"), pick, h("div", { id: "skdPreview" })); show(guess);
    } catch (e) { say("Không đọc được file: " + e.message, "err"); }
  });
  function show(name) {
    const box = body.querySelector("#skdPreview"); box.replaceChildren();
    const ws = wb.Sheets[name], X = window.XLSX;
    const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    const parsed = parseClassSkd(rows, (r, c) => ws[X.utils.encode_cell({ r, c })]?.s?.fgColor?.rgb || "");
    if (!parsed.blocks.length) { say("Không tìm thấy khối lịch giáo viên nào trong sheet này.", "err"); return; }
    const map = {}; for (const b of parsed.blocks) map[b.key] = matchTeacher(b.name, teachers)?.id || "__new__";
    let overwrite = true;
    const counter = h("strong", {}), go = h("button", { type: "button", class: "p", id: "skdGo" }, "Nhập lịch");
    const update = () => { const plan = buildScheduleWrites(parsed.blocks, { teacherMap: map, existingIds: teachers.map((t) => t.id), existingCells: current, overwrite });
      counter.textContent = `Sẽ ghi lịch cho ${parsed.blocks.length} giáo viên` + (plan.newTeachers ? `, tạo ${plan.newTeachers} giáo viên mới` : "") + "."; return plan; };
    box.append(
      h("p", {}, `Tìm thấy ${parsed.blocks.length} khối giáo viên.` + (parsed.dropped ? ` ${parsed.dropped} ô nằm ngoài khung 06:00-23:30 nên bị bỏ qua.` : "")),
      h("label", { class: "inline" }, h("input", { type: "checkbox", checked: true, id: "skdOver", onchange: (e) => { overwrite = e.target.checked; update(); } }), " Ghi đè lịch hiện có của các giáo viên này (bỏ chọn: chỉ điền vào ô còn trống)"),
      h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Trong file", "Ô có học viên", "Ô đánh dấu màu", "Nhập vào giáo viên"].map((t) => h("th", {}, t)))),
        h("tbody", {}, parsed.blocks.map((b) => h("tr", { "data-block": b.key }, h("td", {}, b.rawName), h("td", {}, b.count), h("td", {}, b.marked),
          h("td", {}, h("select", { onchange: (e) => { map[b.key] = e.target.value; update(); } },
            h("option", { value: "__new__", selected: map[b.key] === "__new__" }, "Tạo giáo viên mới"),
            teachers.map((t) => h("option", { value: t.id, selected: t.id === map[b.key] }, `${t.name} (${t.id})`))))))))),
      h("p", { class: "note" }, "Màu đỏ sẫm/đỏ nâu/đỏ tươi được coi là \"Không rảnh\", màu vàng là \"Giữ chỗ\". Màu xanh/hồng (ESL/IELTS) tự suy ra từ khóa học của học viên."),
      h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, counter, go));
    update(); say("");
    go.onclick = async () => {
      go.disabled = true; say("Đang ghi...");
      try {
        const plan = update(), ops = plan.writes.map((w) => ({ ref: doc(db, w.path), data: w.path.startsWith("schedule/") ? { ...w.data, updatedAt: Date.now() } : w.data }));
        for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); for (const o of ops.slice(i, i + 400)) b.set(o.ref, o.data, { merge: !o.ref.path.startsWith("schedule/") }); await b.commit(); }
        say(`Xong. Đã ghi lịch của ${parsed.blocks.length} giáo viên${plan.newTeachers ? `, tạo ${plan.newTeachers} giáo viên mới` : ""}.`, "ok");
        await reload();
      } catch (e) { say("Không ghi được: " + (e.code || e.message), "err"); go.disabled = false; }
    };
  }
}
