// E2E tren trinh duyet: dang nhap, doi mat khau, trang admin. Chay: npm run test:e2e (can Java + Chromium cho Playwright).
// Bundle Firebase SDK duoc dung thay cho CDN gstatic (route trong Playwright) de chay offline.
import http from "http"; import fs from "fs"; import path from "path";
import { chromium } from "playwright"; import { createRequire } from "module"; import os from "os";
const XLSX = createRequire(import.meta.url)("xlsx");
import { initializeApp } from "firebase-admin/app"; import { getAuth } from "firebase-admin/auth"; import { getFirestore } from "firebase-admin/firestore";

const ROOT = new URL("../../public", import.meta.url).pathname, FB = new URL("./.cache/all.js", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".LICENSE": "text/plain" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname === "/__fb/all.js" ? FB : path.join(ROOT, u.pathname === "/" ? "index.html" : u.pathname);
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { "content-type": types[path.extname(p)] || "text/plain", "access-control-allow-origin": "*" }); res.end(d); } });
}).listen(5173);

initializeApp({ projectId: "esvn-lms" });
const user = await getAuth().createUser({ email: "peter@lms.edusphere.vn", password: "tam-12345", displayName: "Peter" });
await getAuth().setCustomUserClaims(user.uid, { role: "admin" });
await getFirestore().doc(`users/${user.uid}`).set({ username: "peter", displayName: "Peter", role: "admin", mustChangePassword: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); const page = await browser.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.route(/gstatic\.com\/firebasejs\/11\.0\.2\/firebase-(app|auth|firestore)\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: `export * from "http://localhost:5173/__fb/all.js";` }));
let apiBody = null;
await page.route("https://edusphere-lms-api.eduspherevn.workers.dev/**", async (r) => { apiBody = { url: r.request().url(), auth: r.request().headers().authorization, body: JSON.parse(r.request().postData()) }; await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ uid: "x", username: "alden" }) }); });
const SHOTS = process.env.SHOTS; const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${name}.png` }); };
let pass = 0; const ok = (c, m) => { if (c) pass++; else { console.log("FAIL:", m); process.exitCode = 1; } };

// 1. Dang nhap sai, roi dung + doi mat khau lan dau
await page.goto("http://localhost:5173/index.html");
await page.fill("#username", "peter"); await page.fill("#password", "sai-mat-khau"); await page.click("#loginForm button");
await page.waitForFunction(() => document.getElementById("loginMsg").textContent.length > 0);
ok((await page.textContent("#loginMsg")).includes("Sai"), "bao sai mat khau");
await page.fill("#password", "tam-12345"); await page.click("#loginForm button");
await page.waitForSelector("#change:not([hidden])");
await page.fill("#newPassword", "mat-khau-moi-1"); await page.fill("#newPassword2", "mat-khau-moi-1"); await page.click("#changeForm button");
await page.waitForURL("**/admin.html"); ok(true, "vao admin sau khi doi mat khau");
ok((await getFirestore().doc(`users/${user.uid}`).get()).data().mustChangePassword === false, "mustChangePassword tat");

// 2. Nap du lieu mac dinh
await page.click("nav button:has-text('Cài đặt')"); await page.click("#seed");
await page.waitForFunction(() => /Đã thêm/.test(document.querySelector(".msg")?.textContent || ""));
ok((await page.textContent(".msg")).includes("32 mục"), "nap 32 muc: " + await page.textContent(".msg"));
await page.click("#seed"); await page.waitForFunction(() => /Đã thêm 0/.test(document.querySelector(".msg")?.textContent || ""));
ok(true, "nap lan 2 khong them gi");

// 3. Them agency, giao vien, hoc vien
const add = async (nav, vals) => { await page.click(`nav button:text-is('${nav}')`); await page.waitForFunction((n) => document.querySelector(".bar h2")?.textContent.startsWith(n), nav, { timeout: 8000 }).catch(async () => { console.log("NAV FAIL", nav, "| h2:", await page.textContent(".bar h2").catch(() => "-"), "| errors:", errors.join(" | ")); process.exit(2); }); await page.click("#add"); await page.waitForSelector("dialog[open]", {timeout:5000}).catch(async()=>{ console.log("DIALOG NOT OPEN. errors:", errors.join(" | ")); console.log((await page.content()).slice(0,1500)); process.exit(2); });
  for (const [i, v] of vals) await page.locator("dialog input:not([type=checkbox]), dialog select").nth(i).fill(v, {timeout:4000});
  await page.click("dialog button[type=submit]"); await page.waitForSelector("dialog[open]", { state: "hidden" }); };
await add("Agency", [[0, "OEC"], [1, "OEC Education"]]);
await add("Giáo viên", [[0, "T1"], [1, "Alden"], [3, "100"], [4, "200"]]);
await page.click("nav button:text-is('Học viên')"); await page.waitForFunction(() => document.querySelector(".bar h2")?.textContent.startsWith("Học viên")); await page.click("#add");
ok((await page.locator("dialog select option").allTextContents()).some((t) => t.includes("OEC Education")), "dropdown agency co du lieu");
await page.locator("dialog input").nth(0).fill("ES112"); await page.locator("dialog input").nth(1).fill("Pham Thanh Thuy");
await page.locator("dialog select").first().selectOption("OEC"); await page.locator("dialog input[type=checkbox]").first().check();
ok((await page.locator(".checklist label").first().textContent()).includes("Alden"), "danh sach giao vien hien ten"); await page.locator(".checklist input[value=T1]").check();
await page.click("dialog button[type=submit]"); await page.waitForSelector("dialog[open]", { state: "hidden" });
await page.waitForSelector("tr[data-id=ES112]");
ok((await page.textContent("tr[data-id=ES112]")).includes("Alden"), "bang hoc vien hien ten giao vien, khong chi ma");
const t = await getFirestore().doc("teachers/T1").get(), s = await getFirestore().doc("students/ES112").get();
ok(t.data().name === "Alden" && t.data().rate50 === 200, "teachers/T1 dung");
ok(s.data().fullName === "Pham Thanh Thuy" && s.data().agencyId === "OEC" && s.data().isNew === true && JSON.stringify(s.data().teacherIds) === '["T1"]', "students/ES112 dung: " + JSON.stringify(s.data()));
// trung ma
await page.click("#add"); await page.locator("dialog input").nth(0).fill("ES112"); await page.locator("dialog input").nth(1).fill("X"); await page.click("dialog button[type=submit]");
ok((await page.textContent("dialog .msg")).includes("đã tồn tại"), "chan trung ma"); await page.click("dialog button:has-text('Hủy')");
// sua
await page.click("tr[data-id=ES112] button:has-text('Sửa')"); await page.locator("dialog input").nth(1).fill("Pham Thanh Thuy B"); await page.click("dialog button[type=submit]");
await page.waitForSelector("tr[data-id=ES112] td:has-text('Pham Thanh Thuy B')"); ok(true, "sua hoc vien");

// 4. Tao tai khoan qua Worker (gia lap)
await page.click("nav button:text-is('Giáo viên')");
await page.click("tr[data-id=T1] button:has-text('Tạo tài khoản')");
await page.fill("dialog input >> nth=0", "alden"); await page.click("dialog button[type=submit]");
await page.waitForSelector("dialog .msg.ok");
ok(apiBody?.url.endsWith("/api/users/create") && apiBody.auth?.startsWith("Bearer ") && apiBody.body.role === "teacher" && apiBody.body.teacherId === "T1" && apiBody.body.username === "alden" && apiBody.body.password.length >= 8, "goi Worker dung: " + JSON.stringify(apiBody?.body));


// 5. Luoi lich: go, Enter, keo o, dan TSV, sao chep, xoa, hoan tac, mau, trung gio, dem o
const fdb = getFirestore();
await fdb.doc("teachers/T2").set({ name: "Miles" });
await fdb.doc("enrollments/e1").set({ sc: "ES112", courseId: "IELTS_SP", teacherId: "T1" });
await page.click("dialog button:has-text('Đóng')");
await page.click("nav button[data-nav=schedule]"); await page.waitForSelector("table.grid td.cell");
ok((await page.locator(".gtab").allTextContents()).join("|") === "Alden · 0|Miles · 0", "tab giao vien + dem o: " + await page.locator(".gtab").allTextContents());
const cell = (r, c) => page.locator(`td.cell[data-r="${r}"][data-c="${c}"]`);
await cell(2, 1).click(); await page.keyboard.type("Pham Thanh Thuy B"); await page.keyboard.press("Enter");
ok((await cell(2, 1).textContent()) === "Pham Thanh Thuy B" && /ielts/.test(await cell(2, 1).getAttribute("class")), "go ten + mau IELTS theo khoa hoc");
ok(await cell(3, 1).evaluate((el) => el.classList.contains("focus")), "Enter xuong o duoi");
await page.waitForFunction(() => document.getElementById("gridStatus").textContent === "Đã lưu");
ok((await fdb.doc("schedule/T1").get()).data().cells["1_0700"].t === "Pham Thanh Thuy B", "luu schedule/T1 vao Firestore");
// keo o xuong 3 hang
await cell(2, 1).click(); const fh = await page.locator(".fh").boundingBox(), tgt = await cell(5, 1).boundingBox();
await page.mouse.move(fh.x + 4, fh.y + 4); await page.mouse.down(); await page.mouse.move(tgt.x + 20, tgt.y + 10, { steps: 6 }); await page.mouse.up();
ok((await cell(5, 1).textContent()) === "Pham Thanh Thuy B" && (await cell(3, 1).textContent()) === "Pham Thanh Thuy B", "keo o dien lap");
await page.waitForFunction(() => document.getElementById("gridStatus").textContent === "Đã lưu");
ok((await page.locator(".gtab").first().textContent()) === "Alden · 4", "dem o sau khi keo");
// dan TSV (nhu copy tu Google Sheets)
await cell(10, 0).click();
await page.evaluate(() => { const dt = new DataTransfer(); dt.setData("text/plain", 'A1\tB1\n"A2 x"\tB2'); document.getElementById("gridwrap").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true })); });
ok((await cell(11, 0).textContent()) === "A2 x" && (await cell(10, 1).textContent()) === "B1", "dan TSV");
// sao chep vung
await cell(10, 0).click(); await cell(11, 1).click({ modifiers: ["Shift"] });
const copied = await page.evaluate(() => { const dt = new DataTransfer(); document.getElementById("gridwrap").dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData("text/plain"); });
ok(copied === 'A1\tB1\nA2 x\tB2', "sao chep TSV: " + JSON.stringify(copied));
// xoa + hoan tac
await page.keyboard.press("Delete"); ok((await cell(10, 0).textContent()) === "" && (await cell(11, 1).textContent()) === "", "Delete xoa vung");
await page.keyboard.press("Control+z"); ok((await cell(11, 0).textContent()) === "A2 x", "Ctrl+Z hoan tac");
// mau thu cong
await cell(20, 3).click(); await page.click("#kNa"); ok(/\bna\b/.test(await cell(20, 3).getAttribute("class")), "dat mau Khong ranh");
await page.waitForFunction(() => document.getElementById("gridStatus").textContent === "Đã lưu");
// trung gio voi giao vien khac
await fdb.doc("schedule/T2").set({ teacherId: "T2", cells: { "1_0700": { t: "pham thanh thuy b" } } });
await page.click("nav button[data-nav=teachers]"); await page.click("nav button[data-nav=schedule]"); await page.waitForSelector("td.cell.conflict");
ok(/conflict/.test(await cell(2, 1).getAttribute("class")), "o trung gio bi to vien do");
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "/grid.png" });
// ten gia lap XSS khong chen HTML
await cell(30, 6).click(); await page.keyboard.type("<img src=x onerror=window.__xss=1>"); await page.keyboard.press("Enter");
ok(!(await page.evaluate(() => window.__xss)) && (await page.locator("table.grid img").count()) === 0, "o lich khong chen HTML");

// 5b. Hoc vien: goi hoc + lich tuan doc tu luoi
await page.click("nav button[data-nav=students]"); await page.waitForSelector("tr[data-id=ES112]");
await page.click("tr[data-id=ES112] button:has-text('Sửa')"); await page.waitForSelector("#stuInfo li");
ok((await page.textContent("#stuInfo")).includes("Thứ Ba 07:00-09:00 · Alden") && (await page.textContent("#stuInfo")).includes("IELTS_SP"), "dialog hoc vien hien lich tuan + goi hoc: " + await page.textContent("#stuInfo"));
await page.click("dialog button:has-text('Hủy')");

// 6. Nhap danh sach hoc vien tu xlsx (du lieu gia lap)
const H = ["SC", "Agency", "Name", "Course", "Period", "Class", "Skd", "Length", "VTime", "Start", "Mo", "End", "Year", "Invoice", "Paid", "Status", "Type", "Teacher"];
const ser = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) / 86400000 + 25569;
const R = (sc, ag, name, course, skd, t, st, en, paid, status, type, teacher, meet) => [sc, ag, name, course, 5, 10, skd, 50, t, ser(st), 8, ser(en), 2026, null, paid, status, type, teacher, meet];
const aoa = [H,
  R("ES9001", "Smart Alpha", "Le Binh Minh", "ESL Speaking", "Tue-Thu", 20 / 24, "2026-08-13", "2026-09-17", "Paid", "Done", "New ", "Alden", "https://meet.google.com/aaa-bbbb-ccc"),
  R("ES9001", "smart alpha", "Le Binh Minh", "ESL Speaking", "Tue-Thu", 20 / 24, "2026-09-20", "2026-10-25", "", "Processing", "Extend", "Alden"),
  R("ES9001", "smart alpha", "Le Binh Minh", "ESL Speaking", "Tue-Thu", 20 / 24, "2026-09-20", "2026-10-25", "", "Processing", "Extend", "Alden"),   // dong trung
  R("ES9002", "Eduphil", "Mai Anh", "IELTS Speaking", "Mon-Wed-Fri", 21 / 24, "2026-07-01", "2026-08-05", "Paid", "Cancelled", "New", "Kristea"),   // Cancelled + Paid
  R("ES9003", "Eduphil", "Nguyen Thi Thịnh", "Visa Interview", "MTWTF", 9 / 24, "2026-09-04", "2026-08-19", "", "Hold", "New", "Krishtea"),
  [null, null, "Tong ket", null, null, null, "Total Classes"]];
const wbx = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wbx, XLSX.utils.aoa_to_sheet([["Danh sach"]]), "Ghi chu"); XLSX.utils.book_append_sheet(wbx, XLSX.utils.aoa_to_sheet(aoa), "SL-Going");
const xlsxPath = path.join(os.tmpdir(), "sl-going-test.xlsx"); XLSX.writeFile(wbx, xlsxPath);
await page.click("nav button[data-nav=students]"); await page.click("#importBtn");
await page.setInputFiles("#impFile", xlsxPath); await page.waitForSelector("#impGo");
ok((await page.inputValue("#impSheet")) === "SL-Going", "tu chon sheet SL-Going");
ok((await page.textContent("#impPreview p")).includes("Đọc được 5 dòng, bỏ qua 1 dòng"), "doc 5 dong, bo qua 1: " + await page.textContent("#impPreview p"));
ok((await page.locator("tr.flagged").count()) === 3, "3 dong can kiem (trung, huy+paid, ngay sai): " + await page.locator("tr.flagged").count());
ok((await page.textContent("#impPreview strong")).startsWith("Sẽ nhập 4 gói cho 3 học viên"), "ke hoach nhap: " + await page.textContent("#impPreview strong"));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "/import.png" });
// Kristea ~ Krishtea la cung mot nguoi: chon cung giao vien moi => van tao 2 GV moi vi chua gop; kiem tra goi y hien
ok((await page.textContent("tr[data-teacher=kristea]")).includes("Krishtea") || (await page.textContent("tr[data-teacher=krishtea]")).includes("Kristea"), "goi y ten giao vien gan giong");
await page.click("#impGo"); await page.waitForFunction(() => /Xong\./.test(document.querySelector("dialog .msg")?.textContent || ""));
const sdb = fdb;
const st = (await sdb.doc("students/ES9001").get()).data();
ok(st.fullName === "Le Binh Minh" && st.agencyId === "SMART-ALPHA" && st.status === "Active" && st.meetLink === "https://meet.google.com/aaa-bbbb-ccc" && st.teacherIds.length === 1, "students/ES9001: " + JSON.stringify(st));
const en = (await sdb.collection("enrollments").where("sc", "==", "ES9001").get()).docs.map((d) => d.id).sort();
ok(JSON.stringify(en) === '["ES9001_2026-08-13","ES9001_2026-09-20"]', "2 goi cua ES9001, dong trung bi bo: " + en);
const e1 = (await sdb.doc("enrollments/ES9001_2026-08-13").get()).data();
ok(e1.courseId === "ESL_SP" && e1.minutes === 50 && JSON.stringify(e1.days) === "[1,3]" && e1.startTime === "20:00" && e1.kind === "New" && !("paid" in e1), "enrollment dung, khong chua thong tin thu tien");
ok((await sdb.doc("billing/ES9001_2026-08-13").get()).data().paid === "Paid", "billing tach rieng");
ok((await sdb.doc("enrollments/ES9002_2026-07-01").get()).data().flags.includes("cancelled_paid"), "co 'cancelled_paid' tren goi huy + Paid");
ok((await sdb.doc("agencies/SMART-ALPHA").get()).data().name === "Smart Alpha", "tao agency gop hoa/thuong");
const tnames = (await sdb.collection("teachers").get()).docs.map((d) => d.data().name).sort();
ok(JSON.stringify(tnames) === '["Alden","Krishtea","Kristea","Miles"]' || tnames.includes("Kristea"), "tao giao vien moi, giu Alden (T1): " + tnames);
const before = (await sdb.collection("enrollments").get()).size;
await page.click("dialog button:has-text('Đóng')");
await page.click("#importBtn"); await page.setInputFiles("#impFile", xlsxPath); await page.waitForSelector("#impGo"); await page.click("#impGo");
await page.waitForFunction(() => /Xong\./.test(document.querySelector("dialog .msg")?.textContent || ""));
ok((await sdb.collection("enrollments").get()).size === before && (await sdb.collection("teachers").get()).size === tnames.length, "nhap lai khong tao ban trung");
await page.click("dialog button:has-text('Đóng')");


// 7. Xoa: agency/giao vien/hoc vien, chuyen du lieu sang muc khac, xoa tai khoan
await fdb.doc("agencies/OEC2").set({ name: "OEC trung" }); await fdb.doc("agencies/KEEP").set({ name: "Agency giu lai" });
await fdb.doc("teachers/TX").set({ name: "Test X" }); await fdb.doc("users/xuid").set({ role: "teacher", teacherId: "TX", username: "tx", displayName: "Test X" });
await fdb.doc("schedule/TX").set({ teacherId: "TX", cells: { "0_0600": { t: "Ai Do" } } });
const delRow = async (nav, id) => { await page.click(`nav button[data-nav=${nav}]`); await page.waitForSelector(`[data-del="${id}"]`); await page.click(`[data-del="${id}"]`); await page.waitForSelector("#delGo"); };
await delRow("agencies", "OEC2"); ok(!(await page.locator("#delTarget").count()), "agency khong dung thi khong can chuyen");
await page.click("#delGo"); ok((await page.textContent("dialog .msg")).includes("xác nhận"), "bat buoc tich xac nhan"); await page.check("#delOk"); await page.click("#delGo");
await page.waitForSelector("dialog[open]", { state: "hidden" }); ok(!(await fdb.doc("agencies/OEC2").get()).exists, "xoa agency khong dung");
await delRow("agencies", "OEC"); ok((await page.textContent("#delGo")) === "Xóa" && (await page.textContent("dialog")).includes("1 học viên"), "agency dang dung bao so luong");
await page.check("#delOk"); await page.click("#delGo"); ok((await page.textContent("dialog .msg")).includes("chọn"), "bat buoc chon muc chuyen sang");
await page.selectOption("#delTarget", "KEEP"); await page.click("#delGo"); await page.waitForSelector("dialog[open]", { state: "hidden" });
ok(!(await fdb.doc("agencies/OEC").get()).exists && (await fdb.doc("students/ES112").get()).data().agencyId === "KEEP", "xoa agency + chuyen hoc vien sang KEEP");
apiBody = null;
await delRow("teachers", "TX"); ok((await page.textContent("dialog")).includes("1 ô trên lưới lịch"), "giao vien chi co lich thi khong bat buoc chuyen");
await page.check("#delOk"); await page.click("#delGo"); await page.waitForSelector("dialog[open]", { state: "hidden" });
ok(!(await fdb.doc("teachers/TX").get()).exists && !(await fdb.doc("schedule/TX").get()).exists, "xoa giao vien + lich cua giao vien");
ok(apiBody?.url.endsWith("/api/users/delete") && apiBody.body.uid === "xuid", "goi Worker xoa tai khoan: " + JSON.stringify(apiBody));
await delRow("students", "ES9002"); ok((await page.textContent("dialog")).includes("1 gói học"), "hoc vien bao so goi bi xoa theo");
await page.check("#delOk"); await page.click("#delGo"); await page.waitForSelector("dialog[open]", { state: "hidden" });
ok(!(await fdb.doc("students/ES9002").get()).exists && !(await fdb.doc("enrollments/ES9002_2026-07-01").get()).exists && !(await fdb.doc("billing/ES9002_2026-07-01").get()).exists, "xoa hoc vien + goi + thu tien");
await delRow("teachers", "T1"); ok((await page.textContent("#delGo")) === "Xóa" && (await page.textContent("dialog")).includes("gói học"), "giao vien dang day phai chuyen");
await page.check("#delOk"); await page.selectOption("#delTarget", "T2"); await page.click("#delGo"); await page.waitForSelector("dialog[open]", { state: "hidden" });
const st112 = (await fdb.doc("students/ES112").get()).data(), mv = (await fdb.doc("schedule/T2").get()).data();
ok(JSON.stringify(st112.teacherIds) === '["T2"]' && (await fdb.doc("enrollments/e1").get()).data().teacherId === "T2" && mv.cells["1_0730"].t === "Pham Thanh Thuy B" && mv.cells["1_0700"].t === "pham thanh thuy b" && !(await fdb.doc("schedule/T1").get()).exists, "xoa giao vien chuyen goi, hoc vien, lich sang GV khac");

// 8. Nhap lich tu file Excel
const T = (h, m = 0) => (h * 60 + m) / 1440;
const skd = [["", "Miles"], ["VN Time", "PH Time", "Monday", "Tuesday"], [T(8), T(9), "Ho Linh San", ""], [T(8, 30), T(9, 30), "Ho Linh San", "Quoc Tri"],
  ["", "Sir NEWBIE "], ["VN Time", "Phil time", "Monday"], [T(20), T(21), "Thanh Danh"]];
const wbs = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wbs, XLSX.utils.aoa_to_sheet(skd), "ClassSKD");
const skdPath = path.join(os.tmpdir(), "classskd-test.xlsx"); XLSX.writeFile(wbs, skdPath);
await page.click("nav button[data-nav=schedule]"); await page.waitForSelector("#skdImportBtn", { timeout: 8000 }).catch(async () => { console.log("SKD FAIL errors:", errors.join(" | "), "| main:", (await page.innerHTML("main")).slice(0, 400)); process.exit(2); }); await page.click("#skdImportBtn");
await page.setInputFiles("#skdFile", skdPath); await page.waitForSelector("#skdGo");
ok((await page.locator("tr[data-block=miles] select").inputValue()) === "T2" && (await page.locator("tr[data-block=newbie] select").inputValue()) === "__new__", "khop giao vien Miles->T2, Newbie tao moi");
await page.click("#skdGo"); await page.waitForFunction(() => /Xong\./.test(document.querySelector("dialog .msg")?.textContent || ""));
const m2 = (await fdb.doc("schedule/T2").get()).data().cells;
ok(JSON.stringify(Object.keys(m2).sort()) === '["0_0800","0_0830","1_0830"]' && m2["0_0800"].t === "Ho Linh San", "ghi de lich T2 theo file: " + Object.keys(m2));
const nb = (await fdb.collection("teachers").where("name", "==", "Newbie").get()).docs[0];
ok(nb && (await fdb.doc(`schedule/${nb.id}`).get()).data().cells["0_2000"].t === "Thanh Danh", "tao giao vien moi va lich");
await page.click("dialog button:has-text('Đóng')");


// 9. Nhap bao cao cu (JSON xuat tu Apps Script)
const mkRep = (student, over = {}) => ({ fileId: "f1", fileName: `ESL Speaking Report_${student}_T.Miles`, path: "Miles", url: "https://drive.google.com/file/x", student, teacher: "MILES", course: "ESL Speaking", meetLink: "https://meet.google.com/new-link", book: "", warnings: [],
  scoreTable: [{ remark: "Entrance", date: "2026-11-01", scores: { Speaking: 10, Listening: 9, Pronunciation: 8, Vocabulary: 10, Grammar: 8 }, level: "A2" }],
  attendance: [{ no: 1, date: "2026-11-03", status: "Present" }, { no: 2, date: "2026-11-05", status: "Cancelled" }, { no: 3, date: "2026-11-07", status: "Absent" }],
  rcs: [{ rc: 1, evaluation: null, sessions: [{ date: "2026-11-03", status: "Present", teacher: "Miles", progress: "BOOK 1", academic: "<b>UNIT 1</b>", participation: "tot" }, { date: "2026-11-06", status: "Absent", teacher: "Miles", progress: "BOOK 1", academic: "", participation: "" }] }], ...over });
const exportJson = { exportedAt: "2026-11-27T00:00:00Z", total: 3, reports: [mkRep("Pham Thanh Thuy B"), mkRep("Nguoi La Khong Co")], errors: [{ fileName: "hong.xlsx", path: "Miles", error: "Exception: boom" }] };
const repPath = path.join(os.tmpdir(), "lms_reports_export.json"); fs.writeFileSync(repPath, JSON.stringify(exportJson));
await page.click("nav button[data-nav=reports]"); await page.waitForSelector("#repFile"); await page.setInputFiles("#repFile", repPath); await page.waitForSelector("#repGo");
ok((await page.locator("tbody tr[data-i]").count()) === 2 && (await page.locator("tr[data-i='0'] select").inputValue()) === "ES112" && (await page.locator("tr[data-i='1'] select").inputValue()) === "", "ghep tu dong hoc vien theo ten, ban kia chua ghep");
ok((await page.textContent("main")).includes("Sẽ nhập 1 học viên: 3 buổi học, 1 đánh giá"), "ke hoach nhap bao cao: " + (await page.textContent("main")).match(/Sẽ nhập[^.]*\./)?.[0]);
ok((await page.locator("tr[data-tk=miles] select").inputValue()) === "T2", "giao vien MILES khop T2");
ok((await page.locator("details li").first().textContent()).includes("boom"), "hien danh sach file loi");
await page.click("#repGo"); await page.waitForFunction(() => /Xong\./.test(document.querySelector("main .msg")?.textContent || ""));
const ses = (await fdb.collection("sessions").where("scs", "array-contains", "ES112").get()).docs.map((d) => [d.id, d.data()]).sort();
ok(ses.map((x) => x[0]).join() === "ES112_2026-11-03,ES112_2026-11-05,ES112_2026-11-07", "3 buoi (Cancelled giu lai, Absent ghep theo thu tu): " + ses.map((x) => x[0]));
const s3 = Object.fromEntries(ses);
ok(s3["ES112_2026-11-03"].lesson === "<b>UNIT 1</b>" && s3["ES112_2026-11-03"].rcNo === 1 && s3["ES112_2026-11-05"].rcNo === null && s3["ES112_2026-11-07"].rcSeq === 2 && s3["ES112_2026-11-07"].teacherId === "T2" && s3["ES112_2026-11-07"].flags.includes("date_differs"), "noi dung, RC, co lech ngay: " + JSON.stringify(s3["ES112_2026-11-07"]));
ok((await fdb.doc("evaluations/ES112_0").get()).data().status === "Approved" && (await fdb.doc("students/ES112").get()).data().legacyReportUrl === "https://drive.google.com/file/x", "ghi danh gia + lien ket bao cao cu");
await fdb.doc("sessions/ES112_2026-11-03").update({ topic: "GIAO VIEN SUA" });
await page.click("nav button[data-nav=reports]"); await page.setInputFiles("#repFile", repPath); await page.waitForSelector("#repGo"); await page.click("#repGo");
await page.waitForFunction(() => /bỏ qua/.test(document.querySelector("main .msg")?.textContent || ""));
ok((await fdb.doc("sessions/ES112_2026-11-03").get()).data().topic === "GIAO VIEN SUA", "nhap lai khong ghi de du lieu da sua");
await page.click("nav button[data-nav=reports]"); ok((await page.locator("img").count()) === 0, "khong chen HTML tu du lieu bao cao");


// 10. Tao buoi hoc tu luoi lich (admin) va giao vien diem danh + nhap bao cao
await fdb.doc("schedule/T2").set({ teacherId: "T2", cells: { "0_0800": { t: "Pham Thanh Thuy B" }, "0_0830": { t: "Pham Thanh Thuy B" }, "2_1000": { t: "Khong Co Ten Nay" } } });
await page.click("nav button[data-nav=schedule]"); await page.waitForSelector("#genBtn"); await page.click("#genBtn"); await page.waitForSelector("#genPreview");
await page.fill("#genFrom", "2026-11-23"); await page.fill("#genTo", "2026-11-29"); await page.click("#genPreview"); await page.waitForSelector("#genGo");
ok((await page.textContent("dialog")).includes("Sẽ tạo 1 buổi học") && (await page.textContent("dialog")).includes("Khong Co Ten Nay"), "xem truoc: 1 buoi + ten chua khop: " + (await page.textContent("dialog")).slice(0, 300));
await page.click("#genGo"); await page.waitForFunction(() => /Xong\./.test(document.querySelector("dialog .msg")?.textContent || ""));
const gen = (await fdb.doc("sessions/ES112_2026-11-23").get()).data();
ok(gen.time === "08:00" && gen.minutes === 50 && gen.teacherId === "T2" && JSON.stringify(gen.scs) === '["ES112"]' && gen.source === "schedule", "tao buoi tu luoi: " + JSON.stringify(gen));
await page.click("#genPreview"); await page.waitForSelector("#genGo", { state: "attached" }).catch(() => {});
ok((await page.textContent("dialog")).includes("bỏ qua 1 buổi đã có"), "chay lai khong tao trung");
await page.click("dialog button:has-text('Đóng')");

await page.click("nav button[data-nav=materials]"); await page.waitForSelector("#add"); await page.click("#add");
await page.fill("form input >> nth=0", "M1"); await page.fill("form input >> nth=1", "Unit 1 slides"); await page.fill("form input >> nth=2", "javascript:alert(1)"); await page.click("form button[type=submit]");
ok((await page.textContent("dialog")).includes("https://"), "tai lieu: link khong phai https bi tu choi");
await page.fill("form input >> nth=2", "https://example.com/unit1"); await page.check("form input[type=checkbox]"); await page.click("form button[type=submit]");
await page.waitForSelector("tr[data-id=M1]"); ok((await fdb.doc("materials/M1").get()).data().forStudents === true, "admin them tai lieu cho hoc vien xem");
await fdb.doc("materials/M2").set({ title: "Chi giao vien", url: "https://example.com/t", forStudents: false });
await fdb.doc("notices/N1").set({ title: "Chao tat ca", content: "x", target: "all", active: true, createdAt: 1 }); await fdb.doc("notices/N2").set({ title: "Cho giao vien", content: "x", target: "teacher", active: true, createdAt: 2 });
await fdb.doc("notices/N3").set({ title: "Chi hoc vien", content: "x", target: "student", active: true, createdAt: 3 }); await fdb.doc("notices/N4").set({ title: "Da an", content: "x", target: "all", active: false, createdAt: 4 });
// giao vien dang nhap trong trinh duyet rieng
const tUser = await getAuth().createUser({ email: "t2@lms.edusphere.vn", password: "gv-mat-khau-1", displayName: "Miles" });
await getAuth().setCustomUserClaims(tUser.uid, { role: "teacher", teacherId: "T2" });
await fdb.doc(`users/${tUser.uid}`).set({ username: "t2", displayName: "Miles", role: "teacher", teacherId: "T2", mustChangePassword: false });
const ctx2 = await browser.newContext(); const tp = await ctx2.newPage(); const terrors = []; tp.on("pageerror", (e) => terrors.push(e.message));
await ctx2.route(/gstatic\.com\/firebasejs\/11\.0\.2\/firebase-(app|auth|firestore)\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: `export * from "http://localhost:5173/__fb/all.js";` }));
await tp.goto("http://localhost:5173/index.html"); await tp.fill("#username", "t2"); await tp.fill("#password", "gv-mat-khau-1"); await tp.click("#loginForm button");
await tp.waitForURL("**/app.html**"); await tp.goto("http://localhost:5173/app.html?week=2026-11-23"); await tp.waitForSelector(".srow", { timeout: 8000 }).catch(async () => { console.log("TEACHER FAIL:", await tp.textContent("main"), terrors.join(" | ")); process.exit(2); });
ok((await tp.textContent("#weekLabel")).startsWith("23/11") && (await tp.textContent(".srow")).includes("Pham Thanh Thuy B") && (await tp.textContent(".srow")).includes("08:00-08:50"), "giao vien thay buoi cua minh: " + await tp.textContent("main"));
ok((await tp.locator(".srow").count()) === 1, "chi thay buoi cua minh trong tuan");
await shot(tp, "teacher-report"); await tp.click("[data-tab=dashboard]"); await tp.waitForSelector("#studentCards"); await shot(tp, "teacher-dashboard");
ok((await tp.locator("#tStats .stat-card").count()) === 5 && (await tp.textContent("#studentCards")).includes("Pham Thanh Thuy B") && (await tp.locator("#studentCards .scard").count()) >= 1, "giao vien thay tong quan va the hoc vien");
await tp.click("[data-tab=payroll]"); await tp.waitForSelector("#payHint"); await shot(tp, "teacher-payroll");
ok((await tp.locator("#payStats .stat-card").count()) === 5, "tab Tinh luong co the so lieu"); ok((await tp.locator("tr[data-id]").count()) >= 0, "tab Tinh luong co bang");
await tp.click("[data-tab=schedule]"); await tp.waitForSelector("#gridView td.cell"); await shot(tp, "teacher-grid");
ok((await tp.textContent("#gridView")).includes("Pham Thanh Thuy B") && (await tp.locator("#gridView input, #gridView textarea").count()) === 0 && (await tp.locator("#gridView td.cell.esl").count()) >= 1, "giao vien thay luoi lich chi xem (khong o nhap)");
await tp.click("[data-tab=notices]"); await tp.waitForSelector("#noticesList");
ok((await tp.textContent("#noticesList")).includes("Chao tat ca") && (await tp.textContent("#noticesList")).includes("Cho giao vien") && !(await tp.textContent("#noticesList")).includes("Chi hoc vien") && !(await tp.textContent("#noticesList")).includes("Da an"), "giao vien chi thay thong bao danh cho minh: " + await tp.textContent("#noticesList"));
await shot(tp, "teacher-schedule"); await tp.click("[data-tab=materials]"); await tp.waitForSelector("#teacherMaterials"); 
ok((await tp.textContent("#teacherMaterials")).includes("Unit 1 slides") && (await tp.textContent("#teacherMaterials")).includes("Chi giao vien"), "giao vien thay thu vien tai lieu");
await tp.click("[data-tab=report]"); await tp.waitForSelector(".srow");
await tp.fill("#tSearch", "zzzz"); ok((await tp.locator(".srow").count()) === 0, "giao vien loc theo hoc vien"); await tp.fill("#tSearch", "");
ok((await tp.locator(".srow").count()) === 1, "xoa loc hien lai buoi");
await tp.selectOption("#tStatus", "done"); ok((await tp.locator(".srow").count()) === 0, "loc da bao cao: chua co buoi nao"); await tp.selectOption("#tStatus", "");
// mo ho so lop tu lich day, kiem tra thong tin, roi bao cao trong ho so
await tp.click("[data-tab=schedule]"); await tp.click("#gridView td.cell.clickable >> nth=0"); await tp.waitForSelector("#dossier[open]");
ok((await tp.textContent("#dossier")).includes("Pham Thanh Thuy B") && (await tp.locator("#dossier [data-dtab=general]").count()) === 1, "bam ten tren lich mo ho so lop (General)"); await shot(tp, "teacher-dossier"); await tp.click("#dossier button:has-text('Đóng')");
await tp.click("[data-tab=report]"); await tp.click(".srow button:has-text('Báo cáo')"); await tp.waitForSelector("#dossier article.session[data-id=ES112_2026-11-23]");
await tp.selectOption("#dossier article.session[data-id=ES112_2026-11-23] select", "Present"); await tp.fill("#dossier article.session[data-id=ES112_2026-11-23] textarea[data-f=topic]", "OXFORD 1"); await tp.fill("#dossier article.session[data-id=ES112_2026-11-23] textarea[data-f=lesson]", "<i>Unit 1</i>"); await tp.fill("#dossier article.session[data-id=ES112_2026-11-23] textarea[data-f=feedback]", "Tot");
await tp.click("#dossier article.session[data-id=ES112_2026-11-23] button.p"); await tp.waitForSelector("#dossier article.session[data-id=ES112_2026-11-23].done");
const rep = (await fdb.doc("sessions/ES112_2026-11-23").get()).data();
ok(rep.attendance.ES112 === "Present" && rep.topic === "OXFORD 1" && rep.lesson === "<i>Unit 1</i>" && rep.feedback === "Tot" && rep.reportedAt > 0 && rep.teacherId === "T2", "giao vien diem danh va luu bao cao");
ok((await tp.locator("#dossier i").count()) === 0, "khong chen HTML trong ho so lop"); await tp.click("#dossier button:has-text('Đóng')"); ok((await tp.textContent("#weekCount")).includes("đã báo cáo 1"), "dem da bao cao");
await tp.goto("http://localhost:5173/app.html?week=2026-09-07"); await tp.waitForSelector(".empty");
ok(terrors.length === 0, "trang giao vien khong loi JS: " + terrors.join(" | "));
await ctx2.close();

// hoc vien dang nhap va xem bao cao cua minh
const sUser = await getAuth().createUser({ email: "es112@lms.edusphere.vn", password: "hv-mat-khau-1", displayName: "Hoc Vien" });
await getAuth().setCustomUserClaims(sUser.uid, { role: "student", sc: "ES112" });
await fdb.doc(`users/${sUser.uid}`).set({ username: "es112", displayName: "Hoc Vien", role: "student", sc: "ES112", mustChangePassword: false });
const ctx3 = await browser.newContext(); const sp = await ctx3.newPage(); const serrors = []; sp.on("pageerror", (e) => serrors.push(e.message));
await ctx3.route(/gstatic\.com\/firebasejs\/11\.0\.2\/firebase-(app|auth|firestore)\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: `export * from "http://localhost:5173/__fb/all.js";` }));
await sp.goto("http://localhost:5173/index.html"); await sp.fill("#username", "es112"); await sp.fill("#password", "hv-mat-khau-1"); await sp.click("#loginForm button");
await sp.waitForURL("**/app.html**"); await sp.waitForSelector("section.report", { timeout: 8000 }).catch(async () => { console.log("STUDENT FAIL:", await sp.textContent("main"), serrors.join(" | ")); process.exit(2); });
ok((await sp.textContent("section.report")).includes("ES112") && (await sp.textContent("section.report")).includes("buổi"), "hoc vien xem duoc bao cao cua minh");
await shot(sp, "student-schedule"); await sp.click("[data-tab=reports]"); await sp.waitForSelector("#reportsCard"); await shot(sp, "student-reports"); await sp.click("[data-tab=materials]"); await sp.waitForSelector("#materials");
ok((await sp.textContent("#materials")).includes("Unit 1 slides") && !(await sp.textContent("#materials")).includes("Chi giao vien"), "hoc vien chi thay tai lieu duoc phep: " + await sp.textContent("main"));
await sp.click("[data-tab=notices]"); await sp.waitForSelector("#noticesList");
ok((await sp.textContent("#noticesList")).includes("Chao tat ca") && (await sp.textContent("#noticesList")).includes("Chi hoc vien") && !(await sp.textContent("#noticesList")).includes("Cho giao vien"), "hoc vien thay thong bao danh cho minh");
ok(serrors.length === 0, "trang hoc vien khong loi JS: " + serrors.join(" | "));
await ctx3.close();

await page.click("nav button[data-nav=students]"); await page.waitForSelector("#tblSearch");
const nAll = await page.locator("tbody tr[data-id]").count(); await page.fill("#tblSearch", "zzzz-khong-co");
ok(nAll >= 1 && (await page.locator("tbody tr[data-id]").count()) === 0 && (await page.textContent("#tblCount")).includes("Hiện 0/"), "tab Hoc vien: o tim kiem loc duoc");
await page.fill("#tblSearch", ""); ok((await page.locator("tbody tr[data-id]").count()) === nAll, "xoa o tim kiem hien lai du lieu");
await page.click("nav button[data-nav=sessions]"); await page.waitForSelector("#seLoad"); await page.fill("#seFrom", "2026-11-23"); await page.fill("#seTo", "2026-11-29"); await page.click("#seLoad");

await page.waitForSelector("tr[data-session]", { timeout: 8000 });
ok((await page.locator("tr[data-session]").count()) >= 1, "tab Buoi hoc liet ke buoi trong tuan");
await page.selectOption("#seTeacher", "T2"); ok((await page.locator("tr[data-session]").count()) >= 1, "loc theo giao vien T2 con buoi cua T2");
await page.fill("#seStudent", "zzzz"); ok((await page.locator("tr[data-session]").count()) === 0, "loc theo ten hoc vien");
await shot(page, "admin-sessions"); await page.click("nav button[data-nav=dashboard]"); await page.waitForSelector("#dashStats"); await shot(page, "admin-dashboard"); await page.click("nav button[data-nav=payroll]"); await page.waitForSelector("#payMonth"); await page.fill("#payMonth", "2026-11"); await page.click("#payGo");
await page.waitForSelector("tr[data-teacher=T2]", { timeout: 8000 });
ok((await page.textContent("main")).includes("Tổng") && (await page.locator("#payCsv").count()) === 1, "tab Luong tinh duoc luong thang 11: " + (await page.textContent("main")).slice(0, 200));
await page.click("nav button[data-nav=schedule]"); await page.waitForSelector("#rcBtn"); await page.click("#rcBtn"); await page.waitForSelector("#rcApply");
ok((await page.textContent("dialog")).includes("Buổi hủy chưa học bù"), "hop thoai RC va hoc bu mo duoc");
await page.click("#rcApply"); await page.waitForFunction(() => document.querySelector("dialog .msg")?.textContent.includes("Xong"), null, { timeout: 8000 });
ok((await fdb.doc("sessions/ES112_2026-11-23").get()).data().rcNo === 1, "cap nhat so RC ghi vao buoi hoc");
await page.click("dialog button.s:has-text('Đóng')");
ok(errors.filter((e) => !/emulator|Failed to load resource/i.test(e)).length === 0, "khong co loi JS: " + errors.join(" | "));
console.log("pass", pass);
await browser.close(); server.close();
