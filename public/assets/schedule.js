// Tab "Lịch giáo viên": lưới kiểu Google Sheet (chọn vùng, gõ để sửa, copy/paste TSV, kéo ô điền, hoàn tác).
// Dữ liệu: schedule/{teacherId} = { teacherId, cells: { "<cột>_<HHMM>": {t, k?} }, updatedAt }. Lịch lặp hằng tuần.
import { collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import * as G from "./grid-core.js";
import { openScheduleImport } from "./schedule-import.js";
import { openGenerate } from "./session-gen.js";
import { openRcTools } from "./rc-admin.js";

let cleanup = null;   // go bo cac listener cua lan ve truoc
export const leaveSchedule = () => { cleanup?.(); cleanup = null; };

export async function renderSchedule(main, { db, h, alive = () => true, dlg, reload }) {
  cleanup?.();
  const [tSnap, sSnap, eSnap, schSnap] = await Promise.all(["teachers", "students", "enrollments", "schedule"].map((c) => getDocs(collection(db, c))));
  if (!alive()) return;
  const teachers = tSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id })).sort((a, b) => a.name.localeCompare(b.name));
  if (!teachers.length) { main.append(h("div", { class: "wrap empty" }, "Chưa có giáo viên. Hãy thêm giáo viên trước ở tab Giáo viên.")); return; }
  const sched = {}; for (const t of teachers) sched[t.id] = {};
  for (const d of schSnap.docs) if (sched[d.id]) sched[d.id] = d.data().cells || {};
  // Mau o theo khoa hoc cua hoc vien (khop theo ten, bo dau): IELTS hong, con lai xanh.
  const nameOf = new Map(sS(sSnap).map((s) => [s.id, s.fullName]));
  const courseByName = new Map();
  for (const d of eSnap.docs) { const e = d.data(), n = nameOf.get(e.sc); if (n) courseByName.set(G.normName(n), e.courseId || ""); }

  let tid = teachers[0].id;
  let sel = { a: { r: 0, c: 0 }, f: { r: 0, c: 0 } }, editing = null, drag = null, fill = null, clip = null;
  const undo = {}, redo = {}, timers = {};
  const cells = () => sched[tid];
  const R = () => G.rect(sel.a, sel.f);

  const status = h("span", { class: "note", id: "gridStatus" }, "");
  const tabs = h("div", { class: "gtabs" });
  const table = h("table", { class: "grid" });
  const wrapper = h("div", { class: "gridwrap", tabindex: "0", id: "gridwrap", "aria-label": "Lưới lịch" }, table);
  const datalist = h("datalist", { id: "stuNames" }, [...new Set(sS(sSnap).map((s) => s.fullName).filter(Boolean))].sort().map((n) => h("option", { value: n })));
  const btn = (label, fn, id) => h("button", { class: "s", id, type: "button", onclick: () => { fn(); wrapper.focus(); } }, label);
  const toolbar = h("div", { class: "bar gtool" },
    btn("Hoàn tác", () => undoStep(), "gUndo"), btn("Làm lại", () => redoStep(), "gRedo"),
    h("span", { class: "note" }, "Đặt màu vùng chọn:"),
    btn("Tự động", () => setKind(undefined), "kAuto"), btn("Không rảnh", () => setKind("na"), "kNa"), btn("Giữ chỗ", () => setKind("res"), "kRes"),
    status, dlg ? h("button", { class: "s", id: "skdImportBtn", type: "button", style: "margin-left:auto", onclick: () => openScheduleImport({ db, h, dlg, reload }) }, "Nhập lịch từ file Excel") : null,
    dlg ? h("button", { class: "s", id: "genBtn", type: "button", onclick: async () => { if (Object.keys(timers).length) await Promise.all(Object.keys(timers).map(flush)); openGenerate({ db, h, dlg }); } }, "Tạo buổi học từ lịch") : null,
    dlg ? h("button", { class: "s", id: "rcBtn", type: "button", onclick: () => openRcTools({ db, h, dlg }) }, "RC và học bù") : null);
  main.append(h("div", { class: "bar" }, h("h2", {}, "Lịch giáo viên (lặp hằng tuần, giờ VN)")), tabs, toolbar, wrapper, datalist,
    h("p", { class: "note" }, "Cách dùng: bấm ô rồi gõ tên để sửa (Enter xuống dòng, Tab sang phải). Giữ Shift hoặc kéo chuột để chọn vùng. Ctrl+C/Ctrl+V sao chép được cả từ Google Sheets. Kéo chấm vuông ở góc vùng chọn để điền lặp. Delete để xóa, Ctrl+Z để hoàn tác. Nhiều học viên trong một ô (lớp nhóm): cách nhau bằng dấu phẩy. Ô viền đỏ = học viên bị xếp trùng giờ ở giáo viên khác."));

  // ---------- luu ----------
  const flush = async (id) => {
    clearTimeout(timers[id]); delete timers[id];
    status.textContent = "Đang lưu...";
    try { await setDoc(doc(db, "schedule", id), { teacherId: id, cells: sched[id], updatedAt: Date.now() }); status.textContent = "Đã lưu"; }
    catch (e) { status.textContent = "Không lưu được: " + (e.code || e.message); }
  };
  const saveSoon = () => { clearTimeout(timers[tid]); status.textContent = "Chưa lưu..."; const id = tid; timers[id] = setTimeout(() => flush(id), 600); };
  const mutate = (fn) => {
    const next = fn(cells()); if (next === cells()) return;
    (undo[tid] ||= []).push(JSON.stringify(cells())); if (undo[tid].length > 60) undo[tid].shift(); redo[tid] = [];
    sched[tid] = next; saveSoon(); paint();
  };
  const undoStep = () => { const s = undo[tid]?.pop(); if (s == null) return; (redo[tid] ||= []).push(JSON.stringify(cells())); sched[tid] = JSON.parse(s); saveSoon(); paint(); };
  const redoStep = () => { const s = redo[tid]?.pop(); if (s == null) return; (undo[tid] ||= []).push(JSON.stringify(cells())); sched[tid] = JSON.parse(s); saveSoon(); paint(); };
  const setKind = (k) => { const rc = R(); mutate((cs) => { let out = cs; for (let r = rc.r0; r <= rc.r1; r++) for (let c = rc.c0; c <= rc.c1; c++) { const cur = G.getCell(out, r, c); out = G.setCell(out, r, c, k ? { t: cur?.t || "", k } : cur?.t ? { t: cur.t } : null); } return out; }); };

  // ---------- ve ----------
  const kindOf = (cell) => {
    if (!cell) return "";
    if (cell.k) return cell.k;
    if (!cell.t) return "";
    const course = courseByName.get(G.normName(G.splitNames(cell.t)[0]));
    return course == null ? "plain" : /^IELTS/.test(course) ? "ielts" : "esl";
  };
  function paint() {
    const conflicts = G.findConflicts(sched)[tid] || new Set(), rc = R();
    tabs.replaceChildren(...teachers.map((t) => h("button", { class: "gtab", "aria-current": String(t.id === tid), "data-tid": t.id, onclick: async () => { if (timers[tid]) await flush(tid); tid = t.id; editing = null; paint(); wrapper.focus(); } },
      `${t.name} · ${G.countSlots(sched[t.id])}`)));
    const fillRc = fill?.dst;
    table.replaceChildren(
      h("thead", {}, h("tr", {}, h("th", {}, "Giờ VN"), h("th", {}, "Giờ Phil"), G.DAYS.map((d) => h("th", {}, d)))),
      h("tbody", {}, Array.from({ length: G.ROWS }, (_, r) => h("tr", {},
        h("th", { class: "tm" }, G.rowTime(r)), h("th", { class: "tm" }, G.hhmm(G.START_MIN + r * G.STEP + 60)),
        Array.from({ length: G.COLS }, (_, c) => {
          const cell = G.getCell(cells(), r, c), k = G.cellKey(r, c), inSel = r >= rc.r0 && r <= rc.r1 && c >= rc.c0 && c <= rc.c1;
          const cls = ["cell", kindOf(cell), inSel ? "sel" : "", sel.f.r === r && sel.f.c === c ? "focus" : "", conflicts.has(k) ? "conflict" : "",
            fillRc && r >= fillRc.r0 && r <= fillRc.r1 && c >= fillRc.c0 && c <= fillRc.c1 ? "fillprev" : ""].filter(Boolean).join(" ");
          const td = h("td", { class: cls, "data-r": r, "data-c": c, "data-key": k, title: conflicts.has(k) ? "Học viên này đang xếp trùng giờ với giáo viên khác" : null });
          if (editing && editing.r === r && editing.c === c) {
            const input = h("input", { class: "cellinput", list: "stuNames", value: editing.text ?? cell?.t ?? "" });
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(input.value, 1, 0); }
              else if (e.key === "Tab") { e.preventDefault(); commit(input.value, 0, e.shiftKey ? -1 : 1); }
              else if (e.key === "Escape") { editing = null; paint(); wrapper.focus(); }
              e.stopPropagation();
            });
            input.addEventListener("blur", () => { if (editing) commit(input.value, 0, 0); });
            td.append(input); queueMicrotask(() => { input.focus(); const n = input.value.length; input.setSelectionRange(n, n); });
          } else td.append(cell?.t || "");
          if (!editing && r === rc.r1 && c === rc.c1) td.append(h("span", { class: "fh", "data-fh": "1" }));
          return td;
        })))));
  }
  const move = (dr, dc, extend) => {
    const f = { r: Math.max(0, Math.min(G.ROWS - 1, sel.f.r + dr)), c: Math.max(0, Math.min(G.COLS - 1, sel.f.c + dc)) };
    sel = { a: extend ? sel.a : f, f }; paint(); scrollIntoView();
  };
  const scrollIntoView = () => wrapper.querySelector("td.focus")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  function startEdit(text) { editing = { r: sel.f.r, c: sel.f.c, text }; sel = { a: sel.f, f: sel.f }; paint(); }
  function commit(value, dr, dc) {
    const { r, c } = editing; editing = null;
    const t = value.trim(), cur = G.getCell(cells(), r, c);
    if ((cur?.t || "") !== t) mutate((cs) => G.setCell(cs, r, c, t || cur?.k ? { t, ...(cur?.k ? { k: cur.k } : {}) } : null));
    sel = { a: { r, c }, f: { r, c } }; if (dr || dc) move(dr, dc, false); else paint();
    wrapper.focus();
  }

  // ---------- ban phim ----------
  const onKey = (e) => {
    if (editing || !wrapper.contains(document.activeElement) && document.activeElement !== wrapper) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); e.shiftKey ? redoStep() : undoStep(); }
      else if (k === "y") { e.preventDefault(); redoStep(); }
      else if (k === "a") { e.preventDefault(); sel = { a: { r: 0, c: 0 }, f: { r: G.ROWS - 1, c: G.COLS - 1 } }; paint(); }
      return;   // copy/cut/paste xu ly o su kien rieng
    }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); move(...arrows[e.key], e.shiftKey); }
    else if (e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1, false); }
    else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const rc = R(); mutate((cs) => G.clearRect(cs, rc)); }
    else if (e.key.length === 1 && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  };
  const copyRect = (e, cut) => {
    if (editing || !wrapper.contains(document.activeElement) && document.activeElement !== wrapper) return;
    e.preventDefault();
    const rc = R(), m = G.matrixOf(cells(), rc), text = G.toTSV(m.map((row) => row.map((x) => x?.t || "")));
    clip = { text, m }; e.clipboardData.setData("text/plain", text);
    if (cut) mutate((cs) => G.clearRect(cs, rc));
  };
  const onPaste = (e) => {
    if (editing || !wrapper.contains(document.activeElement) && document.activeElement !== wrapper) return;
    const text = e.clipboardData.getData("text/plain"); if (!text) return;
    e.preventDefault();
    const m = clip && clip.text === text ? clip.m : G.textMatrix(G.parseTSV(text));
    const rc = R(), r0 = rc.r0, c0 = rc.c0;
    // Dan 1 o vao vung chon lon: lap lai cho ca vung (nhu Google Sheets).
    const single = m.length === 1 && m[0].length === 1 && (rc.r1 > rc.r0 || rc.c1 > rc.c0);
    mutate((cs) => single ? G.fillRect(G.setCell(cs, r0, c0, m[0][0]), { r0, r1: r0, c0, c1: c0 }, rc) : G.pasteMatrix(cs, r0, c0, m));
    const h2 = Math.min(G.ROWS - 1, r0 + (single ? rc.r1 - r0 : m.length - 1)), w2 = Math.min(G.COLS - 1, c0 + (single ? rc.c1 - c0 : Math.max(...m.map((x) => x.length)) - 1));
    sel = { a: { r: r0, c: c0 }, f: { r: h2, c: w2 } }; paint();
  };
  const onCopy = (e) => copyRect(e, false), onCut = (e) => copyRect(e, true);
  document.addEventListener("keydown", onKey); document.addEventListener("copy", onCopy); document.addEventListener("cut", onCut); document.addEventListener("paste", onPaste);

  // ---------- chuot ----------
  const cellAt = (el) => { const td = el.closest?.("td.cell"); return td ? { r: Number(td.dataset.r), c: Number(td.dataset.c) } : null; };
  table.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.dataset.fh) { e.preventDefault(); fill = { src: R(), dst: null }; wrapper.focus(); return; }
    const p = cellAt(e.target); if (!p || editing) return;
    e.preventDefault(); sel = { a: e.shiftKey ? sel.a : p, f: p }; drag = true; paint(); wrapper.focus();
  });
  table.addEventListener("mouseover", (e) => {
    const p = cellAt(e.target); if (!p) return;
    if (fill) { const dst = G.fillTarget(fill.src, p.r, p.c); if (JSON.stringify(dst) !== JSON.stringify(fill.dst)) { fill.dst = dst; paint(); } }
    else if (drag && (p.r !== sel.f.r || p.c !== sel.f.c)) { sel = { a: sel.a, f: p }; paint(); }
  });
  table.addEventListener("dblclick", (e) => { const p = cellAt(e.target); if (p && !editing) { sel = { a: p, f: p }; startEdit(); } });
  const onUp = () => {
    if (fill) { const { src, dst } = fill; fill = null; if (dst) { mutate((cs) => G.fillRect(cs, src, dst)); const u = G.unionRect(src, dst); sel = { a: { r: u.r0, c: u.c0 }, f: { r: u.r1, c: u.c1 } }; } paint(); }
    drag = null;
  };
  document.addEventListener("mouseup", onUp);
  const onUnload = () => { for (const id of Object.keys(timers)) flush(id); };
  window.addEventListener("beforeunload", onUnload);

  cleanup = () => {
    document.removeEventListener("keydown", onKey); document.removeEventListener("copy", onCopy); document.removeEventListener("cut", onCut);
    document.removeEventListener("paste", onPaste); document.removeEventListener("mouseup", onUp); window.removeEventListener("beforeunload", onUnload);
    for (const id of Object.keys(timers)) flush(id);
  };
  paint(); wrapper.focus();
}
function sS(snap) { return snap.docs.map((d) => ({ id: d.id, ...d.data() })); }
