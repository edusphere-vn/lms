import { auth, db, usernameToEmail } from "./firebase.js";
import {
  signInWithEmailAndPassword, updatePassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of ["login", "change"]) $(s).hidden = s !== id; };
const say = (id, msg) => { $(id).textContent = msg || ""; };

const HOME = { admin: "admin.html", teacher: "app.html#teacher", student: "app.html#student", agency: "app.html#agency" };

async function afterLogin(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (!profile) { await signOut(auth); show("login"); say("loginMsg", "Tài khoản chưa được cấp quyền. Liên hệ admin."); return; }
  if (profile.mustChangePassword) { show("change"); return; }
  location.href = HOME[profile.role] || "app.html";
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); say("loginMsg", "");
  try {
    const cred = await signInWithEmailAndPassword(auth, usernameToEmail($("username").value), $("password").value);
    await afterLogin(cred.user);
  } catch (err) {
    say("loginMsg", "Sai tên đăng nhập hoặc mật khẩu.");
  }
});

$("changeForm").addEventListener("submit", async (e) => {
  e.preventDefault(); say("changeMsg", "");
  const a = $("newPassword").value, b = $("newPassword2").value;
  if (a.length < 8) return say("changeMsg", "Mật khẩu mới cần ít nhất 8 ký tự.");
  if (a !== b) return say("changeMsg", "Hai mật khẩu không khớp.");
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, $("password").value));
    await updatePassword(user, a);
    await updateDoc(doc(db, "users", user.uid), { mustChangePassword: false });
    await afterLogin(user);
  } catch (err) {
    say("changeMsg", "Không đổi được mật khẩu. Đăng nhập lại rồi thử lại.");
  }
});

