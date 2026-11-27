// Đánh giá cuối mỗi RC (theo mẫu file báo cáo gốc): tiêu chí theo khóa, tổng điểm hoặc Band, cấp độ, lời nhận xét. Không dùng DOM, kiểm thử bằng node.
import { COURSES, RUBRICS } from "./defaults.js";

export const ESL_CRITERIA = ["Speaking", "Listening", "Pronunciation", "Vocabulary", "Grammar"];
// Khoảng điểm của từng tiêu chí (/20) quy ra CEFR, lấy từ bảng ở cuối mỗi RC trong file gốc
export const CEFR_CRITERION_RANGES = [["A0", 0, 4], ["A1", 5, 8], ["A2", 9, 11], ["B1", 12, 14], ["B2", 15, 16], ["C1", 17, 18], ["C2", 19, 20]];
export const EVAL_STATUS = { Draft: ["Nháp", "info"], Submitted: ["Chờ duyệt", "warn"], Approved: ["Đã duyệt", "ok"] };

export const kindOf = (no) => (no === 0 ? "Entrance" : `Exam ${no}`);
export const evalId = (sc, no) => `${sc}_${no}`;

// Cấu hình form theo khóa: ESL = 5 tiêu chí x 20 (tổng /100), IELTS = 4 tiêu chí tối đa 9 (Band = trung bình làm tròn 0.5)
export function evalSpec(courseId, courses = COURSES) {
  const c = courses[courseId] || courses.ESL_SP, ielts = c.scale === "IELTS_BAND";
  return { courseId, scale: c.scale, ielts, criteria: c.criteria || [], max: c.criteriaMax || (ielts ? 9 : 20), step: ielts ? 0.5 : 1, totalKey: ielts ? "Band Score" : "Total", totalMax: ielts ? 9 : (c.criteria.length || 5) * 20 };
}

export function levelOf(scale, value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "";
  const v = Number(value);
  for (const r of Object.values(RUBRICS)) if (r.scale === scale && v >= r.min && v <= r.max) return r.level;
  return "";
}

const num = (x) => (x === "" || x == null ? null : Number(x));
// scores: { tiêu chí: số }. Trả về { total, level }. Thiếu điểm một tiêu chí thì chưa tính.
export function computeResult(spec, scores) {
  const vals = spec.criteria.map((k) => num(scores[k]));
  if (!spec.criteria.length || vals.some((v) => v == null || Number.isNaN(v))) return { total: null, level: "" };
  const sum = vals.reduce((a, b) => a + b, 0);
  const total = spec.ielts ? Math.round((sum / vals.length) * 2) / 2 : sum;
  return { total, level: levelOf(spec.scale, total) };
}

export function validateScores(spec, scores) {
  const errs = [];
  for (const k of spec.criteria) {
    const v = num(scores[k]);
    if (v == null) continue;
    if (Number.isNaN(v) || v < 0 || v > spec.max) errs.push(`${k}: điểm từ 0 đến ${spec.max}`);
    else if (spec.ielts && Math.round(v * 2) !== v * 2) errs.push(`${k}: điểm theo bước 0.5`);
    else if (!spec.ielts && !Number.isInteger(v)) errs.push(`${k}: điểm nguyên`);
  }
  return errs;
}

// Tạo bản ghi evaluations/{sc}_{no} từ dữ liệu form
export function makeEvaluation({ sc, no, spec, date, scores, band, comments, teacherId, agencyId, status, now = Date.now() }) {
  const clean = {};
  for (const k of spec.criteria) { const v = num(scores[k]); if (v != null && !Number.isNaN(v)) clean[k] = v; }
  const calc = computeResult(spec, clean);
  const total = spec.ielts && num(band) != null && !Number.isNaN(num(band)) ? num(band) : calc.total;
  if (spec.ielts && total != null) clean["Band Score"] = total;
  const level = spec.ielts && total != null ? levelOf(spec.scale, total) : calc.level;
  const cm = {};
  for (const [k, v] of Object.entries(comments || {})) { const t = String(v || "").trim(); if (t) cm[k] = t; }
  return { sc, rcNo: no, kind: kindOf(no), date: date || "", scores: clean, total: total == null ? null : total, level, comments: cm, teacherId: teacherId || "", agencyId: agencyId || "", status, source: "app", updatedAt: now };
}

// Tổng điểm của bản ghi (bản nhập từ file có thể chưa có trường total)
export function totalOf(ev, spec) {
  if (ev.total != null) return ev.total;
  if (spec.ielts && ev.scores?.["Band Score"] != null) return ev.scores["Band Score"];
  return computeResult(spec, ev.scores || {}).total;
}
