// Hồ sơ lớp của một học viên (theo mẫu file báo cáo): General, RC1..RCn, Buổi mới. Giáo viên xem và nhập báo cáo ngay trong đây.
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { API_BASE } from "./firebase.js";
import { isCounted } from "./rc-core.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
export const STATUSES = [["", "Chưa điểm danh"], ["Present", "Có mặt (Present)"], ["Absent", "Vắng (Absent)"], ["Cancelled", "Hủy, sẽ học bù (Cancelled)"]];
export const STATUS_LABEL = { Present: ["Có mặt", "ok"], Absent: ["Vắng", "warn"], Cancelled: ["Hủy", "bad"], "": ["Chưa điểm danh", "info"] };
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const endTime = (t, min) => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + min; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
export const rcOf = (s, sc) => s.rc?.[sc] || (s.scs?.[0] === sc && s.rcNo ? { no: s.rcNo, seq: s.rcSeq } : null);

// Nho Worker tinh lai so RC sau khi luu (giao vien khong doc duoc buoi cua giao vien khac). Loi thi bo qua.
export async function refreshRc(user, s) {
  if (!user) return false;
  try {
    const res = await fetch(API_BASE + "/api/sessions/recompute-rc", { method: "POST", headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" }, body: JSON.stringify({ sessionId: s.id }) });
    if (!res.ok) return false; const j = await res.json(); s.rc = j.rc; s.rcNo = j.rcNo; s.rcSeq = j.rcSeq; return true;
  } catch { return false; }
}

// ctx: { db, user, students, sessions, courseOf, evaluations, me, onChange }
export function openDossier(ctx, scs, focusId) {
  const { db, user, students, sessions, courseOf, evaluations, me } = ctx;
  let dlg = document.getElementById("dossier");
  if (!dlg) { dlg = h("dialog", { id: "dossier", class: "dossier" }); document.body.append(dlg); dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); }
  let sc = scs[0], tab = null;
  const mine = () => sessions.filter((s) => (s.scs || []).includes(sc));
  const counted = () => mine().filter((s) => isCounted(s.attendance?.[sc])).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const pending = () => mine().filter((s) => !isCounted(s.attendance?.[sc])).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const rcNos = () => [...new Set(counted().map((s) => rcOf(s, sc)?.no).filter(Boolean))].sort((a, b) => a - b);

  function sessionForm(s) {
    const locked = !!s.locked, msg = h("span", { class: "note" }, s.reportedAt ? `Đã lưu ${new Date(s.reportedAt).toLocaleString("vi-VN")}` : ""), r = rcOf(s, sc);
    const sel = h("select", { "data-sc": sc, disabled: locked }, STATUSES.map(([v, l]) => h("option", { value: v, selected: v === (s.attendance?.[sc] || "") }, l)));
    const field = (label, key, ph) => h("div", { class: "fld" }, h("label", {}, label), h("textarea", { "data-f": key, rows: "3", placeholder: ph, disabled: locked }, s[key] || ""));
    const el = h("article", { class: "session" + (s.reportedAt ? " done" : ""), "data-id": s.id },
      h("header", {}, h("strong", {}, `${dmy(s.date)}${s.time ? " · " + s.time + "-" + endTime(s.time, s.minutes || 25) : ""}`), h("span", { class: "note" }, `${s.minutes || 25} phút`),
        r ? h("span", { class: "tag rc" }, `RC${r.no} · buổi ${r.seq}`) : null, s.makeupOf ? h("span", { class: "tag" }, "Học bù") : null, locked ? h("span", { class: "tag" }, "Đã chốt lương") : null, h("span", { style: "margin-left:auto" }, sel)),
      field("Progress (giáo trình / chủ đề)", "topic", "Ví dụ: OXFORD DISCOVERY 1"), field("Academic Performance (bài học, từ vựng, ngữ pháp)", "lesson", "Nội dung buổi học"), field("Class Participation (nhận xét)", "feedback", "Nhận xét về học viên"),
      h("div", { class: "row" }, msg, h("button", { class: "p", disabled: locked, onclick: async (e) => {
        e.target.disabled = true; msg.className = "note"; msg.textContent = "Đang lưu...";
        const data = { attendance: { ...(s.attendance || {}), [sc]: sel.value }, reportedAt: Date.now() };
        for (const f of ["topic", "lesson", "feedback"]) data[f] = el.querySelector(`[data-f=${f}]`).value.trim();
        try {
          await updateDoc(doc(db, "sessions", s.id), data); Object.assign(s, data);
          msg.textContent = `Đã lưu ${new Date(data.reportedAt).toLocaleString("vi-VN")}`; el.classList.add("done");
          ctx.onChange?.(s);
          if (await refreshRc(user, s)) { tab = null; render(s.id); ctx.onChange?.(s); }
        } catch (err) { msg.className = "msg err"; msg.textContent = "Không lưu được: " + (err.code || err.message); }
        e.target.disabled = false; } }, "Lưu")));
    return el;
  }

  function general() {
    const enr = courseOf[sc], st = students[sc] || {}, all = counted(), evs = evaluations.filter((e) => e.sc === sc).sort((a, b) => a.rcNo - b.rcNo);
    return h("div", {},
      h("div", { class: "kv" }, [["Học viên", st.fullName || sc], ["Mã học viên", sc], ["Khóa học", enr?.courseId || "—"], ["Gói học", enr ? `${dmy(enr.startDate) || "?"} - ${dmy(enr.endDate) || "?"}${enr.status ? " (" + enr.status + ")" : ""}` : "—"], ["Giáo viên", me.name],
        ["Link lớp", /^https:\/\/\S+$/.test(st.meetLink || "") ? h("a", { href: st.meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : "—"]].map(([k, v]) => h("div", {}, h("span", { class: "k" }, k), h("span", {}, v)))),
      h("h4", {}, "Điểm các kỳ đánh giá"),
      evs.length ? h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Kỳ", "Ngày", "Điểm", "Cấp độ"].map((t) => h("th", {}, t)))),
        h("tbody", {}, evs.map((e) => h("tr", {}, h("td", {}, e.kind || `Exam ${e.rcNo}`), h("td", {}, dmy(e.date)), h("td", { style: "white-space:normal" }, Object.entries(e.scores || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")), h("td", {}, e.level || "")))))) : h("p", { class: "note" }, "Chưa có kết quả đánh giá nào."),
      h("h4", {}, `Điểm danh (${all.length} buổi tính)`),
      all.length ? h("div", { class: "chips" }, all.map((s) => h("button", { type: "button", class: "chip " + (s.attendance[sc] === "Absent" ? "warn" : "ok"), title: `${dmy(s.date)} ${STATUS_LABEL[s.attendance[sc]]?.[0] || ""}`,
        onclick: () => { tab = "rc" + (rcOf(s, sc)?.no || ""); render(s.id); } }, dmy(s.date).slice(0, 5)))) : h("p", { class: "note" }, "Chưa có buổi nào được điểm danh."));
  }
  function rcTab(no) {
    const list = counted().filter((s) => rcOf(s, sc)?.no === no), ev = evaluations.find((e) => e.sc === sc && e.rcNo === no);
    return h("div", {}, h("p", { class: "note" }, `RC${no}: ${list.length}/10 buổi (Có mặt và Vắng đều tính, Hủy không tính).`), list.map(sessionForm),
      ev ? h("div", { class: "card soft" }, h("h4", { style: "margin-top:0" }, `Đánh giá cuối RC${no} (${ev.kind || "Exam " + no})`), h("p", {}, Object.entries(ev.scores || {}).map(([k, v]) => `${k}: ${v}`).join(" · "), ev.level ? ` · ${ev.level}` : ""),
        Object.entries(ev.comments || {}).map(([k, v]) => h("p", { class: "note" }, `${k}: ${v}`))) : null);
  }
  function pendingTab() {
    const list = pending();
    return h("div", {}, h("p", { class: "note" }, "Các buổi chưa điểm danh, sắp tới hoặc đã hủy của học viên này. Điểm danh xong buổi sẽ vào RC tương ứng."), list.length ? list.map(sessionForm) : h("p", { class: "note" }, "Không có buổi nào đang chờ."));
  }

  function render(focus) {
    const nos = rcNos(), pend = pending(), cnt = counted().length, st = students[sc] || {}, enr = courseOf[sc];
    const want = focus ? mine().find((s) => s.id === focus) : null;
    if (!tab) tab = want ? (isCounted(want.attendance?.[sc]) ? "rc" + rcOf(want, sc)?.no : "new") : pend.length ? "new" : nos.length ? "rc" + nos[nos.length - 1] : "general";
    if (tab !== "general" && tab !== "new" && !nos.includes(Number(tab.slice(2)))) tab = "general";
    const tabs = [["general", "General"], ...nos.map((n) => ["rc" + n, "RC" + n]), ["new", `Buổi mới${pend.length ? " (" + pend.length + ")" : ""}`]];
    const body = tab === "general" ? general() : tab === "new" ? pendingTab() : rcTab(Number(tab.slice(2)));
    dlg.replaceChildren(
      h("div", { class: "dhead" }, h("div", { class: "avatar" }, (st.fullName || sc).trim().charAt(0).toUpperCase()),
        h("div", { style: "flex:1;min-width:0" }, h("h3", { style: "margin:0" }, st.fullName || sc), h("div", { class: "note" }, `${sc}${enr?.courseId ? " · " + enr.courseId : ""} · ${cnt} buổi đã học`)),
        scs.length > 1 ? h("select", { id: "dossierPick", style: "width:auto", onchange: (e) => { sc = e.target.value; tab = null; render(); } }, scs.map((x) => h("option", { value: x, selected: x === sc }, students[x]?.fullName || x))) : null,
        h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Đóng")),
      h("div", { class: "dtabs" }, tabs.map(([k, l]) => h("button", { type: "button", "data-dtab": k, "aria-current": String(k === tab), onclick: () => { tab = k; render(); } }, l))),
      h("div", { class: "dbody", id: "dossierBody" }, body));
    if (focus) dlg.querySelector(`[data-id="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "center" });
  }
  render(focusId);
  if (!dlg.open) dlg.showModal();
}
