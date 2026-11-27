import { auth, db, API_BASE } from "./firebase.js";
import { CONFIG, COURSES, RUBRICS } from "./defaults.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, writeBatch, query, where, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { renderSchedule, leaveSchedule } from "./schedule.js";
import { openImport } from "./import-students.js";
import { renderReports } from "./reports-import.js";
import { slotsForName, DAYS } from "./grid-core.js";

// ---------- helper DOM (luon dung textContent, khong chen HTML tu du lieu) ----------
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const $ = (id) => document.getElementById(id);
const dlg = $("dlg");
dlg.addEventListener("close", () => { dlg.className = ""; });
const genPassword = () => { const a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, (n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 31]).join(""); };

// ---------- khai bao cac bang quan ly ----------
const YESNO = [["", "—"], ["true", "Có"], ["false", "Không"]];
const STATUS = [["Active", "Đang hoạt động"], ["Hold", "Tạm hoãn (Hold)"], ["Inactive", "Ngưng"]];
const ENTITIES = {
  teachers: { title: "Giáo viên", coll: "teachers", id: "teacherId", role: "teacher", account: true, fields: [
    { k: "teacherId", label: "Mã GV", req: true }, { k: "name", label: "Tên", req: true },
    { k: "shift", label: "Ca làm việc", type: "select", options: [["", "—"], ["morning", "Sáng"], ["afternoon", "Chiều tối"], ["evening", "Chỉ tối"], ["mixed", "Linh hoạt"]] },
    { k: "rate25", label: "Lương buổi 25p", type: "number" }, { k: "rate50", label: "Lương buổi 50p", type: "number" },
    { k: "rateAbsent25", label: "Vắng 25p", type: "number" }, { k: "rateAbsent50", label: "Vắng 50p", type: "number" },
    { k: "status", label: "Trạng thái", type: "select", options: STATUS } ] },
  students: { title: "Học viên", coll: "students", id: "sc", role: "student", account: true, fields: [
    { k: "sc", label: "Mã SC", req: true }, { k: "fullName", label: "Họ tên", req: true },
    { k: "agencyId", label: "Agency", type: "select", options: () => [["", "—"], ...(cache.agencies || []).map((a) => [a.agencyId, a.name || a.agencyId])] },
    { k: "meetLink", label: "Link Meet" }, { k: "isNew", label: "Học viên mới / học thử", type: "bool" },
    { k: "teacherIds", label: "Giáo viên", type: "teachers" },
    { k: "status", label: "Trạng thái", type: "select", options: STATUS } ] },
  agencies: { title: "Agency", coll: "agencies", id: "agencyId", role: "agency", account: true, fields: [
    { k: "agencyId", label: "Mã agency", req: true }, { k: "name", label: "Tên", req: true }, { k: "contact", label: "Liên hệ" } ] },
  courses: { title: "Khóa học", coll: "courses", id: "courseId", fields: [
    { k: "courseId", label: "Mã khóa", req: true }, { k: "name", label: "Tên", req: true },
    { k: "scale", label: "Thang điểm", type: "select", options: [["CEFR100", "CEFR (100 điểm)"], ["IELTS_BAND", "IELTS band"]] },
    { k: "status", label: "Trạng thái", type: "select", options: STATUS } ] },
};
const cache = {};     // cache[collection] = [docs]
const teacherName = (id) => (cache.teachers || []).find((t) => t.teacherId === id)?.name || id;
let accounts = [];     // users/*
let current = "teachers";

async function load(coll) {
  const snap = await getDocs(collection(db, coll));
  cache[coll] = snap.docs.map((d) => ({ ...d.data(), [ENTITIES[coll]?.id || "id"]: d.id }));
  cache[coll].sort((a, b) => String(a[ENTITIES[coll]?.id] ?? "").localeCompare(String(b[ENTITIES[coll]?.id] ?? "")));
}
async function loadAccounts() { accounts = (await getDocs(collection(db, "users"))).docs.map((d) => ({ uid: d.id, ...d.data() })); }
const accountFor = (ent, id) => accounts.find((u) => u.role === ent.role && u[ent.role === "teacher" ? "teacherId" : ent.role === "student" ? "sc" : "agencyId"] === id);

