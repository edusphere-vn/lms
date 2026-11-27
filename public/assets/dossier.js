// Hồ sơ lớp của một học viên (theo mẫu file báo cáo gốc), dùng chung cho giáo viên, admin, học viên và agency:
// General (thông tin, bảng cấp độ, bảng quy đổi, điểm danh), RC1..RCn (các buổi học + EVALUATION cuối RC), Buổi mới.
// Quyền theo vai trò (ctx.role): teacher/admin nhập được buổi học và đánh giá, admin duyệt đánh giá, student/agency chỉ xem phần đã duyệt.
import { doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { API_BASE } from "./firebase.js";
import { isCounted } from "./rc-core.js";
import { RUBRICS } from "./defaults.js";
import { CEFR_CRITERION_RANGES, EVAL_STATUS, evalSpec, computeResult, validateScores, makeEvaluation, evalId, kindOf, totalOf, levelOf } from "./eval-core.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
export const STATUSES = [["", "Chưa điểm danh"], ["Present", "Có mặt (Present)"], ["Absent", "Vắng (Absent)"], ["Cancelled", "Hủy, sẽ học bù (Cancelled)"]];
export const STATUS_LABEL = { Present: ["Có mặt", "ok"], Absent: ["Vắng", "warn"], Cancelled: ["Hủy", "bad"], "": ["Chưa điểm danh", "info"] };
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
const endTime = (t, min) => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + min; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const byTime = (a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const rcOf = (s, sc) => s.rc?.[sc] || (s.scs?.[0] === sc && s.rcNo ? { no: s.rcNo, seq: s.rcSeq } : null);

// Nhờ Worker tính lại số RC sau khi lưu (giáo viên không đọc được buổi của giáo viên khác). Lỗi thì bỏ qua.
export async function refreshRc(user, s) {
  if (!user) return false;
  try {
    const res = await fetch(API_BASE + "/api/sessions/recompute-rc", { method: "POST", headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" }, body: JSON.stringify({ sessionId: s.id }) });
    if (!res.ok) return false; const j = await res.json(); s.rc = j.rc; s.rcNo = j.rcNo; s.rcSeq = j.rcSeq; return true;
  } catch { return false; }
}

const badge = (st) => { const [l, c] = EVAL_STATUS[st] || [st || "—", "info"]; return h("span", { class: "badge " + c, "data-evstatus": st }, l); };

// ctx: { db, user, role, students, sessions, courseOf, evaluations, teachers: {id: name}, teacherId, onChange }
export function openDossier(ctx, scs, focusId) {
  let dlg = document.getElementById("dossier");
  if (!dlg) { dlg = h("dialog", { id: "dossier", class: "dossier" }); document.body.append(dlg); dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); }
  run(dlg, ctx, scs, { focusId, head: true, onClose: () => dlg.close() });
  if (!dlg.open) dlg.showModal();
}
export function mountDossier(ctx, scs, container, opts = {}) {
  const root = h("div", { class: "dossier-inline", id: "dossierInline" });
  container.replaceChildren(root);
  run(root, ctx, scs, { head: false, ...opts });
}

function run(root, ctx, scs, { focusId, head, onClose }) {
  const { db, user, role, students, sessions, courseOf, evaluations } = ctx;
  const canEditSessions = role === "teacher" || role === "admin", canEval = canEditSessions, canApprove = role === "admin";
  const tname = (id) => ctx.teachers?.[id] || "";
  let sc = scs[0], tab = null, editNo = null;
  const mine = () => sessions.filter((s) => (s.scs || []).includes(sc));
  const counted = () => mine().filter((s) => isCounted(s.attendance?.[sc])).sort(byTime);
  const pending = () => mine().filter((s) => !isCounted(s.attendance?.[sc])).sort(byTime);
  const evs = () => evaluations.filter((e) => e.sc === sc);
  const evOf = (no) => evs().find((e) => e.rcNo === no);
  const rcNos = () => [...new Set([...counted().map((s) => rcOf(s, sc)?.no), ...evs().map((e) => e.rcNo)].filter((n) => n > 0))].sort((a, b) => a - b);
  const spec = () => evalSpec(courseOf[sc]?.courseId);
  const rerender = (focus) => render(focus);
  const sig = () => rcNos().join(",") + "|" + pending().length;   // đổi khi buổi vừa lưu chuyển sang RC khác hoặc rời khỏi danh sách chờ

  // ---------- buổi học ----------
  function sessionView(s) {
    const r = rcOf(s, sc), st = STATUS_LABEL[s.attendance?.[sc] || ""];
    return h("article", { class: "session ro", "data-id": s.id },
      h("header", {}, h("strong", {}, `${dmy(s.date)}${s.time ? " · " + s.time + "-" + endTime(s.time, s.minutes || 25) : ""}`), h("span", { class: "note" }, `${s.minutes || 25} phút`),
        r ? h("span", { class: "tag rc" }, `RC${r.no} · buổi ${r.seq}`) : null, tname(s.teacherId) ? h("span", { class: "note" }, tname(s.teacherId)) : null, h("span", { class: "badge " + st[1], style: "margin-left:auto" }, st[0])),
      s.topic ? h("div", { class: "fv" }, h("span", { class: "k" }, "Progress"), h("p", {}, s.topic)) : null,
      s.lesson ? h("div", { class: "fv" }, h("span", { class: "k" }, "Academic Performance"), h("p", {}, s.lesson)) : null,
      s.feedback ? h("div", { class: "fv" }, h("span", { class: "k" }, "Class Participation"), h("p", {}, s.feedback)) : null);
  }
  function sessionForm(s) {
    const locked = !!s.locked, msg = h("span", { class: "note" }, s.reportedAt ? `Đã lưu ${new Date(s.reportedAt).toLocaleString("vi-VN")}` : ""), r = rcOf(s, sc);
    const sel = h("select", { "data-sc": sc, disabled: locked }, STATUSES.map(([v, l]) => h("option", { value: v, selected: v === (s.attendance?.[sc] || "") }, l)));
    const field = (label, key, ph) => h("div", { class: "fld" }, h("label", {}, label), h("textarea", { "data-f": key, rows: "3", placeholder: ph, disabled: locked }, s[key] || ""));
    const el = h("article", { class: "session" + (s.reportedAt ? " done" : ""), "data-id": s.id },
      h("header", {}, h("strong", {}, `${dmy(s.date)}${s.time ? " · " + s.time + "-" + endTime(s.time, s.minutes || 25) : ""}`), h("span", { class: "note" }, `${s.minutes || 25} phút`),
        r ? h("span", { class: "tag rc" }, `RC${r.no} · buổi ${r.seq}`) : null, s.makeupOf ? h("span", { class: "tag" }, "Học bù") : null, locked ? h("span", { class: "tag" }, "Đã chốt lương") : null,
        role === "admin" && tname(s.teacherId) ? h("span", { class: "note" }, tname(s.teacherId)) : null, h("span", { style: "margin-left:auto" }, sel)),
      field("Progress (giáo trình / chủ đề)", "topic", "Ví dụ: OXFORD DISCOVERY 1"), field("Academic Performance (bài học, từ vựng, ngữ pháp)", "lesson", "Nội dung buổi học"), field("Class Participation (nhận xét)", "feedback", "Nhận xét về học viên"),
      h("div", { class: "row" }, msg, h("button", { class: "p", disabled: locked, onclick: async (e) => {
        e.target.disabled = true; msg.className = "note"; msg.textContent = "Đang lưu..."; const before = sig();
        const data = { attendance: { ...(s.attendance || {}), [sc]: sel.value }, reportedAt: Date.now() };
        for (const f of ["topic", "lesson", "feedback"]) data[f] = el.querySelector(`[data-f=${f}]`).value.trim();
        try {
          await updateDoc(doc(db, "sessions", s.id), data); Object.assign(s, data);
          msg.textContent = `Đã lưu ${new Date(data.reportedAt).toLocaleString("vi-VN")}`; el.classList.add("done");
          ctx.onChange?.(s);
          if (sig() !== before) { tab = null; rerender(s.id); }   // buổi vừa chuyển tab: vẽ lại ngay
          const after = sig(), refreshed = await refreshRc(user, s);
          // Worker tính lại RC xong mới vẽ lại nếu số RC đổi, trừ khi người dùng đã gõ dở form đánh giá (tránh mất chữ)
          if (refreshed && sig() !== after && !root.querySelector("[data-eval-form].dirty")) { tab = null; rerender(s.id); ctx.onChange?.(s); }
        } catch (err) { msg.className = "msg err"; msg.textContent = "Không lưu được: " + (err.code || err.message); }
        e.target.disabled = false; } }, "Lưu")));
    return el;
  }
  const sessionCard = (s) => (canEditSessions ? sessionForm(s) : sessionView(s));

  // ---------- EVALUATION cuối mỗi RC ----------
  function rubricHint(sp) {
    if (sp.ielts) return h("details", { class: "rubric" }, h("summary", {}, "Bảng quy đổi Band sang CEFR"), h("div", { class: "wrap" }, h("table", {}, h("tbody", {}, [["CEFR", ...Object.values(RUBRICS).filter((r) => r.scale === "IELTS_BAND").map((r) => r.level)], ["Band", ...Object.values(RUBRICS).filter((r) => r.scale === "IELTS_BAND").map((r) => r.ielts)]].map((row) => h("tr", {}, row.map((c) => h("td", {}, c))))))));
    return h("details", { class: "rubric" }, h("summary", {}, "Bảng quy đổi điểm từng tiêu chí (/20) sang CEFR"), h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["CEFR", "Điểm mỗi tiêu chí", "Tổng /100"].map((t) => h("th", {}, t)))),
      h("tbody", {}, CEFR_CRITERION_RANGES.map(([lv, a, b]) => h("tr", {}, h("td", {}, lv), h("td", {}, `${a} – ${b}`), h("td", {}, `${RUBRICS["CEFR100_" + lv].min} – ${RUBRICS["CEFR100_" + lv].max}`)))))));
  }
  function evalTable(ev, sp) {
    const cols = Object.keys(ev.scores || {}).filter((k) => k !== "Band Score").length ? Object.keys(ev.scores).filter((k) => k !== "Band Score") : sp.criteria, tot = totalOf(ev, sp);
    return h("div", { class: "wrap" }, h("table", { class: "evtable" }, h("thead", {}, h("tr", {}, ["Date", ...cols, sp.ielts ? "Band Score" : "Total", "Level"].map((t) => h("th", {}, t)))),
      h("tbody", {}, h("tr", {}, h("td", {}, dmy(ev.date)), cols.map((k) => h("td", {}, ev.scores?.[k] ?? "")), h("td", {}, h("strong", {}, tot ?? "")), h("td", {}, h("strong", {}, ev.level || levelOf(sp.scale, tot)))))));
  }
  function evalReadonly(ev, no) {
    const sp = spec(), cm = ev.comments || {};
    const keys = [...Object.keys(cm).filter((k) => k !== "General Review")];
    return h("section", { class: "evaluation", "data-eval": no }, h("div", { class: "evhead" }, h("h4", {}, `EVALUATION · ${ev.kind || kindOf(no)}`), canEval ? badge(ev.status) : null),
      evalTable(ev, sp),
      keys.map((k) => h("div", { class: "fv" }, h("span", { class: "k" }, k), h("p", {}, cm[k]))),
      cm["General Review"] ? h("div", { class: "fv" }, h("span", { class: "k" }, "General Review"), h("p", {}, cm["General Review"])) : null);
  }
  function evalForm(no) {
    const ev = evOf(no), sp = spec(), st = students[sc] || {}, cols = sp.criteria;
    const inp = (k) => h("input", { type: "number", "data-score": k, min: 0, max: sp.max, step: sp.step, inputmode: "decimal", value: ev?.scores?.[k] ?? "" });
    const date = h("input", { type: "date", "data-f": "evDate", value: ev?.date || todayIso() });
    const band = sp.ielts ? h("input", { type: "number", "data-f": "band", min: 0, max: 9, step: 0.5, value: ev ? totalOf(ev, sp) ?? "" : "" }) : null;
    let bandTouched = !!ev && sp.ielts && ev.total != null && computeResult(sp, ev.scores || {}).total !== ev.total;
    const result = h("div", { class: "evresult" }), msg = h("span", { class: "msg", role: "status" });
    const read = () => Object.fromEntries(cols.map((k) => [k, form.querySelector(`[data-score="${CSS.escape(k)}"]`)?.value ?? ""]));
    const update = () => {
      const r = computeResult(sp, read());
      if (band && !bandTouched && r.total != null) band.value = r.total;
      const tot = band ? (band.value === "" ? null : Number(band.value)) : r.total;
      result.replaceChildren(h("span", {}, sp.ielts ? "Band Score: " : "Tổng: "), h("strong", {}, tot == null ? "—" : sp.ielts ? tot : `${tot}/${sp.totalMax}`), h("span", {}, " · Level: "), h("strong", {}, tot == null ? "—" : levelOf(sp.scale, tot) || "—"));
    };
    const cmt = (k, label) => h("div", { class: "fld" }, h("label", {}, label || k), h("textarea", { "data-comment": k, rows: "3", placeholder: k === "General Review" ? "Nhận xét tổng quát và hướng dẫn luyện tập tiếp theo" : `Nhận xét về ${k}` }, ev?.comments?.[k] || ""));
    const form = h("section", { class: "evaluation edit", "data-eval-form": no },
      h("div", { class: "evhead" }, h("h4", {}, `EVALUATION · ${kindOf(no)}`), ev ? badge(ev.status) : h("span", { class: "badge info" }, "Chưa nhập")),
      h("div", { class: "evgrid" }, h("div", { class: "fld" }, h("label", {}, "Date"), date),
        cols.map((k) => h("div", { class: "fld" }, h("label", {}, `${k} (${sp.max})`), inp(k))),
        band ? h("div", { class: "fld" }, h("label", {}, "Band Score"), band) : null),
      result, rubricHint(sp),
      cols.map((k) => cmt(k)), cmt("General Review", "General Review"),
      h("div", { class: "row" }, msg, ...buttons()));
    form.addEventListener("input", () => form.classList.add("dirty"));
    for (const el of form.querySelectorAll("[data-score]")) el.addEventListener("input", update);
    band?.addEventListener("input", () => { bandTouched = true; update(); });
    queueMicrotask(update);
    function buttons() {
      const go = (status, label, cls = "s") => h("button", { type: "button", class: cls, "data-evsave": status, onclick: (e) => save(status, e.target) }, label);
      if (canApprove) return [go(ev?.status === "Approved" ? "Approved" : "Draft", ev?.status === "Approved" ? "Lưu thay đổi" : "Lưu nháp"), ev?.status === "Approved" ? go("Submitted", "Thu hồi duyệt") : go("Approved", "Duyệt và công bố cho học viên", "p")];
      return [go("Draft", "Lưu nháp"), go("Submitted", "Gửi duyệt", "p")];
    }
    async function save(status, btn) {
      const scores = read(), errs = validateScores(sp, scores);
      msg.className = "msg err";
      if (!date.value) { msg.textContent = "Chọn ngày đánh giá."; return; }
      if (errs.length) { msg.textContent = errs[0]; return; }
      if (status !== "Draft" && (sp.criteria.length ? sp.criteria.some((k) => scores[k] === "") : !band?.value)) { msg.textContent = "Nhập đủ điểm các tiêu chí trước khi gửi duyệt hoặc duyệt."; return; }
      const comments = {}; for (const t of form.querySelectorAll("[data-comment]")) comments[t.dataset.comment] = t.value;
      const lastT = [...mine()].sort(byTime).reverse().find((s) => s.teacherId)?.teacherId;
      const data = makeEvaluation({ sc, no, spec: sp, date: date.value, scores, band: band?.value, comments, teacherId: ev?.teacherId || (role === "teacher" ? ctx.teacherId : lastT) || "", agencyId: st.agencyId || courseOf[sc]?.agencyId || ev?.agencyId || "", status });
      for (const b of form.querySelectorAll("button")) b.disabled = true; msg.className = "msg"; msg.textContent = "Đang lưu...";
      try {
        await setDoc(doc(db, "evaluations", evalId(sc, no)), data);
        const i = evaluations.findIndex((e) => e.sc === sc && e.rcNo === no), rec = { id: evalId(sc, no), ...data };
        if (i >= 0) evaluations[i] = rec; else evaluations.push(rec);
        ctx.onChange?.(); editNo = null; render(); flash(`Đã lưu đánh giá (${EVAL_STATUS[status][0]})`);
      } catch (err) { msg.className = "msg err"; msg.textContent = "Không lưu được: " + (err.code || err.message); for (const b of form.querySelectorAll("button")) b.disabled = false; }
    }
    return form;
  }
  function flash(text) { const m = root.querySelector("[data-flash]"); if (m) { m.textContent = text; m.hidden = false; setTimeout(() => { m.hidden = true; }, 4000); } }
  function evalBlock(no) {
    const ev = evOf(no);
    if (canEval && (!ev || canApprove || ev.status !== "Approved")) return evalForm(no);
    if (ev) return evalReadonly(ev, no);
    return h("p", { class: "note", "data-eval-empty": no }, "Đánh giá cuối RC sẽ hiện ở đây sau khi giáo viên hoàn thành và được duyệt.");
  }

  // ---------- General ----------
  function levelTable() {
    const sp = spec(), nos = [0, 1, 2, 3, 4, 5, ...evs().map((e) => e.rcNo).filter((n) => n > 5)].filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a - b);
    return h("div", { class: "wrap" }, h("table", { class: "evtable", id: "levelTable" }, h("thead", {}, h("tr", {}, ["Date", ...sp.criteria, sp.ielts ? "Band Score" : "Total", "Level", "Remark", canEval ? "" : null].filter((t) => t !== null).map((t) => h("th", {}, t)))),
      h("tbody", {}, nos.map((no) => { const ev = evOf(no), tot = ev ? totalOf(ev, sp) : null;
        return h("tr", { "data-remark": kindOf(no) }, h("td", {}, ev ? dmy(ev.date) : ""), sp.criteria.map((k) => h("td", {}, ev?.scores?.[k] ?? "")), h("td", {}, tot ?? ""), h("td", {}, ev ? ev.level || levelOf(sp.scale, tot) : h("span", { class: "note" }, "—")), h("td", {}, kindOf(no), ev && canEval ? [" ", badge(ev.status)] : null),
          canEval ? h("td", {}, h("button", { type: "button", class: "s", "data-evedit": no, disabled: ev?.status === "Approved" && !canApprove, onclick: () => { if (no > 0 && rcNos().includes(no)) { tab = "rc" + no; } else { editNo = no; } render(); } }, ev ? "Sửa" : "Nhập")) : null); }))));
  }
  function comparison() {
    const rows = Object.values(RUBRICS).filter((r) => r.scale === "CEFR100");
    return h("div", { class: "wrap" }, h("table", { class: "evtable" }, h("tbody", {}, [["CEFR", ...rows.map((r) => r.level)], ["SCORE", ...rows.map((r) => (r.max === 100 ? `${r.min} – 100` : `${r.min} – ${r.max}`))], ["IELTS Band", ...rows.map((r) => r.ielts)]].map((row, i) => h("tr", {}, row.map((c, j) => h(j === 0 || i === 0 ? "th" : "td", {}, c)))))));
  }
  function attendanceGrid() {
    const all = counted(), groups = new Map();
    for (const s of all) { const r = rcOf(s, sc); const no = r?.no || 0; if (!groups.has(no)) groups.set(no, []); groups.get(no).push({ s, seq: r?.seq || groups.get(no).length + 1 }); }
    if (!all.length) return h("p", { class: "note" }, "Chưa có buổi nào được điểm danh.");
    return h("div", { id: "attendance" }, [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([no, list]) => h("div", { class: "attblock" }, h("div", { class: "note" }, no ? `RC${no}` : "Chưa xếp RC"),
      h("div", { class: "attgrid" }, Array.from({ length: Math.max(10, ...list.map((x) => x.seq)) }, (_, i) => { const x = list.find((y) => y.seq === i + 1);
        return x ? h("button", { type: "button", class: "attcell " + (x.s.attendance[sc] === "Absent" ? "warn" : "ok"), title: STATUS_LABEL[x.s.attendance[sc]]?.[0] || "", onclick: () => { tab = "rc" + (no || ""); render(x.s.id); } }, h("b", {}, i + 1), h("span", {}, dm(x.s.date)), h("em", {}, x.s.attendance[sc] === "Absent" ? "ABSENT" : "PRESENT"))
          : h("div", { class: "attcell empty" }, h("b", {}, i + 1)); })))));
  }
  function general() {
    const enr = courseOf[sc], st = students[sc] || {}, tn = [...new Set(mine().map((s) => tname(s.teacherId)).filter(Boolean))].join(", ");
    return h("div", {},
      h("div", { class: "kv" }, [["Học viên", st.fullName || sc], ["Mã học viên", sc], ["Khóa học", enr?.courseId || "—"], ["Gói học", enr && (enr.startDate || enr.endDate) ? `${dmy(enr.startDate) || "?"} - ${dmy(enr.endDate) || "?"}${enr.status ? " (" + enr.status + ")" : ""}` : "—"], tn ? ["Giáo viên", tn] : null,
        ["Link lớp", /^https:\/\/\S+$/.test(st.meetLink || "") ? h("a", { href: st.meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : "—"]].filter(Boolean).map(([k, v]) => h("div", {}, h("span", { class: "k" }, k), h("span", {}, v)))),
      h("h4", {}, "Student's Level"), levelTable(), editNo != null ? evalForm(editNo) : null,
      h("h4", {}, "Comparison Table"), comparison(),
      h("h4", {}, `Attendance (${counted().length} buổi tính)`), attendanceGrid());
  }
  function rcTab(no) {
    const list = counted().filter((s) => rcOf(s, sc)?.no === no);
    return h("div", {}, h("p", { class: "note" }, `RC${no}: ${list.length}/10 buổi (Có mặt và Vắng đều tính, Hủy không tính).`),
      list.length ? list.map(sessionCard) : h("p", { class: "note" }, "Chưa có buổi học nào trong RC này."), evalBlock(no));
  }
  function pendingTab() {
    const list = pending();
    return h("div", {}, h("p", { class: "note" }, "Các buổi chưa điểm danh, sắp tới hoặc đã hủy của học viên này. Điểm danh xong buổi sẽ vào RC tương ứng."), list.length ? list.map(sessionCard) : h("p", { class: "note" }, "Không có buổi nào đang chờ."));
  }

  function render(focus) {
    const nos = rcNos(), pend = pending(), cnt = counted().length, st = students[sc] || {}, enr = courseOf[sc];
    const want = focus ? mine().find((s) => s.id === focus) : null;
    if (!canEditSessions && tab === "new") tab = null;
    if (!tab) tab = want ? (isCounted(want.attendance?.[sc]) ? "rc" + rcOf(want, sc)?.no : "new") : canEditSessions && pend.length ? "new" : nos.length ? "rc" + nos[nos.length - 1] : "general";
    if (!canEditSessions && tab === "new") tab = "general";
    if (tab !== "general" && tab !== "new" && !nos.includes(Number(tab.slice(2)))) tab = "general";
    const tabs = [["general", "General"], ...nos.map((n) => ["rc" + n, "RC" + n]), canEditSessions ? ["new", `Buổi mới${pend.length ? " (" + pend.length + ")" : ""}`] : null].filter(Boolean);
    const body = tab === "general" ? general() : tab === "new" ? pendingTab() : rcTab(Number(tab.slice(2)));
    root.replaceChildren(...[
      head ? h("div", { class: "dhead" }, h("div", { class: "avatar" }, (st.fullName || sc).trim().charAt(0).toUpperCase()),
        h("div", { style: "flex:1;min-width:0" }, h("h3", { style: "margin:0" }, st.fullName || sc), h("div", { class: "note" }, `${sc}${enr?.courseId ? " · " + enr.courseId : ""} · ${cnt} buổi đã học`)),
        scs.length > 1 ? h("select", { id: "dossierPick", style: "width:auto", onchange: (e) => { sc = e.target.value; tab = null; editNo = null; render(); } }, scs.map((x) => h("option", { value: x, selected: x === sc }, students[x]?.fullName || x))) : null,
        onClose ? h("button", { type: "button", class: "s", onclick: onClose }, "Đóng") : null) : null,
      h("div", { class: "dtabs" }, tabs.map(([k, l]) => h("button", { type: "button", "data-dtab": k, "aria-current": String(k === tab), onclick: () => { tab = k; editNo = null; render(); } }, l))),
      h("div", { class: "dbody", id: "dossierBody" }, h("div", { class: "msg ok", "data-flash": "", hidden: true, role: "status" }), body)].filter(Boolean));
    if (focus) root.querySelector(`[data-id="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "center" });
  }
  render(focusId);
}
