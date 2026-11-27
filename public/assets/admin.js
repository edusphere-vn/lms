import { auth, db, API_BASE } from "./firebase.js";
import { CONFIG, COURSES, RUBRICS } from "./defaults.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { renderSchedule, leaveSchedule } from "./schedule.js";
import { openImport } from "./import-students.js";

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
    { k: "teacherIds", label: "Giáo viên đang dạy (mã, cách nhau dấu phẩy)", type: "tags", hide: true },
    { k: "status", label: "Trạng thái", type: "select", options: STATUS } ] },
  agencies: { title: "Agency", coll: "agencies", id: "agencyId", role: "agency", account: true, fields: [
    { k: "agencyId", label: "Mã agency", req: true }, { k: "name", label: "Tên", req: true }, { k: "contact", label: "Liên hệ" } ] },
  courses: { title: "Khóa học", coll: "courses", id: "courseId", fields: [
    { k: "courseId", label: "Mã khóa", req: true }, { k: "name", label: "Tên", req: true },
    { k: "scale", label: "Thang điểm", type: "select", options: [["CEFR100", "CEFR (100 điểm)"], ["IELTS_BAND", "IELTS band"]] },
    { k: "status", label: "Trạng thái", type: "select", options: STATUS } ] },
};
const cache = {};     // cache[collection] = [docs]
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
  if (f.type === "select") { const o = (typeof f.options === "function" ? f.options() : f.options).find(([val]) => val === v); return o ? o[1] : v; }
  return v;
};
let renderSeq = 0;   // chi lan ve moi nhat duoc phep ghi len man hinh (bam tab nhanh khong bi de)
async function render() {
  const my = ++renderSeq, ent = ENTITIES[current];
  const main = $("main"); main.replaceChildren();
  leaveSchedule();
  $("nav").replaceChildren(...[...Object.entries(ENTITIES), ["schedule", { title: "Lịch giáo viên" }], ["settings", { title: "Cài đặt" }]].map(([key, e]) =>
    h("button", { "aria-current": String(key === current), "data-nav": key, onclick: () => { current = key; render(); } }, e.title)));
  if (current === "settings") return renderSettings(main);
  if (current === "schedule") return renderSchedule(main, { db, h, alive: () => my === renderSeq });
  await Promise.all([load(ent.coll), ent.coll === "students" ? load("agencies") : null, ent.account ? loadAccounts() : null]);
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
            ent.account ? h("button", { class: "s", onclick: () => openAccount(ent, r, acc) }, acc ? "Đặt lại mật khẩu" : "Tạo tài khoản") : null));
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
