// Hộp thoại "Nhập danh sách học viên từ file" (xlsx/csv, sheet kiểu SL-Going): đọc trong trình duyệt,
// xem trước, đánh dấu "cần kiểm", rồi mới ghi vào Firestore (chạy bằng quyền admin, không cần khóa bí mật).
import { collection, getDocs, doc, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { parseStudentList, buildWrites } from "./import-core.js";

const loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => {
  const s = document.createElement("script"); s.src = "vendor/xlsx.full.min.js";
  s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error("Không tải được bộ đọc Excel.")); document.head.append(s);
});

export function openImport({ db, h, dlg, reload }) {
  const msg = h("div", { class: "msg", role: "status" }), body = h("div", {});
  const file = h("input", { type: "file", id: "impFile", accept: ".xlsx,.xls,.csv" });
  dlg.className = "wide";
  dlg.replaceChildren(h("h3", {}, "Nhập danh sách học viên từ file"),
    h("p", { class: "note" }, "Chọn file Excel/CSV có các cột SC, Agency, Name, Course, Period, Class, Skd, Length, VTime, Start, End, Paid, Status, Type, Teacher (như sheet SL-Going). Hệ thống chỉ đọc file trong trình duyệt của anh, chưa ghi gì cho đến khi anh bấm Nhập."),
    file, msg, body,
    h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Đóng")));
  dlg.showModal();

  let wb = null, existing = null;
  const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };
  file.addEventListener("change", async () => {
    body.replaceChildren(); if (!file.files[0]) return;
    say("Đang đọc file...");
    try {
      const X = await loadXlsx();
      wb = X.read(await file.files[0].arrayBuffer(), { type: "array" });
      const [t, a] = await Promise.all(["teachers", "agencies"].map((c) => getDocs(collection(db, c))));
      existing = { teachers: t.docs.map((d) => ({ id: d.id, name: d.data().name || d.id })), agencies: a.docs.map((d) => ({ id: d.id, name: d.data().name || d.id })) };
      const names = wb.SheetNames, guess = names.find((n) => /sl|going|student|học|hoc/i.test(n)) || names[0];
      const pick = h("select", { id: "impSheet" }, names.map((n) => h("option", { value: n, selected: n === guess }, n)));
      pick.addEventListener("change", () => showSheet(pick.value));
      body.append(h("label", {}, "Chọn sheet"), pick, h("div", { id: "impPreview" }));
      showSheet(guess);
    } catch (e) { say("Không đọc được file: " + e.message, "err"); }
  });

  function showSheet(name) {
    const box = body.querySelector("#impPreview"); box.replaceChildren();
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    const parsed = parseStudentList(rows, existing);
    if (parsed.error) { say(parsed.error, "err"); return; }
    const recs = parsed.records, include = new Set(recs.filter((r) => !r.dup && r.sc).map((r) => r.rowNo));
    const teacherMap = {}; for (const t of parsed.teachers) teacherMap[t.key] = t.suggestId || "__new__";
    let mergeByName = false, onlyCheck = false;
    const counter = h("strong", {}), go = h("button", { type: "button", class: "p", id: "impGo" }, "Nhập vào hệ thống");
    const table = h("div", { class: "wrap", style: "max-height:46vh;overflow:auto" });
    const update = () => {
      const plan = buildWrites(parsed, { include, teacherMap, existingTeacherIds: existing.teachers.map((t) => t.id), mergeByName });
      counter.textContent = `Sẽ nhập ${plan.enrollments} gói cho ${plan.students} học viên` + (plan.newTeachers ? `, tạo ${plan.newTeachers} giáo viên mới` : "") + ".";
      go.disabled = !plan.enrollments; return plan;
    };
    const paintRows = () => table.replaceChildren(h("table", {}, h("thead", {}, h("tr", {}, ["", "Dòng", "SC", "Học viên", "Khóa", "GV", "Bắt đầu", "Kết thúc", "Trạng thái", "Cần kiểm / ghi chú"].map((t) => h("th", {}, t)))),
      h("tbody", {}, recs.filter((r) => !onlyCheck || r.flags.some((f) => f.level === "check")).map((r) => h("tr", { "data-row": r.rowNo, class: r.flags.some((f) => f.level === "check") ? "flagged" : "" },
        h("td", {}, h("input", { type: "checkbox", checked: include.has(r.rowNo), disabled: !r.sc, onchange: (e) => { e.target.checked ? include.add(r.rowNo) : include.delete(r.rowNo); update(); } })),
        h("td", {}, r.rowNo), h("td", {}, r.sc), h("td", {}, r.name), h("td", {}, r.courseId || r.courseRaw), h("td", {}, r.teacherName), h("td", {}, r.startDate), h("td", {}, r.endDate), h("td", {}, r.status),
        h("td", { style: "white-space:normal;min-width:220px" }, r.flags.map((f) => h("span", { class: "flag " + f.level, title: f.code }, f.msg))))))));
    const checkCount = recs.filter((r) => r.flags.some((f) => f.level === "check")).length;
    box.append(
      h("p", {}, `Đọc được ${recs.length} dòng, bỏ qua ${parsed.skipped} dòng trống/tổng kết cuối sheet. ${checkCount} dòng có mục "cần kiểm" (tô màu), các dòng đó vẫn được nhập nếu anh để tích chọn; hãy xem lại trước khi nhập.`),
      h("label", { class: "inline" }, h("input", { type: "checkbox", onchange: (e) => { mergeByName = e.target.checked; update(); } }), " Gộp các SC cùng tên thành một học viên (mã học viên = SC của gói học sớm nhất)"),
      h("label", { class: "inline" }, h("input", { type: "checkbox", id: "impOnlyCheck", onchange: (e) => { onlyCheck = e.target.checked; paintRows(); } }), " Chỉ hiện dòng cần kiểm"),
      h("h4", {}, "Giáo viên trong file"),
      h("div", { class: "wrap" }, h("table", {}, h("tbody", {}, parsed.teachers.map((t) => h("tr", { "data-teacher": t.key },
        h("td", {}, t.name), h("td", {}, `${t.count} dòng`),
        h("td", {}, h("select", { onchange: (e) => { teacherMap[t.key] = e.target.value; update(); } },
          h("option", { value: "__new__", selected: !t.suggestId }, "Tạo giáo viên mới"),
          parsed.teachers.filter((o) => o.key !== t.key).map((o) => h("option", { value: "~" + o.key }, `Cùng người với "${o.name}" trong file`)),
          existing.teachers.map((e) => h("option", { value: e.id, selected: e.id === t.suggestId }, `${e.name} (${e.id})`)))),
        h("td", { class: "note" }, t.similarTo ? `Giống tên: ${t.similarTo.join(", ")} (nếu cùng một người, hãy chọn cùng một giáo viên)` : "")))))),
      h("h4", {}, "Các dòng"), table, h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, counter, go));
    paintRows(); update();
    go.onclick = async () => {
      go.disabled = true; say("Đang ghi...");
      try {
        const plan = update(), now = Date.now();
        const ops = plan.writes.map((w) => ({ ref: doc(db, w.path), data: { ...w.data, ...(w.path.startsWith("enrollments/") || w.path.startsWith("students/") ? { importedAt: now } : {}), ...(w.union?.teacherIds?.length ? { teacherIds: arrayUnion(...w.union.teacherIds) } : {}) } }));
        for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); for (const o of ops.slice(i, i + 400)) b.set(o.ref, o.data, { merge: true }); await b.commit(); }
        say(`Xong. Đã ghi ${plan.enrollments} gói, ${plan.students} học viên${plan.newTeachers ? `, ${plan.newTeachers} giáo viên mới` : ""}. Nhập lại cùng file sẽ không tạo bản trùng.`, "ok");
        await reload();
      } catch (e) { say("Không ghi được: " + (e.code || e.message), "err"); go.disabled = false; }
    };
    say("");
  }
}
