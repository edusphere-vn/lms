// Cloudflare Worker: cac viec dac quyen cua Edusphere LMS.
//   POST /api/users/create  { username, password, role, displayName?, teacherId?, sc?, agencyId? }
//   POST /api/users/reset   { uid, password }
//   POST /api/sessions/recompute-rc { sessionId }   (admin hoac giao vien cua buoi do: tinh lai so RC cua cac hoc vien trong buoi)
//   POST /api/users/delete  { uid }   (xoa tai khoan dang nhap va users/{uid}; khong cho admin tu xoa minh)
// Chi admin (ID token Firebase co claim role=admin) duoc goi.
// Bien moi truong: PROJECT_ID, ALLOWED_ORIGINS, secret FIREBASE_SERVICE_ACCOUNT (JSON).

import { recomputeRc } from "./rc-core.js";

const ROLES = ["admin", "teacher", "student", "agency"];
const AUTH_DOMAIN = "lms.edusphere.vn";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const b64uToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64uToJson = (s) => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));
const bytesToB64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const strToB64u = (s) => bytesToB64u(new TextEncoder().encode(s));

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ---- Xac minh ID token cua Firebase (RS256, khoa cong khai cua Google) ----
let jwksCache = { at: 0, keys: null };
async function getJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new HttpError(502, "Không lấy được khóa xác thực");
  jwksCache = { at: Date.now(), keys: (await res.json()).keys };
  return jwksCache.keys;
}

export async function verifyIdToken(token, projectId) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) throw new HttpError(401, "Token không hợp lệ");
  const header = b64uToJson(parts[0]), claims = b64uToJson(parts[1]);
  if (header.alg !== "RS256") throw new HttpError(401, "Token không hợp lệ");
  const jwk = (await getJwks()).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, "Token không hợp lệ");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`
      || !claims.sub || claims.exp < now || claims.iat > now + 300) throw new HttpError(401, "Token không hợp lệ hoặc hết hạn");
  return claims;
}

// ---- Access token cua service account (OAuth2 JWT bearer) ----
let accessCache = { at: 0, token: null };
async function getAccessToken(env) {
  if (accessCache.token && Date.now() - accessCache.at < 3000_000) return accessCache.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = strToB64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = strToB64u(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore",
  }));
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", b64uToBytes(pem.replace(/\+/g, "-").replace(/\//g, "_")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${bytesToB64u(sig)}` }),
  });
  if (!res.ok) throw new HttpError(502, "Không lấy được quyền service account");
  accessCache = { at: Date.now(), token: (await res.json()).access_token };
  return accessCache.token;
}

async function google(env, url, method, payload) {
  const res = await fetch(url, {
    method, headers: { authorization: `Bearer ${await getAccessToken(env)}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 400 ? 400 : 502, data?.error?.message || "Lỗi Google API");
  return data;
}

// ---- Firestore REST: ghi users/{uid} ----
const fsValue = (v) => typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) };
async function writeUserDoc(env, uid, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const doc = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fsValue(v)])) };
  await google(env, `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/users/${uid}?${mask}`, "PATCH", doc);
}

// ---- Cac thao tac ----
const IDP = (env) => `https://identitytoolkit.googleapis.com/v1/projects/${env.PROJECT_ID}`;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

async function createUser(env, b) {
  const username = String(b.username || "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "Tên đăng nhập 3-32 ký tự: chữ thường không dấu, số, . _ -");
  if (!ROLES.includes(b.role)) throw new HttpError(400, "Vai trò không hợp lệ");
  if (String(b.password || "").length < 8) throw new HttpError(400, "Mật khẩu tạm cần ít nhất 8 ký tự");
  const claims = { role: b.role };
  if (b.role === "teacher") { if (!b.teacherId) throw new HttpError(400, "Thiếu teacherId"); claims.teacherId = String(b.teacherId); }
  if (b.role === "student") { if (!b.sc) throw new HttpError(400, "Thiếu mã học viên (sc)"); claims.sc = String(b.sc); }
  if (b.role === "agency")  { if (!b.agencyId) throw new HttpError(400, "Thiếu agencyId"); claims.agencyId = String(b.agencyId); }
  const created = await google(env, `${IDP(env)}/accounts`, "POST", {
    email: `${username}@${AUTH_DOMAIN}`, password: b.password, displayName: b.displayName || username,
    emailVerified: true, customAttributes: JSON.stringify(claims),
  });
  await writeUserDoc(env, created.localId, { username, displayName: b.displayName || username, mustChangePassword: true, ...claims });
  return { uid: created.localId, username };
}

async function resetPassword(env, b) {
  if (!b.uid) throw new HttpError(400, "Thiếu uid");
  if (String(b.password || "").length < 8) throw new HttpError(400, "Mật khẩu tạm cần ít nhất 8 ký tự");
  // Gan lai quyen (claims) tu ho so users/{uid}, de tai khoan thieu claim duoc sua khi dat lai mat khau.
  const prof = await google(env, `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/users/${b.uid}`, "GET").catch(() => null);
  const f = Object.fromEntries(Object.entries(prof?.fields || {}).map(([k, v]) => [k, v.stringValue]));
  const update = { localId: b.uid, password: b.password };
  if (ROLES.includes(f.role)) {
    const claims = { role: f.role };
    for (const k of ["teacherId", "sc", "agencyId"]) if (f[k]) claims[k] = f[k];
    update.customAttributes = JSON.stringify(claims);
  }
  await google(env, `${IDP(env)}/accounts:update`, "POST", update);
  await writeUserDoc(env, b.uid, { mustChangePassword: true });
  return { uid: b.uid };
}

async function deleteUser(env, b, claims) {
  const uid = String(b.uid || "");
  if (!/^[A-Za-z0-9]{6,128}$/.test(uid)) throw new HttpError(400, "uid không hợp lệ");
  if (uid === claims.sub) throw new HttpError(400, "Không thể tự xóa tài khoản của chính mình");
  try { await google(env, `${IDP(env)}/accounts:delete`, "POST", { localId: uid }); }
  catch (e) { if (!/USER_NOT_FOUND/.test(e.message)) throw e; }   // da xoa roi thi coi nhu xong
  await google(env, `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/users/${uid}`, "DELETE");
  return { uid };
}


// ---- Tinh lai so RC sau khi giao vien luu diem danh (giao vien khong doc duoc buoi cua giao vien khac) ----
const FS = (env) => `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents`;
const fromFs = (v) => !v ? null : "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue
  : "arrayValue" in v ? (v.arrayValue.values || []).map(fromFs) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)])) : null;
const toFs = (v) => v == null ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "string" ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(toFs) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
const decodeDoc = (d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])) });

