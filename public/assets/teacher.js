// Giao diện giáo viên: Tổng quan, Lịch dạy (lưới, bấm tên học viên mở hồ sơ lớp), Báo cáo tuần, Tính lương, Tài liệu, Thông báo.
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { DAYS, normName, splitNames } from "./grid-core.js";
import { mountShell } from "./shell.js";
import { renderGridView } from "./grid-view.js";
import { noticesView } from "./notices-view.js";
import { computePayroll, monthRange } from "./payroll-core.js";
import { sessionStatus } from "./sessions-filter.js";
import { isCounted } from "./rc-core.js";
import { openDossier, STATUS_LABEL, rcOf } from "./teacher-dossier.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const dm = (s) => `${s.slice(8)}/${s.slice(5, 7)}`;
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const endTime = (t, min) => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + min; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const docs = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));

export async function startTeacher({ db, profile, main, user }) {
  // Ma giao vien lay tu quyen (claim) trong token, vi luat Firestore cung doc tu do
  const claims = user ? (await user.getIdTokenResult()).claims : {}, tid = claims.teacherId || profile.teacherId;
  if (user && (claims.role !== "teacher" || !claims.teacherId)) throw new Error("Tài khoản chưa có quyền giáo viên (thiếu claim). Nhờ admin bấm Đặt lại mật khẩu hoặc tạo lại tài khoản.");
  if (claims.teacherId && profile.teacherId && claims.teacherId !== profile.teacherId) throw new Error(`Mã giáo viên của tài khoản không khớp (${claims.teacherId} và ${profile.teacherId}). Nhờ admin tạo lại tài khoản.`);
  main.replaceChildren(h("p", {}, "Đang tải lịch..."));
  const step = (name, p) => p.catch((e) => { throw Object.assign(new Error(`${name}: ${e.code || e.message} (mã giáo viên ${tid})`), { code: e.code }); });
  const soft = (p, d) => p.catch(() => d);
  const [sSnap, eSnap] = await Promise.all([step("học viên", getDocs(query(collection(db, "students"), where("teacherIds", "array-contains", tid)))), step("buổi học", getDocs(query(collection(db, "sessions"), where("teacherId", "==", tid))))]);
  // phan phu (khong bat buoc, loi thi bo qua): lich co dinh, don gia, tai lieu, goi hoc, diem danh gia
  const [schedDoc, teacherDoc, cfgSnap, matSnap, enrolls, evals] = await Promise.all([soft(getDoc(doc(db, "schedule", tid)), null), soft(getDoc(doc(db, "teachers", tid)), null), soft(getDocs(collection(db, "config")), { docs: [] }),
    soft(getDocs(collection(db, "materials")), { docs: [] }), soft(docs(query(collection(db, "enrollments"), where("teacherId", "==", tid))), []), soft(docs(query(collection(db, "evaluations"), where("teacherId", "==", tid))), [])]);
  const cells = schedDoc?.data?.()?.cells || {}, config = Object.fromEntries(cfgSnap.docs.map((d) => [d.id, d.data()])), me = { id: tid, name: teacherDoc?.data?.()?.name || profile.displayName || tid, ...(teacherDoc?.data?.() || {}) };
  const materials = matSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => /^https:\/\/\S+$/.test(m.url || "")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const students = Object.fromEntries(sSnap.docs.map((d) => [d.id, d.data()]));
  const sessions = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const courseOf = {}; for (const e of [...enrolls].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))) courseOf[e.sc] = e;   // goi moi nhat thang
  const ctx = { db, user, students, sessions, courseOf, evaluations: evals, me, onChange: () => {} };
  const nameOf = (sc) => students[sc]?.fullName || sc;
  const courseBadge = (sc) => courseOf[sc]?.courseId ? h("span", { class: "badge info" }, courseOf[sc].courseId) : null;
  const statusBadge = (s) => { const [l, c] = STATUS_LABEL[sessionStatus(s)] || STATUS_LABEL[""]; return h("span", { class: "badge " + c }, l); };
  const open = (scs, focus) => openDossier(ctx, scs, focus);
  const stat = (v, label, color) => h("div", { class: "stat-card" }, h("div", { class: "value", style: `color:${color}` }, v), h("div", { class: "label" }, label));
  const byMonth = (ym) => { const { from, to } = monthRange(ym); return sessions.filter((x) => x.date >= from && x.date <= to); };
  const sum = (ym) => computePayroll({ sessions: byMonth(ym), teachers: [me], config })[0] || { total: 0, present: 0, absent: 0, cancelled: 0, unreported: 0, lines: [] };

  // ---- Tong quan ----
  function dashboardPage(el) {
    const ym = iso(new Date()).slice(0, 7), p = sum(ym), today = iso(new Date());
    const latest = {};   // sc -> buoi tinh gan nhat (de lay so RC that)
    for (const x of sessions) for (const sc of x.scs || []) if (isCounted(x.attendance?.[sc]) && (!latest[sc] || (x.date + (x.time || "")) > (latest[sc].date + (latest[sc].time || "")))) latest[sc] = x;
    const taught = {}; for (const x of sessions) for (const sc of x.scs || []) if (isCounted(x.attendance?.[sc])) taught[sc] = (taught[sc] || 0) + 1;
    const list = Object.keys(students).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const todays = sessions.filter((x) => x.date === today).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    el.append(...[h("div", { class: "stats", id: "tStats" }, stat(p.present + p.absent + p.cancelled + p.unreported, `Buổi trong tháng ${ym.slice(5)}`, "var(--accent)"), stat(p.present, "Có mặt", "var(--s)"), stat(p.absent, "Vắng", "var(--a)"), stat(p.cancelled, "Hủy", "var(--d)"), stat(p.unreported, "Chưa điểm danh", "#8B5CF6")),
      todays.length ? h("div", { class: "card" }, h("h3", {}, `Hôm nay có ${todays.length} buổi`), h("div", { class: "todaylist" }, todays.map((x) => h("button", { type: "button", class: "todayitem", onclick: () => open(x.scs, x.id) },
        h("strong", {}, `${x.time || ""}${x.time ? "-" + endTime(x.time, x.minutes || 25) : ""}`), h("span", {}, x.scs.map(nameOf).join(", ")), statusBadge(x))))) : null,
      h("div", { class: "card" }, h("h3", {}, `Học viên của tôi (${list.length})`),
        list.length ? h("div", { class: "sgrid", id: "studentCards" }, list.map((sc) => {
          const st = students[sc], r = latest[sc] ? rcOf(latest[sc], sc) : null, seq = r?.seq || 0;
          return h("div", { class: "scard", "data-sc": sc },
            h("div", { class: "shead" }, h("div", { class: "avatar" }, nameOf(sc).trim().charAt(0).toUpperCase()), h("div", { style: "min-width:0" }, h("div", { class: "sname" }, nameOf(sc)), h("div", { class: "note" }, sc, " ", courseBadge(sc)))),
            h("div", { class: "rcline" }, h("span", {}, r ? `RC${r.no} · ${seq}/10 buổi` : "Chưa có buổi tính RC"), h("span", { class: "note" }, `${taught[sc] || 0} buổi đã dạy`)),
            h("div", { class: "progress" }, h("div", { style: `width:${seq * 10}%` })),
            h("div", { class: "note" }, latest[sc] ? `Buổi gần nhất: ${dm(latest[sc].date)}` : "Chưa có buổi nào"),
            h("div", { class: "sact" }, h("button", { class: "p", type: "button", "data-open": sc, onclick: () => open([sc]) }, "Hồ sơ lớp"),
              /^https:\/\/\S+$/.test(st.meetLink || "") ? h("a", { class: "btnlink", href: st.meetLink, target: "_blank", rel: "noopener noreferrer" }, "Vào lớp") : null));
        })) : h("p", { class: "note" }, "Chưa có học viên nào được gán cho bạn."))].filter(Boolean));
  }

  // ---- Lich day (luoi, bam ten mo ho so lop) ----
  function schedulePage(el) {
    const hint = h("p", { class: "note", id: "gridHint" }, "Giờ Việt Nam. Bấm vào tên học viên trên lịch để mở hồ sơ lớp (General, RC1-n) và nhập báo cáo. Lịch do admin sắp xếp, bạn chỉ xem.");
    const pick = (text) => {
      const byName = new Map(Object.keys(students).map((sc) => [normName(nameOf(sc)), sc])), scs = splitNames(text).map((n) => byName.get(normName(n))).filter(Boolean);
      if (!scs.length) { hint.textContent = `Không tìm thấy học viên "${text}" trong danh sách của bạn. Nhờ admin kiểm tra lại tên trên lịch.`; hint.className = "msg err"; return; }
      hint.className = "note"; open([...new Set(scs)]);
    };
    el.append(h("div", { class: "card" }, h("h3", {}, "Lịch dạy cố định hằng tuần"), hint, renderGridView(cells, { h, onPick: pick })));
  }

  // ---- Bao cao tuan ----
  const q = new URLSearchParams(location.search).get("week");
  let week = /^\d{4}-\d{2}-\d{2}$/.test(q || "") ? mondayOf(new Date(Number(q.slice(0, 4)), Number(q.slice(5, 7)) - 1, Number(q.slice(8)))) : mondayOf(new Date());
  function reportPage(el) {
    const box = h("div", {}), fsearch = h("input", { type: "search", id: "tSearch", placeholder: "Tìm học viên...", style: "width:200px", oninput: () => paint() });
    const fstat = h("select", { id: "tStatus", style: "width:auto", onchange: () => paint() }, [["", "Mọi buổi"], ["todo", "Chưa báo cáo"], ["done", "Đã báo cáo"]].map(([v, l]) => h("option", { value: v }, l)));
    function paint() {
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return iso(d); }), fq = normName(fsearch.value);
      const inWeek = sessions.filter((s) => s.date >= days[0] && s.date <= days[6]);
      const shown = inWeek.filter((s) => (!fq || normName(s.scs.map(nameOf).join(" ") + " " + s.scs.join(" ")).includes(fq)) && (!fstat.value || (fstat.value === "done") === !!s.reportedAt));
      box.replaceChildren(...[h("div", { class: "weekbar" },
        h("button", { class: "s", id: "prevWeek", onclick: () => { week.setDate(week.getDate() - 7); paint(); } }, "← Tuần trước"), h("strong", { id: "weekLabel" }, `${dm(days[0])} - ${dm(days[6])}/${days[6].slice(0, 4)}`),
        h("button", { class: "s", onclick: () => { week = mondayOf(new Date()); paint(); } }, "Tuần này"), h("button", { class: "s", id: "nextWeek", onclick: () => { week.setDate(week.getDate() + 7); paint(); } }, "Tuần sau →"),
        h("span", { class: "note", id: "weekCount" }, `${inWeek.length} buổi, đã báo cáo ${inWeek.filter((s) => s.reportedAt).length}`), fsearch, fstat),
        ...(shown.length ? days.map((d, i) => {
          const list = shown.filter((s) => s.date === d).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
          return list.length ? h("div", { class: "card daycard" }, h("h3", {}, `${DAYS[i]}, ${dm(d)}`), list.map((s) => { const r = rcOf(s, s.scs[0]);
            return h("div", { class: "srow", "data-id": s.id },
              h("div", { class: "stime" }, s.time ? `${s.time}-${endTime(s.time, s.minutes || 25)}` : "Chưa rõ giờ", h("div", { class: "note" }, `${s.minutes || 25} phút`)),
              h("div", { class: "sbody" }, h("button", { type: "button", class: "linkbtn", onclick: () => open(s.scs, s.id) }, s.scs.map(nameOf).join(", ")), h("div", {}, s.scs.map(courseBadge), r ? h("span", { class: "tag rc" }, `RC${r.no} · buổi ${r.seq}`) : null, s.makeupOf ? h("span", { class: "tag" }, "Học bù") : null)),
              statusBadge(s), s.reportedAt ? h("span", { class: "badge ok" }, "Đã báo cáo") : h("span", { class: "badge warn" }, "Chưa báo cáo"),
              h("button", { class: "s", type: "button", onclick: () => open(s.scs, s.id) }, "Báo cáo")); })) : null;
        }) : [h("p", { class: "empty" }, "Không có buổi học nào trong tuần này.")])].filter(Boolean));
    }
    ctx.onChange = () => { if (!el.hidden) paint(); };
    paint(); el.append(box);
  }

  // ---- Tinh luong ----
  function payrollPage(el) {
    const now = new Date(), ym0 = iso(now).slice(0, 7), mon = h("input", { type: "month", id: "payMonth", value: ym0, style: "width:auto", onchange: () => paint() }), out = h("div", {});
    function paint() {
      const ym = mon.value || ym0, p = sum(ym);
      out.replaceChildren(h("div", { class: "stats", id: "payStats" }, stat(p.total.toLocaleString("vi-VN"), "Lương tạm tính (VND)", "var(--s)"), stat(p.present, "Có mặt", "var(--accent)"), stat(p.absent, "Vắng", "var(--a)"), stat(p.cancelled, "Hủy", "var(--d)"), stat(p.unreported, "Chưa điểm danh", "#8B5CF6")),
        h("div", { class: "card" }, h("h3", {}, `Chi tiết buổi dạy tháng ${ym.slice(5)}/${ym.slice(0, 4)}`), h("p", { class: "note", id: "payHint" }, "Tạm tính theo đơn giá hiện hành. Số chính thức do admin chốt cuối kỳ (từ ngày 1 đến cuối tháng)."),
          p.lines.length ? h("div", { class: "wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Ngày", "Giờ", "Học viên", "Khóa học", "Phút", "Trạng thái", "Lương"].map((t) => h("th", {}, t)))),
            h("tbody", {}, p.lines.map((l) => h("tr", { "data-id": l.id }, h("td", {}, dmy(l.date)), h("td", {}, l.time), h("td", {}, l.scs.map(nameOf).join(", ")), h("td", {}, l.scs.map((sc) => courseOf[sc]?.courseId).filter(Boolean).join(", ")), h("td", {}, l.minutes),
              h("td", {}, h("span", { class: "badge " + (STATUS_LABEL[l.status] || STATUS_LABEL[""])[1] }, (STATUS_LABEL[l.status] || STATUS_LABEL[""])[0]), l.locked ? h("span", { class: "tag" }, "Đã chốt") : null), h("td", {}, l.amount.toLocaleString("vi-VN"))))),
            h("tfoot", {}, h("tr", {}, h("td", { colspan: "6" }, h("strong", {}, "Tổng")), h("td", {}, h("strong", {}, p.total.toLocaleString("vi-VN"))))))) : h("p", { class: "note" }, "Tháng này chưa có buổi học nào.")));
    }
    paint(); el.append(h("div", { class: "card" }, h("label", { class: "inline" }, "Tháng ", mon)), out);
  }

  function materialsPage(el) {
    el.append(h("div", { class: "card", id: "teacherMaterials" }, h("h3", {}, `Tài liệu giảng dạy (${materials.length})`),
      materials.length ? h("ul", {}, materials.map((m) => h("li", {}, h("a", { href: m.url, target: "_blank", rel: "noopener noreferrer" }, m.title || m.id), m.courseId ? ` · ${m.courseId}` : "", m.level ? ` · ${m.level}` : ""))) : h("p", { class: "note" }, "Chưa có tài liệu.")));
  }

  await mountShell({ main, initial: q ? "report" : "dashboard", tabs: [
    { key: "dashboard", title: "Tổng quan", render: dashboardPage }, { key: "schedule", title: "Lịch dạy", render: schedulePage },
    { key: "report", title: "Báo cáo tuần", render: reportPage }, { key: "payroll", title: "Tính lương", render: payrollPage }, { key: "materials", title: "Tài liệu", render: materialsPage },
    { key: "notices", title: "Thông báo", render: async (el) => el.append(await noticesView(db, "teacher", h)) }] });
}
