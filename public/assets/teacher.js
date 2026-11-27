// Giao diện giáo viên: xem buổi học trong tuần, điểm danh và nhập báo cáo từng buổi.
import { collection, getDocs, getDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { DAYS, rowTime, hhmm, START_MIN, STEP } from "./grid-core.js";
import { runsOf } from "./session-gen-core.js";
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
  const students = Object.fromEntries(sSnap.docs.map((d) => [d.id, d.data()]));
  const sessions = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const q = new URLSearchParams(location.search).get("week");   // ?week=2026-11-23 de mo thang tuan khac
  let week = /^\d{4}-\d{2}-\d{2}$/.test(q || "") ? mondayOf(new Date(Number(q.slice(0, 4)), Number(q.slice(5, 7)) - 1, Number(q.slice(8)))) : mondayOf(new Date());

  const countText = () => { const a = iso(week), b = new Date(week); b.setDate(b.getDate() + 6); const l = sessions.filter((s) => s.date >= a && s.date <= iso(b)); return `${l.length} buổi, đã báo cáo ${l.filter((s) => s.reportedAt).length}`; };
  function paint() {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return iso(d); });
    const inWeek = sessions.filter((s) => s.date >= days[0] && s.date <= days[6]);
    main.replaceChildren(...[
      overview(days),
      h("div", { class: "weekbar" },
        h("button", { class: "s", id: "prevWeek", onclick: () => { week.setDate(week.getDate() - 7); paint(); } }, "← Tuần trước"),
        h("strong", { id: "weekLabel" }, `${dm(days[0])} - ${dm(days[6])}/${days[6].slice(0, 4)}`),
        h("button", { class: "s", onclick: () => { week = mondayOf(new Date()); paint(); } }, "Tuần này"),
        h("button", { class: "s", id: "nextWeek", onclick: () => { week.setDate(week.getDate() + 7); paint(); } }, "Tuần sau →"),
        h("span", { class: "note", id: "weekCount" }, countText())),
      inWeek.length ? days.map((d, i) => {
        const list = inWeek.filter((s) => s.date === d).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        return list.length ? h("section", {}, h("h3", {}, `${DAYS[i]}, ${dm(d)}`), list.map(card)) : null;
      }) : h("p", { class: "empty" }, "Tuần này chưa có buổi học nào. Admin sẽ tạo buổi học từ lịch.")].flat(Infinity).filter(Boolean));
  }

  const names = (scs) => scs.map((sc) => students[sc]?.fullName || sc).join(", ");
  function overview(days) {
    const runs = runsOf(cells), ym = days[0].slice(0, 7), { from, to } = monthRange(ym);
    const pay = computePayroll({ sessions: sessions.filter((x) => x.date >= from && x.date <= to), teachers: [me], config })[0];
    return h("div", { class: "overview" },
      h("details", { id: "fixedSchedule" }, h("summary", {}, `Lịch cố định hằng tuần (${runs.length} ca)`),
        h("table", {}, h("tbody", {}, DAYS.map((d, c) => { const r = runs.filter((x) => x.col === c).sort((a, b) => a.row - b.row); return r.length ? h("tr", {}, h("td", {}, h("strong", {}, d)), h("td", {}, r.map((x) => `${rowTime(x.row)}-${hhmm(START_MIN + (x.row + x.rows) * STEP)} ${x.text}`).join(" · "))) : null; })))),
      h("p", { class: "note", id: "payHint" }, pay ? `Tạm tính tháng ${ym.slice(5)}/${ym.slice(0, 4)}: ${pay.total.toLocaleString("vi-VN")} (${pay.present} buổi có mặt, ${pay.absent} vắng, ${pay.cancelled} hủy` + (pay.unreported ? `, ${pay.unreported} chưa điểm danh` : "") + "). Số chính thức do admin chốt cuối kỳ." : `Tháng ${ym.slice(5)}/${ym.slice(0, 4)} chưa có buổi học.`));
  }

  function card(s) {
    const locked = !!s.locked, att = { ...(s.attendance || {}) }, msg = h("span", { class: "note" }, s.reportedAt ? `Đã lưu ${new Date(s.reportedAt).toLocaleString("vi-VN")}` : "");
    const field = (label, key, ph) => [h("label", {}, label), h("textarea", { "data-f": key, rows: "3", placeholder: ph, disabled: locked }, s[key] || "")];
    const el = h("article", { class: "session" + (s.reportedAt ? " done" : ""), "data-id": s.id },
      h("header", {}, h("strong", {}, s.time ? `${s.time}-${endTime(s.time, s.minutes || 25)}` : "Chưa rõ giờ"), h("span", { class: "note" }, `${s.minutes || 25} phút`),
        s.rcNo ? h("span", { class: "tag" }, `RC${s.rcNo}${s.rcSeq ? " · buổi " + s.rcSeq : ""}`) : null, locked ? h("span", { class: "tag" }, "Đã chốt lương") : null),
      s.scs.map((sc) => h("div", { class: "stu" }, h("span", {}, students[sc]?.fullName || sc),
        students[sc]?.meetLink ? h("a", { href: students[sc].meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : null,
        h("select", { "data-sc": sc, disabled: locked, onchange: (e) => { att[sc] = e.target.value; } }, STATUSES.map(([v, l]) => h("option", { value: v, selected: v === (att[sc] || "") }, l))))),
      field("Progress (giáo trình / chủ đề)", "topic", "Ví dụ: OXFORD DISCOVERY 1"), field("Academic Performance (bài học, từ vựng, ngữ pháp)", "lesson", "Nội dung buổi học"), field("Class Participation (nhận xét)", "feedback", "Nhận xét về học viên"),
      h("div", { class: "row" }, msg, h("button", { class: "p", disabled: locked, onclick: async (e) => {
        e.target.disabled = true; msg.className = "note"; msg.textContent = "Đang lưu...";
        const data = { attendance: att, reportedAt: Date.now() };
        for (const f of ["topic", "lesson", "feedback"]) data[f] = el.querySelector(`[data-f=${f}]`).value.trim();
        try { await updateDoc(doc(db, "sessions", s.id), data); Object.assign(s, data); el.classList.add("done"); document.getElementById("weekCount").textContent = countText(); msg.textContent = `Đã lưu ${new Date(data.reportedAt).toLocaleString("vi-VN")}`; }
        catch (err) { msg.className = "msg err"; msg.textContent = "Không lưu được: " + (err.code || err.message); }
        e.target.disabled = false; } }, "Lưu")));
    return el;
  }
  paint();
}
