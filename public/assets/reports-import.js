// Tab "Nhập báo cáo": nạp file lms_reports_export.json (xuất bằng Apps Script), ghép với học viên, xem trước rồi ghi buổi học và đánh giá.
import { collection, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { matchStudents, planReport } from "./reports-import-core.js";
import { matchTeacher, teacherKey } from "./import-core.js";

export async function renderReports(main, { db, h, alive = () => true }) {
  const [sSnap, tSnap, aSnap] = await Promise.all(["students", "teachers", "agencies"].map((c) => getDocs(collection(db, c))));
  if (!alive()) return;
  const students = sSnap.docs.map((d) => ({ sc: d.id, ...d.data() })), teachers = tSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));
  void aSnap;
  const msg = h("div", { class: "msg", role: "status" }), out = h("div", {}), file = h("input", { type: "file", id: "repFile", accept: ".json,application/json" });
  main.append(h("div", { class: "bar" }, h("h2", {}, "Nhập báo cáo cũ (từ các file Google Sheet)")),
    h("div", { class: "wrap", style: "padding:16px" },
      h("p", {}, "Chạy script Apps Script để xuất các file báo cáo thành file ", h("code", {}, "lms_reports_export.json"), " (xem docs/HUONG_DAN_XUAT_BAO_CAO.md), rồi chọn file đó ở đây. Hệ thống đọc file trong trình duyệt, cho xem trước và chưa ghi gì cho đến khi anh bấm Nhập."),
      file, msg), out);
  const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };

  file.addEventListener("change", async () => {
    out.replaceChildren(); if (!file.files[0]) return;
    say("Đang đọc file...");
    let data; try { data = JSON.parse(await file.files[0].text()); } catch { say("Không đọc được: đây không phải file JSON.", "err"); return; }
    if (!Array.isArray(data.reports)) { say("File không đúng định dạng (thiếu danh sách reports).", "err"); return; }
    say("");
    show(data);
  });

  function show(data) {
    const reps = data.reports.map((rep, i) => ({ rep, i, m: matchStudents(rep.student, students) }));
    // Ten giao vien trong file -> giao vien trong he thong
    const tnames = new Map();
    for (const { rep } of reps) for (const n of [rep.teacher, ...rep.rcs.flatMap((rc) => rc.sessions.map((s) => s.teacher))]) if (n) { const k = teacherKey(n); if (!tnames.has(k)) tnames.set(k, n); }
    const tmap = {}; for (const [k, n] of tnames) tmap[k] = matchTeacher(n, teachers)?.id || "";
    const teacherIdFor = (n) => (n ? tmap[teacherKey(n)] || "" : "");
    const choice = new Map(), include = new Set();   // choice: i -> sc
    for (const r of reps) { if (r.m.exact.length === 1) { choice.set(r.i, r.m.exact[0].sc); include.add(r.i); } }
    let minDate = "2026-01-01", onlyProblems = false, skipExisting = true;
    const plans = new Map();
    const planOf = (r) => { const sc = choice.get(r.i); if (!sc) return null; const key = r.i + "|" + sc + "|" + minDate; let p = plans.get(key); if (!p) { const stu = students.find((s) => s.sc === sc); p = planReport(r.rep, { sc, teacherIdFor, agencyId: stu?.agencyId || "", minDate, student: stu }); plans.set(key, p); } return p; };
    plans.clear();
    const counter = h("strong", {}), go = h("button", { type: "button", class: "p", id: "repGo" }, "Nhập vào hệ thống"), table = h("div", { class: "wrap", style: "max-height:50vh;overflow:auto" });
    const totals = () => { let s = 0, e = 0, n = 0; for (const r of reps) if (include.has(r.i) && choice.get(r.i)) { const p = planOf(r); s += p.sessions; e += p.evaluations; n++; } counter.textContent = `Sẽ nhập ${n} học viên: ${s} buổi học, ${e} đánh giá.`; go.disabled = !n; return { n, s, e }; };
    const problem = (r) => { const p = planOf(r); return !choice.get(r.i) || !p || p.flagged > 0 || p.warnings.length > 0; };
    const paint = () => table.replaceChildren(h("table", {}, h("thead", {}, h("tr", {}, ["", "File", "Học viên trong file", "Ghép với học viên", "Buổi", "Đánh giá", "Cần kiểm"].map((t) => h("th", {}, t)))),
      h("tbody", {}, reps.filter((r) => !onlyProblems || problem(r)).map((r) => {
        const p = planOf(r), cands = r.m.exact.length ? r.m.exact : r.m.near;
        return h("tr", { "data-i": r.i, class: problem(r) ? "flagged" : "" },
          h("td", {}, h("input", { type: "checkbox", checked: include.has(r.i), disabled: !choice.get(r.i), onchange: (e) => { e.target.checked ? include.add(r.i) : include.delete(r.i); totals(); } })),
          h("td", { title: r.rep.path || "" }, r.rep.fileName), h("td", {}, r.rep.student),
          h("td", {}, h("select", { onchange: (e) => { if (e.target.value) { choice.set(r.i, e.target.value); include.add(r.i); } else { choice.delete(r.i); include.delete(r.i); } paint(); totals(); } },
            h("option", { value: "" }, cands.length ? "— chọn —" : "— không tìm thấy —"),
            cands.map((s) => h("option", { value: s.sc, selected: s.sc === choice.get(r.i) }, `${s.fullName} (${s.sc})${r.m.exact.length ? "" : " · gần giống"}`)))),
          h("td", {}, p ? p.sessions : ""), h("td", {}, p ? p.evaluations : ""),
          h("td", { style: "white-space:normal;min-width:240px" }, !p ? h("span", { class: "flag check" }, "Chưa ghép được học viên") : [
            p.flagged ? h("span", { class: "flag check", title: p.flags.join(", ") }, `${p.flagged} buổi lệch giữa báo cáo và điểm danh`) : null,
            p.warnings.map((w) => h("span", { class: "flag", title: w }, w))]));
      }))));
    const tTable = h("div", { class: "wrap" }, h("table", {}, h("tbody", {}, [...tnames].map(([k, n]) => h("tr", { "data-tk": k }, h("td", {}, n),
      h("td", {}, h("select", { onchange: (e) => { tmap[k] = e.target.value; plans.clear(); paint(); totals(); } }, h("option", { value: "" }, "(chưa gán)"), teachers.map((t) => h("option", { value: t.id, selected: t.id === tmap[k] }, `${t.name} (${t.id})`)))))))));
    const errs = data.errors || [];
    out.append(
      h("p", {}, `File có ${reps.length} báo cáo` + (errs.length ? `, ${errs.length} file đọc lỗi (xem cuối trang).` : ".")),
      h("label", { class: "inline" }, "Bỏ qua buổi học trước ngày: ", h("input", { type: "date", id: "repMin", value: minDate, style: "width:auto", onchange: (e) => { minDate = e.target.value; plans.clear(); paint(); totals(); } })),
      h("label", { class: "inline" }, h("input", { type: "checkbox", checked: true, id: "repSkip", onchange: (e) => { skipExisting = e.target.checked; } }), " Không ghi đè buổi học và đánh giá đã có trong hệ thống (an toàn khi nhập lại)"),
      h("label", { class: "inline" }, h("input", { type: "checkbox", id: "repOnly", onchange: (e) => { onlyProblems = e.target.checked; paint(); } }), " Chỉ hiện báo cáo có vấn đề cần kiểm"),
      h("h4", {}, "Giáo viên trong file"), tTable, h("h4", {}, "Các báo cáo"), table,
      h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, counter, go),
      errs.length ? h("details", {}, h("summary", {}, `${errs.length} file đọc lỗi`), h("ul", {}, errs.map((e) => h("li", {}, `${e.path ? e.path + "/" : ""}${e.fileName}: ${e.error}`)))) : null);
    paint(); totals();
    go.onclick = async () => {
      go.disabled = true; say("Đang kiểm tra dữ liệu đã có...");
      try {
        const chosen = reps.filter((r) => include.has(r.i) && choice.get(r.i));
        const existing = new Set();
        if (skipExisting) for (const c of ["sessions", "evaluations"]) (await getDocs(collection(db, c))).docs.forEach((d) => existing.add(c + "/" + d.id));
        const ops = []; let skipped = 0, now = Date.now();
        for (const r of chosen) for (const w of planOf(r).writes) {
          if (skipExisting && existing.has(w.path)) { skipped++; continue; }
          ops.push({ ref: doc(db, w.path), data: w.path.startsWith("students/") ? w.data : { ...w.data, importedAt: now }, merge: w.path.startsWith("students/") });
        }
        for (let i = 0; i < ops.length; i += 400) {
          const b = writeBatch(db); for (const o of ops.slice(i, i + 400)) b.set(o.ref, o.data, { merge: o.merge }); await b.commit();
          say(`Đang ghi... ${Math.min(i + 400, ops.length)}/${ops.length}`);
        }
        say(`Xong. Đã ghi ${ops.length} bản ghi của ${chosen.length} học viên` + (skipped ? `, bỏ qua ${skipped} bản ghi đã có.` : "."), "ok");
      } catch (e) { say("Không ghi được: " + (e.code || e.message), "err"); go.disabled = false; }
    };
  }
}
