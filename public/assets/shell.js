// Khung giao diện cho giáo viên, học viên, agency: thanh điều hướng trên cùng, mỗi tab là một trang được vẽ một lần rồi chỉ ẩn hiện
// (để nội dung đang gõ dở ở tab Báo cáo không bị mất khi chuyển tab).
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
export function mountShell({ main, tabs, initial }) {
  const pages = {}, rendered = new Set(), nav = h("nav", { class: "tabnav", id: "tabnav" }), host = h("div", { id: "pages" });
  const show = async (key) => {
    for (const t of tabs) { pages[t.key].hidden = t.key !== key; nav.querySelector(`[data-tab="${t.key}"]`).setAttribute("aria-current", String(t.key === key)); }
    if (!rendered.has(key)) {
      rendered.add(key);
      try { await tabs.find((t) => t.key === key).render(pages[key]); } catch (e) { pages[key].replaceChildren(h("p", { class: "msg err" }, "Không tải được: " + (e.code || e.message))); }
    }
    try { history.replaceState(null, "", location.pathname + location.search + "#" + key); } catch { /* khong sao */ }
  };
  for (const t of tabs) { pages[t.key] = h("div", { "data-page": t.key, hidden: true }); host.append(pages[t.key]); nav.append(h("button", { type: "button", "data-tab": t.key, onclick: () => show(t.key) }, t.title)); }
  main.replaceChildren(nav, host);
  const hash = location.hash.slice(1);
  return show(tabs.some((t) => t.key === hash) ? hash : initial || tabs[0].key);
}