// ---------- hien thi bang ----------
const display = (f, v) => {
  if (v == null || v === "") return "";
  if (f.type === "bool") return v ? "Có" : "Không";
  if (f.type === "tags") return Array.isArray(v) ? v.join(", ") : v;
  if (f.type === "teachers") return (Array.isArray(v) ? v : []).map(teacherName).join(", ");
  if (f.type === "select") { const o = (typeof f.options === "function" ? f.options() : f.options).find(([val]) => val === v); return o ? o[1] : v; }
  return v;
};
let renderSeq = 0;   // chi lan ve moi nhat duoc phep ghi len man hinh (bam tab nhanh khong bi de)
async function render() {
  const my = ++renderSeq, ent = ENTITIES[current];
  const main = $("main"); main.replaceChildren();
  leaveSchedule();
  $("nav").replaceChildren(...[...Object.entries(ENTITIES), ["schedule", { title: "Lịch giáo viên" }], ["reports", { title: "Nhập báo cáo" }], ["settings", { title: "Cài đặt" }]].map(([key, e]) =>
    h("button", { "aria-current": String(key === current), "data-nav": key, onclick: () => { current = key; render(); } }, e.title)));
  if (current === "settings") return renderSettings(main);
  if (current === "reports") return renderReports(main, { db, h, alive: () => my === renderSeq });
  if (current === "schedule") return renderSchedule(main, { db, h, dlg, reload: render, alive: () => my === renderSeq });
  await Promise.all([load(ent.coll), ent.coll === "students" ? Promise.all([load("agencies"), load("teachers")]) : null, ent.account ? loadAccounts() : null]);
  if (my !== renderSeq) return;
  const cols = ent.fields.filter((f) => !f.hide);
  const rows = cache[ent.coll];
  main.append(
    h("div", { class: "bar" }, h("h2", {}, `${ent.title} (${rows.length})`), ent.coll === "students" ? h("button", { class: "s", id: "importBtn", onclick: () => openImport({ db, h, dlg, reload: render }) }, "Nhập từ file Excel/CSV") : null,
      h("button", { class: "p", id: "add", onclick: () => openForm(ent) }, `+ Thêm ${ent.title.toLowerCase()}`)),
    rows.length === 0 ? h("div", { class: "wrap empty" }, "Chưa có dữ liệu.") :
    h("div", { class: "wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, cols.map((f) => h("th", {}, f.label)), h("th", {}, ent.account ? "Tài khoản" : ""), h("th", {}, ""))),
      h("tbody", {}, rows.map((r) => {
        const acc = ent.account ? accountFor(ent, r[ent.id]) : null;
        return h("tr", { "data-id": r[ent.id] }, cols.map((f) => h("td", {}, display(f, r[f.k]))),
          h("td", {}, ent.account ? (acc ? `${acc.username}` : "Chưa có") : ""),
          h("td", { class: "act" }, h("button", { class: "s", onclick: () => openForm(ent, r) }, "Sửa"),
            ent.account ? h("button", { class: "s", onclick: () => openAccount(ent, r, acc) }, acc ? "Đặt lại mật khẩu" : "Tạo tài khoản") : null,
            h("button", { class: "s danger", "data-del": r[ent.id], onclick: () => openDelete(ent, r, acc) }, "Xóa")));
      })))));
}

