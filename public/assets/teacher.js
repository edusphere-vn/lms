// Giao diện giáo viên: xem buổi học trong tuần, điểm danh và nhập báo cáo từng buổi.
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { API_BASE } from "./firebase.js";
import { DAYS, rowTime, hhmm, START_MIN, STEP, normName } from "./grid-core.js";
import { runsOf } from "./session-gen-core.js";
import { mountShell } from "./shell.js";
import { renderGridView } from "./grid-view.js";
import { noticesView } from "./notices-view.js";
import { computePayroll, monthRange } from "./payroll-core.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const dm = (s) => `${s.slice(8)}/${s.slice(5, 7)}`;
const endTime = (t, min) => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + min; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const STATUSES = [["", "Chưa điểm danh"], ["Present", "Có mặt (Present)"], ["Absent", "Vắng (Absent)"], ["Cancelled", "Hủy, sẽ học bù (Cancelled)"]];

export async function startTeacher({ db, profile, main, user }) {
  // Ma giao vien lay tu quyen (claim) trong token, vi luat Firestore cung doc tu do
  const claims = user ? (await user.getIdTokenResult()).claims : {}, tid = claims.teacherId || profile.teacherId;
  if (user && (claims.role !== "teacher" || !claims.teacherId)) throw new Error("Tài khoản chưa có quyền giáo viên (thiếu claim). Nhờ admin bấm Đặt lại mật khẩu hoặc tạo lại tài khoản.");
  if (claims.teacherId && profile.teacherId && claims.teacherId !== profile.teacherId) throw new Error(`Mã giáo viên của tài khoản không khớp (${claims.teacherId} và ${profile.teacherId}). Nhờ admin tạo lại tài khoản.`);
  main.replaceChildren(h("p", {}, "Đang tải lịch..."));
  const step = (name, p) => p.catch((e) => { throw Object.assign(new Error(`${name}: ${e.code || e.message} (mã giáo viên ${tid})`), { code: e.code }); });
  const [sSnap, eSnap] = await Promise.all([step("học viên", getDocs(query(collection(db, "students"), where("teacherIds", "array-contains", tid)))), step("buổi học", getDocs(query(collection(db, "sessions"), where("teacherId", "==", tid))))]);
  // lich co dinh hang tuan, don gia (de tinh luong tam) - khong bat buoc, loi thi bo qua
  const [schedDoc, teacherDoc, cfgSnap] = await Promise.all([getDoc(doc(db, "schedule", tid)).catch(() => null), getDoc(doc(db, "teachers", tid)).catch(() => null), getDocs(collection(db, "config")).catch(() => ({ docs: [] }))]);
  const cells = schedDoc?.data?.()?.cells || {}, config = Object.fromEntries(cfgSnap.docs.map((d) => [d.id, d.data()])), me = { id: tid, name: teacherDoc?.data?.()?.name || tid, ...(teacherDoc?.data?.() || {}) };
  const materials = (await getDocs(collection(db, "materials")).catch(() => ({ docs: [] }))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => /^https:\/\/\S+$/.test(m.url || "")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const students = Object.fromEntries(sSnap.docs.map((d) => [d.id, d.data()]));
  const sessions = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const q = new URLSearchParams(location.search).get("week");   // ?week=2026-11-23 de mo thang tuan khac
  let week = /^\d{4}-\d{2}-\d{2}$/.test(q || "") ? mondayOf(new Date(Number(q.slice(0, 4)), Number(q.slice(5, 7)) - 1, Number(q.slice(8)))) : mondayOf(new Date());

  const countText = () => { const a = iso(week), b = new Date(week); b.setDate(b.getDate() + 6); const l = sessions.filter((s) => s.date >= a && s.date <= iso(b)); return `${l.length} buổi, đã báo cáo ${l.filter((s) => s.reportedAt).length}`; };
  // bo loc chi an/hien the (khong ve lai) de khong mat noi dung dang go do
  const box = h("div", { id: "reportPage" });
  let fq = "", fst = "";
  const fsearch = h("input", { type: "search", id: "tSearch", placeholder: "Tìm học viên...", style: "width:200px", oninput: (e) => { fq = normName(e.target.value); applyFilter(); } });
  const fstat = h("select", { id: "tStatus", style: "width:auto", onchange: (e) => { fst = e.target.value; applyFilter(); } }, [["", "Mọi buổi"], ["todo", "Chưa báo cáo"], ["done", "Đã báo cáo"]].map(([v, l]) => h("option", { value: v }, l)));
  function applyFilter() {
    for (const el of box.querySelectorAll("article.session")) {
      const ok = (!fq || el.dataset.names.includes(fq)) && (!fst || (fst === "done") === el.classList.contains("done"));
      el.hidden = !ok;
    }
    for (const sec of box.querySelectorAll("section")) sec.hidden = ![...sec.querySelectorAll("article.session")].some((a) => !a.hidden);
  }
  function paint() {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return iso(d); });
    const inWeek = sessions.filter((s) => s.date >= days[0] && s.date <= days[6]);
    box.replaceChildren(...[
      h("div", { class: "weekbar" },
        h("button", { class: "s", id: "prevWeek", onclick: () => { week.setDate(week.getDate() - 7); paint(); } }, "← Tuần trước"),
        h("strong", { id: "weekLabel" }, `${dm(days[0])} - ${dm(days[6])}/${days[6].slice(0, 4)}`),
        h("button", { class: "s", onclick: () => { week = mondayOf(new Date()); paint(); } }, "Tuần này"),
        h("button", { class: "s", id: "nextWeek", onclick: () => { week.setDate(week.getDate() + 7); paint(); } }, "Tuần sau →"),
        h("span", { class: "note", id: "weekCount" }, countText()), fsearch, fstat),
      inWeek.length ? days.map((d, i) => {
        const list = inWeek.filter((s) => s.date === d).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        return list.length ? h("section", {}, h("h3", {}, `${DAYS[i]}, ${dm(d)}`), list.map(card)) : null;
      }) : h("p", { class: "empty" }, "Tuần này chưa có buổi học nào. Admin sẽ tạo buổi học từ lịch.")].flat(Infinity).filter(Boolean));
    applyFilter();
  }

  // Sau khi luu, nho Worker tinh lai so RC (can lich su cac giao vien khac nen giao vien khong tu tinh duoc). Loi thi bo qua: admin van co nut "RC va hoc bu".
  async function refreshRc(s, el) {
    if (!user) return;
    try {
      const res = await fetch(API_BASE + "/api/sessions/recompute-rc", { method: "POST", headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" }, body: JSON.stringify({ sessionId: s.id }) });
      if (!res.ok) return; const j = await res.json(); s.rc = j.rc; s.rcNo = j.rcNo; s.rcSeq = j.rcSeq;
      el.querySelector(".tag.rc")?.remove();
      if (j.rcNo) el.querySelector("header").append(h("span", { class: "tag rc" }, `RC${j.rcNo} · buổi ${j.rcSeq}`));
    } catch { /* khong sao */ }
  }

  function card(s) {
    const locked = !!s.locked, att = { ...(s.attendance || {}) }, msg = h("span", { class: "note" }, s.reportedAt ? `Đã lưu ${new Date(s.reportedAt).toLocaleString("vi-VN")}` : "");
    const field = (label, key, ph) => [h("label", {}, label), h("textarea", { "data-f": key, rows: "3", placeholder: ph, disabled: locked }, s[key] || "")];
    const el = h("article", { class: "session" + (s.reportedAt ? " done" : ""), "data-id": s.id, "data-names": normName(s.scs.map((sc) => students[sc]?.fullName || sc).join(" ") + " " + s.scs.join(" ")) },
      h("header", {}, h("strong", {}, s.time ? `${s.time}-${endTime(s.time, s.minutes || 25)}` : "Chưa rõ giờ"), h("span", { class: "note" }, `${s.minutes || 25} phút`),
        s.rcNo ? h("span", { class: "tag rc" }, `RC${s.rcNo}${s.rcSeq ? " · buổi " + s.rcSeq : ""}`) : null, locked ? h("span", { class: "tag" }, "Đã chốt lương") : null),
      s.scs.map((sc) => h("div", { class: "stu" }, h("span", {}, students[sc]?.fullName || sc),
        students[sc]?.meetLink ? h("a", { href: students[sc].meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : null,
        h("select", { "data-sc": sc, disabled: locked, onchange: (e) => { att[sc] = e.target.value; } }, STATUSES.map(([v, l]) => h("option", { value: v, selected: v === (att[sc] || "") }, l))))),
      field("Progress (giáo trình / chủ đề)", "topic", "Ví dụ: OXFORD DISCOVERY 1"), field("Academic Performance (bài học, từ vựng, ngữ pháp)", "lesson", "Nội dung buổi học"), field("Class Participation (nhận xét)", "feedback", "Nhận xét về học viên"),
      h("div", { class: "row" }, msg, h("button", { class: "p", disabled: locked, onclick: async (e) => {
        e.target.disabled = true; msg.className = "note"; msg.textContent = "Đang lưu...";
        const data = { attendance: att, reportedAt: Date.now() };
        for (const f of ["topic", "lesson", "feedback"]) data[f] = el.querySelector(`[data-f=${f}]`).value.trim();
        try { await updateDoc(doc(db, "sessions", s.id), data); Object.assign(s, data); el.classList.add("done"); document.getElementById("weekCount").textContent = countText(); msg.textContent = `Đã lưu ${new Date(data.reportedAt).toLocaleString("vi-VN")}`; refreshRc(s, el); }
        catch (err) { msg.className = "msg err"; msg.textContent = "Không lưu được: " + (err.code || err.message); }
        e.target.disabled = false; } }, "Lưu")));
    return el;
  }
  // ---- cac trang ----
  const ymNow = iso(new Date()).slice(0, 7), { from: mFrom, to: mTo } = monthRange(ymNow);
  const monthSessions = sessions.filter((x) => x.date >= mFrom && x.date <= mTo);
  const pay = computePayroll({ sessions: monthSessions, teachers: [me], config })[0] || { total: 0, present: 0, absent: 0, cancelled: 0, unreported: 0 };
  const stat = (v, label, color) => h("div", { class: "stat-card" }, h("div", { class: "value", style: `color:${color}` }, v), h("div", { class: "label" }, label));
  function dashboardPage(el) {
    const taught = {}, last = {};
    for (const x of sessions) for (const sc of x.scs || []) if (["Present", "Absent"].includes(x.attendance?.[sc])) { taught[sc] = (taught[sc] || 0) + 1; if (!last[sc] || x.date > last[sc]) last[sc] = x.date; }
    const list = Object.entries(students).sort((a, b) => (a[1].fullName || a[0]).localeCompare(b[1].fullName || b[0]));
    el.append(h("div", { class: "stats", id: "tStats" }, stat(pay.present + pay.absent + pay.cancelled + pay.unreported, `Buổi trong tháng ${ymNow.slice(5)}`, "var(--accent)"), stat(pay.present, "Có mặt", "var(--s)"), stat(pay.absent, "Vắng", "var(--a)"), stat(pay.cancelled, "Hủy", "var(--d)"),
      stat(pay.unreported, "Chưa điểm danh", "#8B5CF6"), stat(pay.total.toLocaleString("vi-VN"), "Lương tạm tính (VND)", "var(--s)")),
      h("p", { class: "note", id: "payHint" }, `Tạm tính tháng ${ymNow.slice(5)}/${ymNow.slice(0, 4)}: ${pay.total.toLocaleString("vi-VN")} (${pay.present} buổi có mặt, ${pay.absent} vắng, ${pay.cancelled} hủy` + (pay.unreported ? `, ${pay.unreported} chưa điểm danh` : "") + "). Số chính thức do admin chốt cuối kỳ."),
      h("div", { class: "card" }, h("h3", {}, `Học viên của tôi (${list.length})`),
        list.length ? h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Học viên", "Mã", "Số buổi đã dạy", "Buổi gần nhất", ""].map((t) => h("th", {}, t)))),
          h("tbody", {}, list.map(([sc, st]) => h("tr", {}, h("td", {}, st.fullName || sc), h("td", {}, sc), h("td", {}, taught[sc] || 0), h("td", {}, last[sc] ? dm(last[sc]) : ""),
            h("td", {}, /^https:\/\/\S+$/.test(st.meetLink || "") ? h("a", { href: st.meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : "")))))) : h("p", { class: "note" }, "Chưa có học viên nào được gán cho bạn.")));
  }
  function schedulePage(el) {
    const runs = runsOf(cells);
    el.append(h("div", { class: "card" }, h("h3", {}, `Lịch dạy cố định hằng tuần (${runs.length} ca)`), h("p", { class: "note" }, "Giờ Việt Nam. Lịch này do admin sắp xếp, bạn chỉ xem. Cần đổi lịch hãy báo admin."), renderGridView(cells, { h })));
  }
  function materialsPage(el) {
    el.append(h("div", { class: "card", id: "teacherMaterials" }, h("h3", {}, `Tài liệu giảng dạy (${materials.length})`),
      materials.length ? h("ul", {}, materials.map((m) => h("li", {}, h("a", { href: m.url, target: "_blank", rel: "noopener noreferrer" }, m.title || m.id), m.courseId ? ` · ${m.courseId}` : "", m.level ? ` · ${m.level}` : ""))) : h("p", { class: "note" }, "Chưa có tài liệu.")));
  }
  paint();
  mountShell({ main, initial: q ? "report" : "dashboard", tabs: [
    { key: "dashboard", title: "Tổng quan", render: dashboardPage }, { key: "schedule", title: "Lịch dạy", render: schedulePage },
    { key: "report", title: "Điểm danh và báo cáo", render: (el) => el.append(box) }, { key: "materials", title: "Tài liệu", render: materialsPage },
    { key: "notices", title: "Thông báo", render: async (el) => el.append(await noticesView(db, "teacher", h)) }] });
}
