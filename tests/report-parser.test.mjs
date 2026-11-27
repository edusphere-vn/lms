// Kiem thu bo doc file bao cao (scripts/apps-script/ReportParser.gs) bang du lieu gia lap: node --test tests/report-parser.test.mjs
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { sheet, block, general, evaluationBlock } from "./report-fixtures.mjs";
export const parseReport = new Function(fs.readFileSync(new URL("../scripts/apps-script/ReportParser.gs", import.meta.url), "utf8") + "; return parseReport;")();

const eslHeads = ["Speaking (20)", "Listening (20)", "Pronunciation (20)", "Vocabulary (20)", "Grammar (20)"];
function eslFile() {
  const att = [["2026-10-20", "Present"], ["2026-10-24", "Present"], ["2026-10-27", "Absent"], ["2026-10-31", "Present"], ["2026-11-03", "Cancelled"], ["2026-11-07", "Present"], ["2026-11-10", "Present"], ["2026-11-13", "Present"], ["2026-11-17", "Present"], ["2026-11-21", "Present"]];
  const g = general({ name: " Ho  Linh San ", teacher: "Miles", course: "ESL Speaking", link: "https://meet.google.com/x", att,
    rows: [{ date: "2026-10-17", scores: [10, 9, 8, 10, 8], level: "A2" }, { date: "2026-11-21", scores: [12, 10, 9, 12, "x"], level: "A2" }] });
  const c = {}; block(c, 7, "2026-10-20", "Present", "Miles", "OXFORD 1", "UNIT 1", "good");
  block(c, 12, "2026-10-24", "PRESENT", "Miles", "OXFORD 1", "UNIT 1 (cont)", "ok");
  block(c, 17, "", "Present", "Miles", "", "", "");                        // khoi mau trong: chi co san Present
  block(c, 22, "2026-10-17", "Present", "Miles", "OXFORD 1", "typo ngay", "");   // ngay sai, nam sau
  block(c, 27, "", "Present", "Miles", "x", "co noi dung nhung khong co ngay", "");
  evaluationBlock(c, 59, eslHeads, "2026-11-21", [12, 10, 9, 12, 9], { Listening: "tot", "General Review": "rat tot" });
  return { General: g, RC1: sheet(c) };
}
test("doc thong tin chung, bang diem, diem danh", () => {
  const r = parseReport(eslFile(), { fileName: "a.xlsx" });
  assert.equal(r.student, "Ho Linh San"); assert.equal(r.teacher, "Miles"); assert.equal(r.course, "ESL Speaking"); assert.equal(r.meetLink, "https://meet.google.com/x");
  assert.equal(r.scoreTable.length, 2); assert.equal(r.scoreTable[0].remark, "Entrance"); assert.deepEqual(r.scoreTable[0].scores, { Speaking: 10, Listening: 9, Pronunciation: 8, Vocabulary: 10, Grammar: 8 });
  assert.equal(r.scoreTable[1].scores.Grammar, undefined); assert.ok(r.warnings.some((w) => w.code === "score_text"));
  assert.equal(r.attendance.length, 10); assert.deepEqual(r.attendance[4], { no: 5, date: "2026-11-03", status: "Cancelled" });
});
test("RC: bo khoi mau trong, giu khoi co noi dung khong ngay, chuan hoa trang thai, canh bao thu tu ngay", () => {
  const r = parseReport(eslFile());
  const rc = r.rcs[0]; assert.equal(rc.rc, 1); assert.equal(rc.sessions.length, 4);
  assert.equal(rc.sessions[1].status, "Present"); assert.equal(rc.sessions[0].progress, "OXFORD 1"); assert.equal(rc.sessions[0].participation, "good");
  assert.equal(rc.sessions[2].date, "2026-10-17"); assert.equal(rc.sessions[3].date, "");
  const codes = r.warnings.map((w) => w.code); assert.ok(codes.includes("date_order")); assert.ok(codes.includes("no_date"));
  assert.deepEqual(rc.evaluation.scores, { Speaking: 12, Listening: 10, Pronunciation: 9, Vocabulary: 12, Grammar: 9 });
  assert.equal(rc.evaluation.comments["General Review"], "rat tot"); assert.equal(rc.evaluation.date, "2026-11-21");
});
test("IELTS: sua loi go .5.5, nhieu tab RC theo thu tu so", () => {
  const heads = ["Fluency and Coherence", "Lexical Resource", "Grammatical Range and Accuracy", "Pronunciation", "Band Score"];
  const g = general({ name: "Hieu", teacher: "Alden", course: "IELTS Speaking", link: "", att: [["2026-09-09", "PRESENT"], ["2026-09-30", "ABSENT"]], rows: [{ date: "2026-09-30", scores: [".5.5", 5, 5, 4.5, 5], level: "B1" }] });
  const a = {}; block(a, 7, "2026-09-09", "PRESENT", "ALDEN", "TOPIC", "x", "y"); evaluationBlock(a, 59, heads, "2026-09-30", [5.5, 5, 5, 4.5, 5], {});
  const b = {}; block(b, 7, "2026-10-02", "PRESENT", "ALDEN", "TOPIC2", "", ""); 
  const r = parseReport({ General: g, RC10: sheet(b), RC2: sheet(b), RC1: sheet(a) });
  assert.deepEqual(r.rcs.map((x) => x.rc), [1, 2, 10]); assert.equal(r.scoreTable[0].scores["Fluency and Coherence"], 5.5);
  assert.ok(r.warnings.some((w) => w.code === "score_fixed")); assert.equal(r.attendance[1].status, "Absent");
});
test("canh bao so buoi RC va lech diem danh", () => {
  const g = general({ name: "A", teacher: "T", course: "ESL Speaking", link: "", rows: [], att: [["2026-01-01", "Present"]] });
  const mk = (n) => { const c = {}; for (let i = 0; i < n; i++) block(c, 7 + i * 5, `2026-02-${String(i + 1).padStart(2, "0")}`, "Present", "T", "p", "a", "c"); return sheet(c); };
  const r = parseReport({ General: g, RC1: mk(3), RC2: mk(11) });
  const codes = r.warnings.map((w) => w.code); assert.ok(codes.includes("rc_short") && codes.includes("rc_over") && codes.includes("count_mismatch"));
  assert.ok(parseReport({}).warnings.some((w) => w.code === "no_general"));
});
