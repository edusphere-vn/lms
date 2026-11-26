// firebaseConfig la thong tin cong khai cua app web (khong phai bi mat).
// Bao mat that nam o Firestore Rules va Firebase Auth.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCx1I_fvLTpsPQbGroGsg9lipPmIF0ohBQ",
  authDomain: "esvn-lms.firebaseapp.com",
  projectId: "esvn-lms",
  storageBucket: "esvn-lms.firebasestorage.app",
  messagingSenderId: "540105149873",
  appId: "1:540105149873:web:0cc8633d559e16891ec190",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Chay tren localhost thi dung Firebase emulator (kiem thu), tru khi dat sessionStorage.live = "1".
const onLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
if (onLocalhost && sessionStorage.getItem("live") !== "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// Dia chi Cloudflare Worker (worker/). Doi neu ten worker hoac tai khoan Cloudflare khac.
export const API_BASE = "https://edusphere-lms-api.eduspherevn.workers.dev";

// Nguoi dung dang nhap bang ten dang nhap; Firebase Auth can email nen ta
// doi ten thanh email noi bo (khong gui email that den dia chi nay).
export const AUTH_DOMAIN = "lms.edusphere.vn";
export const usernameToEmail = (u) => `${u.trim().toLowerCase()}@${AUTH_DOMAIN}`;