// ---------- form them/sua ----------
function openForm(ent, row) {
  const editing = !!row, msg = h("div", { class: "msg err", role: "alert" });
  const inputs = {};
  const form = h("form", { method: "dialog" }, h("h3", {}, `${editing ? "Sửa" : "Thêm"} ${ent.title.toLowerCase()}`),
    ent.fields.map((f) => {
      const val = row?.[f.k];
      let input;
      if (f.type === "select") { input = h("select", {}, (typeof f.options === "function" ? f.options() : f.options).map(([v, l]) => h("option", { value: v, selected: v === (val ?? "") }, l))); }
      else if (f.type === "bool") { input = h("input", { type: "checkbox", checked: !!val }); }
      else if (f.type === "tags") { input = h("input", { value: Array.isArray(val) ? val.join(", ") : "" }); }
      else if (f.type === "teachers") {
        const sel = new Set(Array.isArray(val) ? val : []);
        input = h("div", { class: "checklist", "data-field": f.k }, (cache.teachers || []).map((t) => h("label", { class: "inline" }, h("input", { type: "checkbox", value: t.teacherId, checked: sel.has(t.teacherId) }), ` ${t.name} (${t.teacherId})`)),
          [...sel].filter((id) => !(cache.teachers || []).some((t) => t.teacherId === id)).map((id) => h("label", { class: "inline" }, h("input", { type: "checkbox", value: id, checked: true }), ` ${id} (không còn trong danh sách)`)));
      }
      else { input = h("input", { type: f.type === "number" ? "number" : "text", step: f.type === "number" ? "any" : null, value: val ?? "", required: !!f.req, disabled: editing && f.k === ent.id }); }
      inputs[f.k] = input;
      return [h("label", {}, f.label), input];
    }),
    msg,
    h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Hủy"), h("button", { type: "submit", class: "p" }, "Lưu")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {};
    for (const f of ent.fields) {
      const el = inputs[f.k];
      if (f.type === "bool") data[f.k] = el.checked;
      else if (f.type === "tags") data[f.k] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (f.type === "teachers") data[f.k] = [...el.querySelectorAll("input:checked")].map((i) => i.value);
      else if (f.type === "number") { if (el.value !== "") data[f.k] = Number(el.value); }
      else if (el.value !== "" || editing) data[f.k] = el.value.trim();
    }
    const id = String(data[ent.id] ?? row?.[ent.id] ?? "").trim();
    if (!id || /[\/\s]/.test(id)) { msg.textContent = "Mã không được để trống, không chứa khoảng trắng hoặc dấu /."; return; }
    if (!editing && cache[ent.coll].some((r) => r[ent.id] === id)) { msg.textContent = "Mã này đã tồn tại."; return; }
    try { delete data[ent.id]; await setDoc(doc(db, ent.coll, id), data, { merge: true }); dlg.close(); await render(); }
    catch (err) { msg.textContent = "Không lưu được: " + (err.code || err.message); }
  });
  dlg.replaceChildren(form); dlg.showModal();
  if (editing && ent.coll === "students") appendStudentInfo(form, row);
}

// Goi hoc va lich tuan (chi doc) cua hoc vien, lay tu enrollments va luoi lich (khop theo ten).
async function appendStudentInfo(form, row) {
  const box = h("div", { class: "info", id: "stuInfo" }, h("p", { class: "note" }, "Đang tải gói học và lịch tuần..."));
  form.insertBefore(box, form.querySelector(".msg"));
  try {
    const [en, sch] = await Promise.all([getDocs(query(collection(db, "enrollments"), where("sc", "==", row.sc))), getDocs(collection(db, "schedule"))]);
    const all = Object.fromEntries(sch.docs.map((d) => [d.id, d.data().cells || {}]));
    const pk = en.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    const slots = slotsForName(all, row.fullName);
    box.replaceChildren(
      h("h4", {}, `Gói học (${pk.length})`),
      pk.length ? h("table", { class: "mini" }, pk.map((e) => h("tr", {}, h("td", {}, e.courseId || "?"), h("td", {}, e.kind || ""), h("td", {}, teacherName(e.teacherId) || e.teacherName || ""), h("td", {}, `${e.startDate || "?"} → ${e.endDate || "?"}`), h("td", {}, e.sessions ? `${e.sessions} buổi` : ""), h("td", {}, e.status || ""), h("td", { class: "note" }, (e.flags || []).length ? "cần kiểm" : "")))) : h("p", { class: "note" }, "Chưa có gói học."),
      h("h4", {}, "Lịch tuần trên lưới (chỉ xem, sửa ở tab Lịch giáo viên)"),
      slots.length ? h("ul", {}, slots.map((x) => h("li", {}, `${DAYS[x.day]} ${x.from}-${x.to} · ${teacherName(x.teacherId)}`))) : h("p", { class: "note" }, "Chưa thấy tên học viên này trên lưới lịch (khớp theo họ tên)."));
  } catch (e) { box.replaceChildren(h("p", { class: "msg err" }, "Không tải được: " + (e.code || e.message))); }
}

