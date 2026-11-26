// Tao tai khoan admin dau tien (chay 1 lan tren may cua Peter).
// Cach dung:
//   1. Firebase console > Project settings > Service accounts > Generate new private key
//      -> luu file ngoai repo (hoac ten serviceAccount.json, da nam trong .gitignore). KHONG gui file nay cho ai.
//   2. npm i firebase-admin
//   3. node scripts/bootstrap-admin.mjs ./serviceAccount.json peter "Mat-khau-tam-8-ky-tu-tro-len"
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const [keyPath, username, password] = process.argv.slice(2);
if (!keyPath || !username || !password || password.length < 8) {
  console.error("Dung: node scripts/bootstrap-admin.mjs <serviceAccount.json> <ten-dang-nhap> <mat-khau-tam >= 8 ky tu>");
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
const email = `${username.trim().toLowerCase()}@lms.edusphere.vn`;
const auth = getAuth();
let user;
try { user = await auth.getUserByEmail(email); await auth.updateUser(user.uid, { password }); }
catch { user = await auth.createUser({ email, password, displayName: username }); }
await auth.setCustomUserClaims(user.uid, { role: "admin" });
await getFirestore().doc(`users/${user.uid}`).set({
  username, displayName: username, role: "admin", mustChangePassword: true,
}, { merge: true });
console.log(`Da tao admin ${email} (uid ${user.uid}). Dang nhap bang ten "${username}" va doi mat khau ngay.`);
