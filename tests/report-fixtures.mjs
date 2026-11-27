// Du lieu bao cao gia lap theo cau truc file that (khong chua du lieu hoc vien that).
const pad = (rows, r, c, v) => { while (rows.length <= r) rows.push([]); const row = rows[r]; while (row.length <= c) row.push(""); row[c] = v; };
export function sheet(cells) { const rows = []; for (const [a1, v] of Object.entries(cells)) { const m = /^([A-Z]+)(\d+)$/.exec(a1); const col = m[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1; pad(rows, Number(m[2]) - 1, col, v); } return rows; }
const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Khoi bao cao buoi hoc 5 hang bat dau o hang r
export function block(cells, r, date, status, teacher, progress, academic, part) {
  cells[`B${r}`] = "Date of Class:"; if (date) cells[`C${r}`] = date; cells[`D${r}`] = "Status of class:"; cells[`E${r}`] = status; cells[`F${r}`] = "Teacher:"; cells[`G${r}`] = teacher;
  cells[`B${r + 2}`] = "Progress"; if (progress) cells[`C${r + 2}`] = progress;
  cells[`B${r + 3}`] = "Academic Performance\n(Topic, Vocabulary)"; if (academic) cells[`C${r + 3}`] = academic;
  cells[`B${r + 4}`] = "Class Participation"; if (part) cells[`C${r + 4}`] = part;
}
export function attendance(cells, startRow, list) {   // list: [[date,status]...], 8 moi hang
  cells[`B${startRow - 1}`] = "ATTENDANCE";
  for (let g = 0; g * 8 < list.length; g++) list.slice(g * 8, g * 8 + 8).forEach(([d, s], i) => { cells[`${L[1 + i]}${startRow + g * 3}`] = String(g * 8 + i + 1); if (d) cells[`${L[1 + i]}${startRow + g * 3 + 1}`] = d; cells[`${L[1 + i]}${startRow + g * 3 + 2}`] = s; });
}
export function general({ name, teacher, course, link, rows, att }) {
  const c = { B3: "Student Name:", C3: name, G3: "Teacher:", H3: teacher, B4: "Course:", C4: course, B5: "Class's Link", C5: link, B9: "Date" };
  const heads = course.startsWith("IELTS") ? ["Fluency and Coherence", "Lexical Resource", "Grammatical Range and Accuracy", "Pronunciation", "Band Score"] : ["Speaking", "Listening", "Pronunciation", "Vocabulary", "Grammar"];
  heads.forEach((h, i) => { c[`${L[2 + i]}9`] = h; }); c[`${L[2 + heads.length]}9`] = "Level"; c[`${L[3 + heads.length]}9`] = "Remark";
  const remarks = ["Entrance", "Exam 1", "Exam 2", "Exam 3", "Exam 4", "Exam 5"];
  remarks.forEach((rm, i) => { const row = rows[i]; if (row) { c[`B${10 + i}`] = row.date; row.scores.forEach((s, k) => { c[`${L[2 + k]}${10 + i}`] = s; }); c[`${L[2 + heads.length]}${10 + i}`] = row.level; } else c[`${L[2 + heads.length]}${10 + i}`] = "A0"; c[`${L[3 + heads.length]}${10 + i}`] = rm; });
  c.B17 = "Comparison Table"; attendance(c, 23, att); return sheet(c);
}
export function evaluationBlock(cells, r, heads, date, scores, comments) {
  cells[`B${r}`] = "EVALUATION"; cells[`B${r + 1}`] = "Date"; heads.forEach((h, i) => { cells[`${L[2 + i]}${r + 1}`] = h; });
  cells[`B${r + 2}`] = date; scores.forEach((s, i) => { cells[`${L[2 + i]}${r + 2}`] = s; });
  Object.entries(comments).forEach(([k, v], i) => { cells[`B${r + 4 + i}`] = k; cells[`C${r + 4 + i}`] = v; });
}
