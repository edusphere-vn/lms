// Kiem thu Worker voi Google API gia lap: node --test worker/test/worker.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import worker from "../src/index.js";

const b64u = (b) => Buffer.from(b).toString("base64url");
const tokenKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const saKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...tokenKeys.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const PID = "esvn-lms";
function idToken(claims = {}, { kid = "k1" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const p = b64u(JSON.stringify({ aud: PID, iss: `https://securetoken.google.com/${PID}`, sub: "admin-uid", iat: now, exp: now + 3600, role: "admin", ...claims }));
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(tokenKeys.privateKey);
  return `${h}.${p}.${b64u(sig)}`;
}
const env = {
  PROJECT_ID: PID, ALLOWED_ORIGINS: "https://lms.edusphere.vn",
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "sa@esvn-lms.iam.gserviceaccount.com", private_key: saKeys.privateKey.export({ type: "pkcs8", format: "pem" }) }),
};
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (url.includes("securetoken@system")) return ok({ keys: [jwk] });
  if (url === "https://oauth2.googleapis.com/token") return ok({ access_token: "ya29.fake" });
  if (url.endsWith("/accounts") ) return ok({ localId: "new-uid" });
  if (url.endsWith("/accounts:update")) return ok({ localId: "x" });
  if (url.endsWith("/accounts:delete")) return JSON.parse(init.body).localId === "gone1234" ? new Response(JSON.stringify({ error: { message: "USER_NOT_FOUND" } }), { status: 400 }) : ok({});
  if (url.includes("/documents/users/")) return ok({});
  return new Response("{}", { status: 404 });
};
const call = (path, body, { token = idToken(), origin = "https://lms.edusphere.vn", method = "POST" } = {}) =>
  worker.fetch(new Request(`https://api.x${path}`, { method, headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json" }, body: JSON.stringify(body) }), env);

test("admin tao giao vien: gan claims + ghi users doc", async () => {
  calls.length = 0;
  const r = await call("/api/users/create", { username: "Alden", password: "tam-12345", role: "teacher", teacherId: "T7", displayName: "Alden" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { uid: "new-uid", username: "alden" });
  const create = calls.find((c) => c.url.endsWith("/accounts"));
  const sent = JSON.parse(create.init.body);
  assert.equal(sent.email, "alden@lms.edusphere.vn");
  assert.deepEqual(JSON.parse(sent.customAttributes), { role: "teacher", teacherId: "T7" });
  assert.equal(create.init.headers.authorization, "Bearer ya29.fake");
  const doc = calls.find((c) => c.url.includes("/documents/users/new-uid"));
  assert.equal(JSON.parse(doc.init.body).fields.mustChangePassword.booleanValue, true);
});
test("reset mat khau bat buoc doi lai", async () => {
  const r = await call("/api/users/reset", { uid: "u9", password: "tam-67890" });
  assert.equal(r.status, 200);
});
test("giao vien khong duoc goi API", async () => { assert.equal((await call("/api/users/create", {}, { token: idToken({ role: "teacher" }) })).status, 403); });
test("khong co token / token gia / het han bi tu choi", async () => {
  assert.equal((await call("/api/users/create", {}, { token: "" })).status, 401);
  const forged = idToken().split(".").slice(0, 2).join(".") + "." + b64u("x".repeat(256));
  assert.equal((await call("/api/users/create", {}, { token: forged })).status, 401);
  assert.equal((await call("/api/users/create", {}, { token: idToken({ exp: 1 }) })).status, 401);
  assert.equal((await call("/api/users/create", {}, { token: idToken({ aud: "other" }) })).status, 401);
});
test("origin la bi chan, preflight tra CORS dung", async () => {
  assert.equal((await call("/api/users/create", {}, { origin: "https://evil.example" })).status, 403);
  const pre = await worker.fetch(new Request("https://api.x/api/users/create", { method: "OPTIONS", headers: { origin: "https://lms.edusphere.vn" } }), env);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "https://lms.edusphere.vn");
});
test("validate dau vao", async () => {
  assert.equal((await call("/api/users/create", { username: "a b", password: "tam-12345", role: "teacher" })).status, 400);
  assert.equal((await call("/api/users/create", { username: "alden", password: "short", role: "teacher", teacherId: "T1" })).status, 400);
  assert.equal((await call("/api/users/create", { username: "alden", password: "tam-12345", role: "student" })).status, 400);
  assert.equal((await call("/api/users/create", { username: "alden", password: "tam-12345", role: "root" })).status, 400);
});
test("xoa tai khoan: xoa Auth + users doc, khong cho tu xoa, chap nhan tai khoan da mat", async () => {
  calls.length = 0;
  assert.equal((await call("/api/users/delete", { uid: "abc123xyz" })).status, 200);
  assert.ok(calls.some((c) => c.url.endsWith("/accounts:delete") && JSON.parse(c.init.body).localId === "abc123xyz"));
  assert.ok(calls.some((c) => c.url.endsWith("/documents/users/abc123xyz") && c.init.method === "DELETE"));
  assert.equal((await call("/api/users/delete", { uid: "adminuid1" }, { token: idToken({ sub: "adminuid1" }) })).status, 400);
  assert.equal((await call("/api/users/delete", { uid: "../x" })).status, 400);
  assert.equal((await call("/api/users/delete", { uid: "gone1234" })).status, 200);
  assert.equal((await call("/api/users/delete", { uid: "abc123xyz" }, { token: idToken({ role: "teacher" }) })).status, 403);
});