async function recomputeRcRoute(env, b, claims) {
  const id = String(b.sessionId || "");
  if (!/^[A-Za-z0-9_.-]{3,128}$/.test(id)) throw new HttpError(400, "sessionId không hợp lệ");
  const cur = decodeDoc(await google(env, `${FS(env)}/sessions/${id}`, "GET"));
  if (claims.role === "teacher" && (!claims.teacherId || cur.teacherId !== claims.teacherId)) throw new HttpError(403, "Không phải buổi học của bạn");
  const scs = (cur.scs || []).filter((x) => typeof x === "string"), all = new Map();
  for (const sc of scs) {
    const rows = await google(env, `${FS(env)}:runQuery`, "POST", { structuredQuery: { from: [{ collectionId: "sessions" }], where: { fieldFilter: { field: { fieldPath: "scs" }, op: "ARRAY_CONTAINS", value: { stringValue: sc } } } } });
    for (const r of rows) if (r.document) { const d = decodeDoc(r.document); all.set(d.id, d); }
  }
  const { updates } = recomputeRc([...all.values()], new Set(scs));
  for (const u of updates) {
    const mask = ["rc", "rcNo", "rcSeq"].map((k) => `updateMask.fieldPaths=${k}`).join("&");
    await google(env, `${FS(env)}/sessions/${u.id}?${mask}`, "PATCH", { fields: Object.fromEntries(Object.entries(u.data).map(([k, v]) => [k, toFs(v)])) });
  }
  const me = updates.find((u) => u.id === id)?.data || { rc: cur.rc || {}, rcNo: cur.rcNo ?? null, rcSeq: cur.rcSeq ?? null };
  return { updated: updates.length, rc: me.rc, rcNo: me.rcNo, rcSeq: me.rcSeq };
}

const ROUTES = { "/api/users/create": createUser, "/api/users/reset": resetPassword, "/api/users/delete": deleteUser, "/api/sessions/recompute-rc": recomputeRcRoute };
const TEACHER_OK = new Set(["/api/sessions/recompute-rc"]);   // cac route con lai chi admin

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" }
      : {};
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const path = new URL(request.url).pathname, handler = ROUTES[path];
      if (!handler || request.method !== "POST") throw new HttpError(404, "Không tìm thấy");
      if (!allowed.includes(origin)) throw new HttpError(403, "Origin không được phép");
      const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
      const claims = await verifyIdToken(token, env.PROJECT_ID);
      if (claims.role !== "admin" && !(claims.role === "teacher" && TEACHER_OK.has(path))) throw new HttpError(403, "Chỉ admin được thực hiện");
      return json(200, await handler(env, await request.json(), claims));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      return json(500, { error: "Lỗi máy chủ" });
    }
  },
};
