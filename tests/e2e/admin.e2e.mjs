// E2E tren trinh duyet: dang nhap, doi mat khau, trang admin. Chay: npm run test:e2e (can Java + Chromium cho Playwright).
// Bundle Firebase SDK duoc dung thay cho CDN gstatic (route trong Playwright) de chay offline.
import http from "http"; import fs from "fs"; import path from "path";
import { chromium } from "playwright";
import { initializeApp } from "firebase-admin/app"; import { getAuth } from "firebase-admin/auth"; import { getFirestore } from "firebase-admin/firestore";

const ROOT = new URL("../../public", import.meta.url).pathname, FB = new URL("./.cache/all.js", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname === "/__fb/all.js" ? FB : path.join(ROOT, u.pathname === "/" ? "index.html" : u.pathname);
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { "content-type": types[path.extname(p)] || "text/plain", "access-control-allow-origin": "*" }); res.end(d); } });
}).listen(5173);

initializeApp({ projectId: "esvn-lms" });
const user = await getAuth().createUser({ email: "peter@lms.edusphere.vn", password: "tam-12345", displayName: "Peter" });
await getAuth().setCustomUserClaims(user.uid, { role: "admin" });
await getFirestore().doc(`users/${user.uid}`).set({ username: "peter", displayName: "Peter", role: "admin", mustChangePassword: true });

const browser = await chromium.launch(); const page = await browser.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.route(/gstatic\.com\/firebasejs\/11\.0\.2\/firebase-(app|auth|firestore)\.js/, (r) => r.fulfill({ contentType: "text/javascript", body: `export * from "http://localhost:5173/__fb/all.js";` }));
let apiBody = null;
await page.route("https://edusphere-lms-api.eduspherevn.workers.dev/**", async (r) => { apiBody = { url: r.request().url(), auth: r.request().headers().authorization, body: JSON.parse(r.request().postData()) }; await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ uid: "x", username: "alden" }) }); });
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
const add = async (nav, vals) => { await page.click(`nav button:has-text('${nav}')`); await page.click("#add"); await page.waitForSelector("dialog[open]", {timeout:5000}).catch(async()=>{ console.log("DIALOG NOT OPEN. errors:", errors.join(" | ")); console.log((await page.content()).slice(0,1500)); process.exit(2); });
  for (const [i, v] of vals) await page.locator("dialog input:not([type=checkbox]), dialog select").nth(i).fill(v, {timeout:4000});
  await page.click("dialog button[type=submit]"); await page.waitForSelector("dialog[open]", { state: "hidden" }); };
await add("Agency", [[0, "OEC"], [1, "OEC Education"]]);
await add("Giáo viên", [[0, "T1"], [1, "Alden"], [3, "100"], [4, "200"]]);
await page.click("nav button:has-text('Học viên')"); await page.click("#add");
ok((await page.locator("dialog select option").allTextContents()).some((t) => t.includes("OEC Education")), "dropdown agency co du lieu");
await page.locator("dialog input").nth(0).fill("ES112"); await page.locator("dialog input").nth(1).fill("Pham Thanh Thuy");
await page.locator("dialog select").first().selectOption("OEC"); await page.locator("dialog input[type=checkbox]").check();
await page.locator("dialog input:not([type=checkbox])").nth(3).fill("T1");   // o teacherIds
await page.click("dialog button[type=submit]"); await page.waitForSelector("dialog[open]", { state: "hidden" });
await page.waitForSelector("tr[data-id=ES112]");
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
await page.click("nav button:has-text('Giáo viên')");
await page.click("tr[data-id=T1] button:has-text('Tạo tài khoản')");
await page.fill("dialog input >> nth=0", "alden"); await page.click("dialog button[type=submit]");
await page.waitForSelector("dialog .msg.ok");
ok(apiBody?.url.endsWith("/api/users/create") && apiBody.auth?.startsWith("Bearer ") && apiBody.body.role === "teacher" && apiBody.body.teacherId === "T1" && apiBody.body.username === "alden" && apiBody.body.password.length >= 8, "goi Worker dung: " + JSON.stringify(apiBody?.body));

ok(errors.filter((e) => !/emulator|Failed to load resource/i.test(e)).length === 0, "khong co loi JS: " + errors.join(" | "));
console.log("pass", pass);
await browser.close(); server.close();
