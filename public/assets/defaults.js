// Du lieu mac dinh theo blueprint (quyet dinh cua Peter 26/11/2026). Admin bam "Nap du lieu mac dinh" de ghi vao Firestore.
export const CONFIG = {
  sessions_per_rc: { value: 10, note: "Moi RC dung 10 buoi cho moi khoa" },
  counts_toward_rc: { value: "Present,Absent", note: "Trang thai duoc tinh vao 10 buoi cua RC" },
  phil_offset_hours: { value: 1, note: "Gio Phil = gio VN + gia tri nay (tu tinh)" },
  rate_25: { value: 100, note: "Luong buoi 25 phut (VND, tam thoi)" },
  rate_50: { value: 200, note: "Luong buoi 50 phut (VND, tam thoi)" },
  rate_absent_25: { value: 25, note: "Hoc vien vang, buoi 25 phut" },
  rate_absent_50: { value: 50, note: "Hoc vien vang, buoi 50 phut" },
  rate_cancel: { value: 0, note: "Buoi Cancel khong tra luong vi da co buoi bu" },
  hold_max_return_weeks: { value: 14, note: "Han quay lai toi da = buoi cuoi + 14 tuan" },
  low_sessions_alert: { value: 3, note: "Nhac gia han khi con ngan nay buoi" },
  report_overdue_hours: { value: 24, note: "Buoi qua han nay chua co report thi bao admin" },
};
const ESL = ["Speaking", "Listening", "Pronunciation", "Vocabulary", "Grammar"];
const IELTS = ["Fluency and Coherence", "Lexical Resource", "Grammatical Range and Accuracy", "Pronunciation"];
export const COURSES = {
  ESL_SP: { name: "ESL Speaking", scale: "CEFR100", criteria: ESL, criteriaMax: 20, status: "Active" },
  ESL_AD: { name: "ESL Adult", scale: "CEFR100", criteria: ESL, criteriaMax: 20, status: "Active" },
  IELTS_SP: { name: "IELTS Speaking", scale: "IELTS_BAND", criteria: IELTS, criteriaMax: 9, status: "Active" },
  IELTS_SW: { name: "IELTS Speaking+Writing", scale: "IELTS_BAND", criteria: IELTS, criteriaMax: 9, status: "Active" },
  IELTS_WR: { name: "IELTS Writing", scale: "IELTS_BAND", criteria: [], criteriaMax: 9, status: "Active" },
  BIZ_EN: { name: "Business English", scale: "CEFR100", criteria: ESL, criteriaMax: 20, status: "Active" },
  VISA_F1: { name: "Visa F1", scale: "CEFR100", criteria: ESL, criteriaMax: 20, status: "Active" },
};
// Tu bang Comparison Table trong report mau
export const RUBRICS = {
  "CEFR100_A0": { scale: "CEFR100", level: "A0", min: 0, max: 24, ielts: "Below 2.0" },
  "CEFR100_A1": { scale: "CEFR100", level: "A1", min: 25, max: 44, ielts: "2.0 - 3.0" },
  "CEFR100_A2": { scale: "CEFR100", level: "A2", min: 45, max: 59, ielts: "3.0 - 4.0" },
  "CEFR100_B1": { scale: "CEFR100", level: "B1", min: 60, max: 74, ielts: "4.0 - 5.0" },
  "CEFR100_B2": { scale: "CEFR100", level: "B2", min: 75, max: 84, ielts: "5.5 - 6.5" },
  "CEFR100_C1": { scale: "CEFR100", level: "C1", min: 85, max: 94, ielts: "7.0 - 8.0" },
  "CEFR100_C2": { scale: "CEFR100", level: "C2", min: 95, max: 100, ielts: "8.5 - 9.0" },
  "IELTS_BAND_A0": { scale: "IELTS_BAND", level: "A0", min: 0, max: 1.9, ielts: "Below 2.0" },
  "IELTS_BAND_A1": { scale: "IELTS_BAND", level: "A1", min: 2.0, max: 2.9, ielts: "2.0 - 3.0" },
  "IELTS_BAND_A2": { scale: "IELTS_BAND", level: "A2", min: 3.0, max: 3.9, ielts: "3.0 - 4.0" },
  "IELTS_BAND_B1": { scale: "IELTS_BAND", level: "B1", min: 4.0, max: 5.0, ielts: "4.0 - 5.0" },
  "IELTS_BAND_B2": { scale: "IELTS_BAND", level: "B2", min: 5.5, max: 6.5, ielts: "5.5 - 6.5" },
  "IELTS_BAND_C1": { scale: "IELTS_BAND", level: "C1", min: 7.0, max: 8.0, ielts: "7.0 - 8.0" },
  "IELTS_BAND_C2": { scale: "IELTS_BAND", level: "C2", min: 8.5, max: 9.0, ielts: "8.5 - 9.0" },
};