// ---------- xoa (kem chuyen sang muc khac neu dang duoc dung) ----------
const refOf = { agencies: { students: "agencyId", enrollments: "agencyId", billing: "agencyId" }, courses: { enrollments: "courseId" }, teachers: { enrollments: "teacherId" } };
const countWhere = async (coll, field, op, val) => (await getDocs(query(collection(db, coll), where(field, op, val)))).size;
async function openDelete(ent, row, acc) {
  const id = row[ent.id], label = row.name || row.fullName || id, msg = h("div", { class: "msg", role: "status" });
  const body = h("div", {}, h("p", { class: "note" }, "Đang kiểm tra dữ liệu liên quan..."));
  dlg.replaceChildren(h("h3", {}, `Xóa ${ent.title.toLowerCase()}: ${label}`), body, msg); dlg.showModal();
  try {
    const uses = [];   // [mo ta, so luong]
    if (ent.coll === "agencies") { uses.push(["học viên", await countWhere("students", "agencyId", "==", id)], ["gói học", await countWhere("enrollments", "agencyId", "==", id)]); }
    if (ent.coll === "courses") uses.push(["gói học", await countWhere("enrollments", "courseId", "==", id)]);
    if (ent.coll === "teachers") {
      uses.push(["gói học", await countWhere("enrollments", "teacherId", "==", id)], ["học viên đang gắn giáo viên này", await countWhere("students", "teacherIds", "array-contains", id)]);
      const sd = await getDoc(doc(db, "schedule", id)); uses.push(["ô trên lưới lịch", Object.keys(sd.data()?.cells || {}).length]);
    }
    let pkgs = 0;
    if (ent.coll === "students") { pkgs = await countWhere("enrollments", "sc", "==", id); uses.push(["gói học (sẽ bị xóa theo)", pkgs], ["bản ghi thu tiền (sẽ bị xóa theo)", await countWhere("billing", "sc", "==", id)]); }
    const used = uses.filter(([, n]) => n > 0), hard = used.filter(([t]) => !t.startsWith("ô trên lưới"));
    const needsTarget = ent.coll !== "students" && hard.length > 0, offerTarget = ent.coll !== "students" && used.length > 0;   // lich luoi: chuyen sang GV khac la tuy chon
    const others = (cache[ent.coll] || []).filter((r) => r[ent.id] !== id);
    const target = h("select", { id: "delTarget" }, h("option", { value: "" }, "— chọn —"), others.map((r) => h("option", { value: r[ent.id] }, `${r.name || r.fullName} (${r[ent.id]})`)));
    const ok = h("input", { type: "checkbox", id: "delOk" });
    const go = h("button", { type: "button", class: "p danger", id: "delGo" }, "Xóa");
    body.replaceChildren(...[
      used.length ? h("p", {}, "Đang được dùng bởi: ", used.map(([t, n]) => `${n} ${t}`).join(", "), ".") : h("p", {}, "Không có dữ liệu nào đang dùng mục này."),
      offerTarget ? [h("label", {}, `Chuyển các dữ liệu trên sang ${ent.title.toLowerCase()} khác trước khi xóa ${needsTarget ? "(bắt buộc)" : "(không bắt buộc; để trống thì lịch trên lưới bị xóa theo)"}`), target] : null,
      acc ? h("p", { class: "note" }, `Tài khoản đăng nhập "${acc.username}" cũng sẽ bị xóa.`) : null,
      h("label", { class: "inline" }, ok, " Tôi hiểu việc xóa không thể hoàn tác."),
      h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Hủy"), go)].flat().filter(Boolean));
    go.onclick = async () => {
      if (!ok.checked) { msg.className = "msg err"; msg.textContent = "Hãy tích ô xác nhận."; return; }
      if (needsTarget && !target.value) { msg.className = "msg err"; msg.textContent = "Hãy chọn mục để chuyển dữ liệu sang."; return; }
      go.disabled = true; msg.className = "msg"; msg.textContent = "Đang xóa...";
      try {
        const note = await doDelete(ent, id, target.value, acc); await render();
        if (note) { msg.className = "msg err"; msg.textContent = note; go.remove(); } else dlg.close();
      }
      catch (e) { msg.className = "msg err"; msg.textContent = "Không xóa được: " + (e.code || e.message); go.disabled = false; }
    };
  } catch (e) { body.replaceChildren(h("p", { class: "msg err" }, "Không kiểm tra được: " + (e.code || e.message))); }
}
async function commitOps(ops) {   // ops: [(batch) => void]
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); }
}
async function doDelete(ent, id, to, acc) {
  const ops = [], docsOf = async (coll, field, op, val) => (await getDocs(query(collection(db, coll), where(field, op, val)))).docs;
  if (ent.coll === "agencies" || ent.coll === "courses" || ent.coll === "teachers") {
    for (const [coll, field] of Object.entries(refOf[ent.coll])) for (const d of await docsOf(coll, field, "==", id)) ops.push((b) => b.update(d.ref, { [field]: to }));
    if (ent.coll === "teachers" && to) {
      for (const d of await docsOf("students", "teacherIds", "array-contains", id)) ops.push((b) => { b.update(d.ref, { teacherIds: arrayRemove(id) }); b.update(d.ref, { teacherIds: arrayUnion(to) }); });
      const [src, dst] = await Promise.all([getDoc(doc(db, "schedule", id)), getDoc(doc(db, "schedule", to))]);
      if (src.exists() && Object.keys(src.data().cells || {}).length) ops.push((b) => b.set(doc(db, "schedule", to), { teacherId: to, cells: { ...src.data().cells, ...(dst.data()?.cells || {}) }, updatedAt: Date.now() }));   // lich cua giao vien dich duoc uu tien khi trung o
      if (src.exists()) ops.push((b) => b.delete(doc(db, "schedule", id)));
    }
  }
  if (ent.coll === "teachers" && !to) {   // khong chuyen: xoa lich theo
    for (const d of await docsOf("students", "teacherIds", "array-contains", id)) ops.push((b) => b.update(d.ref, { teacherIds: arrayRemove(id) }));
    const sd = await getDoc(doc(db, "schedule", id)); if (sd.exists()) ops.push((b) => b.delete(sd.ref)); }
  if (ent.coll === "students") for (const coll of ["enrollments", "billing"]) for (const d of await docsOf(coll, "sc", "==", id)) ops.push((b) => b.delete(d.ref));
  ops.push((b) => b.delete(doc(db, ent.coll, id)));
  let note = "";
  if (acc) { try { await callApi("/api/users/delete", { uid: acc.uid }); } catch (e) { note = `Dữ liệu đã xóa, nhưng tài khoản đăng nhập "${acc.username}" chưa xóa được (${e.message}). Nếu báo "Không tìm thấy", Worker cần được cập nhật bản mới.`; } }
  await commitOps(ops);
  return note;
}

