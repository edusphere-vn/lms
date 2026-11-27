// Danh sách thông báo dành cho một vai trò (admin tạo ở tab Thông báo).
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
export async function noticesView(db, role, h) {
  const snap = await getDocs(query(collection(db, "notices"), where("active", "==", true), where("target", "in", ["all", role])));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return h("div", { class: "card", id: "noticesList" }, h("h3", {}, "Thông báo"),
    list.length ? list.map((n) => h("div", { class: "noticecard" }, h("h4", {}, n.title || ""), h("p", {}, n.content || ""), h("div", { class: "meta" }, n.createdAt ? new Date(n.createdAt).toLocaleDateString("vi-VN") : ""))) : h("p", { class: "note" }, "Chưa có thông báo nào."));
}
