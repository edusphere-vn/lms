// Lưới lịch tuần chỉ xem (giống lưới của admin nhưng không sửa được). cells = { "<cot>_<HHMM>": {t, k} }.
import { ROWS, COLS, DAYS, rowTime, cellKey, normName } from "./grid-core.js";

export function renderGridView(cells, { h, onPick = null }) {
  // gop cac o lien tiep cung ten thanh mot khoi (buoi 50 phut = 2 o)
  const at = (r, c) => cells[cellKey(r, c)] || null, skip = new Set(), span = new Map();
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const x = at(r, c); if (!x || x.k || !x.t || skip.has(`${r}_${c}`)) continue;
    let n = 1; while (r + n < ROWS) { const y = at(r + n, c); if (y && !y.k && y.t && normName(y.t) === normName(x.t)) { skip.add(`${r + n}_${c}`); n++; } else break; }
    span.set(`${r}_${c}`, n);
  }
  const todayCol = (new Date().getDay() + 6) % 7, body = [];
  for (let r = 0; r < ROWS; r++) {
    const tds = [h("th", { class: "tm" + (r % 2 ? "" : " hh") }, r % 2 ? "" : rowTime(r))];
    for (let c = 0; c < COLS; c++) {
      if (skip.has(`${r}_${c}`)) continue;
      const x = at(r, c), n = span.get(`${r}_${c}`) || 1;
      const cls = !x ? "empty-slot" : x.k === "na" ? "na" : x.k === "res" ? "res" : x.t ? "esl" : "empty-slot";
      tds.push(h("td", { class: `cell ${cls}${onPick && cls === "esl" ? " clickable" : ""}`, rowspan: n > 1 ? String(n) : null, onclick: onPick && cls === "esl" ? () => onPick(x.t) : null, title: x?.t || (x?.k === "na" ? "Không rảnh" : x?.k === "res" ? "Giữ chỗ" : "") }, x?.t || (x?.k === "res" ? "Giữ chỗ" : "")));
    }
    body.push(h("tr", {}, tds));
  }
  return h("div", {},
    h("div", { class: "legend" }, h("span", {}, h("i", { style: "background:#9fc5e8" }), "Có lớp"), h("span", {}, h("i", { style: "background:#980000" }), "Không rảnh"), h("span", {}, h("i", { style: "background:#ffe94d" }), "Giữ chỗ")),
    h("div", { class: "gridwrap", id: "gridView" }, h("table", { class: "grid ro" }, h("thead", {}, h("tr", {}, h("th", { class: "tm" }, ""), DAYS.map((d, c) => h("th", { class: c === todayCol ? "today" : "" }, d)))), h("tbody", {}, body))));
}