// ---------- tao tai khoan / dat lai mat khau (qua Worker) ----------
async function callApi(path, body) {
  const res = await fetch(API_BASE + path, { method: "POST", headers: { authorization: `Bearer ${await auth.currentUser.getIdToken(true)}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}
function openAccount(ent, row, acc) {
  const id = row[ent.id], pw = genPassword(), msg = h("div", { class: "msg", role: "status" });
  const username = h("input", { value: acc?.username || String(id).toLowerCase(), disabled: !!acc, required: true });
  const password = h("input", { value: pw, required: true });
  const submit = h("button", { type: "submit", class: "p" }, acc ? "Đặt lại" : "Tạo tài khoản");
  const form = h("form", { method: "dialog" },
    h("h3", {}, `${acc ? "Đặt lại mật khẩu" : "Tạo tài khoản"}: ${row.name || row.fullName || id}`),
    h("label", {}, "Tên đăng nhập (chữ thường, số, . _ -)"), username,
    h("label", {}, "Mật khẩu tạm (người dùng bắt buộc đổi ở lần đăng nhập đầu)"), password, msg,
    h("div", { class: "row" }, h("button", { type: "button", class: "s", onclick: () => dlg.close() }, "Đóng"), submit));
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); submit.disabled = true; msg.className = "msg"; msg.textContent = "Đang xử lý...";
    try {
      if (acc) await callApi("/api/users/reset", { uid: acc.uid, password: password.value });
      else {
        const body = { username: username.value, password: password.value, role: ent.role, displayName: row.name || row.fullName || id };
        body[ent.role === "teacher" ? "teacherId" : ent.role === "student" ? "sc" : "agencyId"] = id;
        await callApi("/api/users/create", body);
      }
      msg.className = "msg ok";
      msg.replaceChildren("Xong. Gửi cho người dùng: tên đăng nhập ", h("code", {}, username.value.trim().toLowerCase()), " và mật khẩu tạm ", h("code", {}, password.value), ".");
      submit.remove(); await loadAccounts();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; submit.disabled = false; }
  });
  dlg.replaceChildren(form); dlg.showModal();
}

// ---------- cai dat: nap du lieu mac dinh ----------
function renderSettings(main) {
  const msg = h("div", { class: "msg", role: "status" });
  main.append(h("div", { class: "bar" }, h("h2", {}, "Cài đặt")),
    h("div", { class: "wrap", style: "padding:16px" },
      h("p", {}, "Nạp cấu hình mặc định theo blueprint: 10 buổi/RC, đơn giá lương tạm thời, các khóa học và bảng quy đổi điểm CEFR/IELTS. Chỉ ghi những mục chưa có, không đè dữ liệu đã sửa."),
      h("button", { class: "p", id: "seed", onclick: async (e) => {
        e.target.disabled = true; msg.className = "msg"; msg.textContent = "Đang nạp...";
        try { msg.className = "msg ok"; msg.textContent = `Đã thêm ${await seedDefaults()} mục mới.`; }
        catch (err) { msg.className = "msg err"; msg.textContent = "Lỗi: " + (err.code || err.message); }
        e.target.disabled = false; } }, "Nạp dữ liệu mặc định"), msg));
}
async function seedDefaults() {
  const plan = [["config", CONFIG], ["courses", COURSES], ["rubrics", RUBRICS]];
  let added = 0; const batch = writeBatch(db);
  for (const [coll, items] of plan) {
    const existing = new Set((await getDocs(collection(db, coll))).docs.map((d) => d.id));
    for (const [id, data] of Object.entries(items)) if (!existing.has(id)) { batch.set(doc(db, coll, id), data); added++; }
  }
  if (added) await batch.commit();
  return added;
}

// ---------- khoi dong: chi admin ----------
$("out").onclick = () => signOut(auth);
onAuthStateChanged(auth, async (u) => {
  if (!u) { location.replace("index.html"); return; }
  const profile = (await getDoc(doc(db, "users", u.uid))).data();
  if (profile?.role !== "admin") { location.replace("app.html"); return; }
  $("who").textContent = profile.displayName || u.email;
  render();
});
