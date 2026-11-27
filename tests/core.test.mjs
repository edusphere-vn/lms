// Kiem thu phan loi (khong can trinh duyet): npm run test:core
import test from "node:test"; import assert from "node:assert/strict";
import * as G from "../public/assets/grid-core.js";
import * as I from "../public/assets/import-core.js";

test("khoa o va gio", () => {
  assert.equal(G.cellKey(0, 0), "0_0600"); assert.equal(G.cellKey(G.ROWS - 1, 6), "6_2330");
  assert.deepEqual(G.parseKey("2_2000"), { c: 2, r: 28 }); assert.equal(G.hhmm(G.START_MIN + 60 + 30), "07:30");
});
test("normName bo dau va khoang trang", () => assert.equal(G.normName("  Nguyễn  Đức Thịnh "), "nguyen duc thinh"));
test("TSV: ngoac kep, xuong dong, tab", () => {
  const rows = G.parseTSV('A\tB\n"x\ny"\t"he said ""hi"""\n');
  assert.deepEqual(rows, [["A", "B"], ["x\ny", 'he said "hi"']]);
  assert.equal(G.toTSV(rows), 'A\tB\n"x\ny"\t"he said ""hi"""');
});
test("dan ma tran, bo phan ngoai luoi, null xoa o", () => {
  let c = G.pasteMatrix({}, G.ROWS - 1, 6, [[{ t: "a" }, { t: "b" }], [{ t: "c" }, null]]);
  assert.deepEqual(Object.keys(c), ["6_2330"]);
  c = G.pasteMatrix(c, G.ROWS - 1, 6, [[null]]); assert.deepEqual(c, {});
});
test("keo o lap lai mau (xuong, len, ngang)", () => {
  const base = G.pasteMatrix({}, 4, 0, [[{ t: "A" }], [{ t: "B" }]]);
  const src = { r0: 4, r1: 5, c0: 0, c1: 0 };
  const down = G.fillRect(base, src, { r0: 6, r1: 9, c0: 0, c1: 0 });
  assert.deepEqual([6, 7, 8, 9].map((r) => G.getCell(down, r, 0).t), ["A", "B", "A", "B"]);
  const up = G.fillRect(base, src, { r0: 2, r1: 3, c0: 0, c1: 0 });
  assert.deepEqual([2, 3].map((r) => G.getCell(up, r, 0).t), ["A", "B"]);
  const right = G.fillRect(base, src, { r0: 4, r1: 5, c0: 1, c1: 3 });
  assert.equal(G.getCell(right, 5, 3).t, "B");
});
test("vung dich khi keo", () => {
  const s = { r0: 2, r1: 3, c0: 1, c1: 1 };
  assert.deepEqual(G.fillTarget(s, 6, 1), { r0: 4, r1: 6, c0: 1, c1: 1 });
  assert.deepEqual(G.fillTarget(s, 3, 4), { r0: 2, r1: 3, c0: 2, c1: 4 });
  assert.equal(G.fillTarget(s, 2, 1), null);
});
test("o Khong ranh giu mau, khong tinh vao so o", () => {
  const c = { "0_0600": { t: "An" }, "0_0630": { t: "", k: "na" }, "0_0700": { t: "Binh", k: "res" } };
  assert.equal(G.countSlots(c), 1);
  assert.deepEqual(G.setCell({}, 0, 0, { t: "", k: "na" }), { "0_0600": { t: "", k: "na" } });
  assert.deepEqual(G.setCell({}, 0, 0, { t: "" }), {});
});
test("trung gio giua hai giao vien, lop nhom, bo qua o Khong ranh", () => {
  const all = {
    T1: { "1_2000": { t: "Minh Nghia" }, "1_2030": { t: "An, Binh" }, "2_2000": { t: "Zed", k: "na" } },
    T2: { "1_2000": { t: "minh nghia" }, "1_2030": { t: "Binh" }, "2_2000": { t: "Zed" } },
    T3: { "3_2000": { t: "Minh Nghia" } },
  };
  const c = G.findConflicts(all);
  assert.deepEqual([...c.T1].sort(), ["1_2000", "1_2030"]); assert.deepEqual([...c.T2].sort(), ["1_2000", "1_2030"]);
  assert.equal(c.T3, undefined);
});

// ---------- nhap danh sach hoc vien ----------
const H = ["SC", "Agency", "Name", "Course", "Period", "Class", "Skd", "Length", "VTime", "Start", "Mo", "End", "Year", "Invoice", "Paid", "Status", "Type", "Teacher"];
const serial = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) / 86400000 + 25569;
const row = (o) => [o.sc, o.agency ?? "TEC", o.name, o.course ?? "ESL Speaking", o.weeks ?? 5, o.sessions ?? 10, o.skd ?? "Mon-Thu", o.len ?? 50, o.time ?? 20 / 24, serial(o.start ?? "2026-08-10"), 8, serial(o.end ?? "2026-09-14"), 2026, null, o.paid ?? "Paid", o.status ?? "Done", o.type ?? "New ", o.teacher ?? "Nyle", o.meet];
test("doc lich tuan, ngay, gio", () => {
  assert.deepEqual(I.parseSkd("MOn-Wed-Fri"), { days: [0, 2, 4], flexible: false });
  assert.deepEqual(I.parseSkd("Tue - Thu").days, [1, 3]); assert.equal(I.parseSkd("MTWTF").flexible, true); assert.deepEqual(I.parseSkd("Sat-Sun").days, [5, 6]);
  assert.equal(I.parseDate(serial("2026-08-10")), "2026-08-10"); assert.equal(I.parseDate("14/9/2026"), "2026-09-14"); assert.equal(I.parseTime(21 / 24), "21:00"); assert.equal(I.parseTime("09:30:00"), "09:30");
  assert.equal(I.courseId("IELTS Speaking"), "IELTS_SP"); assert.equal(I.courseId("Visa Interview"), "VISA_F1"); assert.equal(I.courseId("Cooking"), "");
});
test("chuan hoa danh sach: gop ten, agency, canh bao", () => {
  const rows = [["Hoc vien dang hoc"], H,
    row({ sc: "ES1", name: "Minh Nghia", agency: "TEC", teacher: "Nyle", meet: "https://meet.google.com/aaa" }),
    row({ sc: "ES2", name: "Minh Nghia ", agency: "Tec", teacher: "Nyle ", start: "2026-09-14", end: "2026-10-19", type: "Extend" }),
    row({ sc: "ES2", name: "Minh Nghia", agency: "TEC", teacher: "Nyle", start: "2026-09-14", end: "2026-10-19" }),   // dong trung hoan toan
    row({ sc: "ES1", name: "Ai Do", teacher: "Nyle" }),                                                          // SC dung cho hoc vien khac
    [null, null, "Tong ket", null, null, null, "Total Classes"],                                                 // dong rac cuoi sheet
    row({ sc: "ES4", name: "Huy", agency: "Smart Alpha", status: "CANCELLED", paid: "Paid", teacher: "Kristea" }),
    row({ sc: "ES5", name: "Lan", agency: "Smart Alpha", status: "DOne", paid: null, start: "2026-09-04", end: "2026-08-19", teacher: "Krishtea" }),
    row({ sc: "ES6", name: "Mai", course: "Cooking", skd: "Mon-Wed-Fri", status: "Processing" }),
    row({ sc: "ES7", name: "Cuong", skd: "MTWTF", status: "Processing" }),
    [null, null, null]];
  const p = I.parseStudentList(rows, { teachers: [{ id: "T1", name: "Nyle" }], agencies: [{ id: "TEC", name: "TEC" }] });
  assert.equal(p.records.length, 8); assert.equal(p.skipped, 1);
  const by = Object.fromEntries(p.records.map((r) => [r.sc + (r.rowNo === 5 ? "x" : r.name === "Ai Do" ? "y" : ""), r]));
  assert.equal(by.ES1.meetLink, "https://meet.google.com/aaa"); assert.equal(by.ES1.rowNo, 3); assert.equal(by.ES1.kind, "New"); assert.equal(by.ES1.startTime, "20:00");
  assert.equal(by.ES2x.dup, true); assert.equal(by.ES2.dup, false); assert.ok(by.ES1y.flags.some((f) => f.code === "sc_name_conflict"));
  assert.deepEqual(by.ES4.flags.map((f) => f.code), ["cancelled_paid"]);
  assert.ok(by.ES5.flags.some((f) => f.code === "end_before_start")); assert.equal(by.ES5.status, "Done");
  assert.ok(by.ES6.flags.some((f) => f.code === "course_unknown")); assert.ok(by.ES6.flags.some((f) => f.code === "skd_mismatch" && f.level === "info"));
  assert.ok(by.ES7.flags.some((f) => f.code === "skd_flexible"));
  assert.equal(by.ES2.agencyId, "TEC"); assert.equal(by.ES4.agencyId, "SMART-ALPHA");
  assert.equal(p.agencies.find((a) => a.id === "SMART-ALPHA").count, 2);
  assert.equal(p.teachers.find((t) => t.key === "nyle").suggestId, "T1");
  assert.ok(p.teachers.find((t) => t.key === "kristea").similarTo?.includes("Krishtea") || p.teachers.find((t) => t.key === "krishtea").similarTo?.includes("Kristea"));
});
test("tao danh sach ghi: SC giu nguyen qua cac goi, giao vien moi, billing tach rieng", () => {
  const rows = [H,
    row({ sc: "ES1", name: "Minh Nghia", status: "Done", teacher: "Zae", meet: "https://meet.google.com/aaa" }),
    row({ sc: "ES1", name: "Minh Nghia", start: "2026-09-14", end: "2026-10-19", type: "Extend", status: "Processing", teacher: "Nyle" }),
    row({ sc: "ES4", name: "Huy", status: "Cancelled", paid: "", teacher: "Zae" }),
    row({ sc: "ES9", name: "Minh  Nghia", status: "Done", teacher: "Zae", start: "2026-05-01", end: "2026-06-05" })];
  const p = I.parseStudentList(rows, { teachers: [{ id: "T1", name: "Nyle" }], agencies: [] });
  const all = new Set(p.records.map((r) => r.rowNo)), base = { include: all, teacherMap: { nyle: "T1" }, existingTeacherIds: ["T1", "T7"] };
  const out = I.buildWrites(p, base), get = (path) => out.writes.find((w) => w.path === path);
  assert.equal(out.students, 3); assert.equal(out.enrollments, 4); assert.equal(out.newTeachers, 1);
  assert.equal(get("teachers/T8").data.name, "Zae");                                  // ma moi tiep theo T7
  assert.deepEqual(get("students/ES1").data.packageScs, ["ES1", "ES1"]);              // 2 goi cua cung SC
  assert.deepEqual(get("students/ES1").union.teacherIds.sort(), ["T1", "T8"]);
  assert.equal(get("students/ES1").data.status, "Active"); assert.equal(get("students/ES1").data.meetLink, "https://meet.google.com/aaa");
  assert.equal(get("enrollments/ES1_2026-08-10").data.teacherId, "T8"); assert.equal(get("enrollments/ES1_2026-09-14").data.teacherId, "T1");
  assert.equal(get("enrollments/ES1_2026-09-14").data.sc, "ES1");
  assert.equal(get("billing/ES1_2026-08-10").data.paid, "Paid"); assert.equal(get("billing/ES4_2026-08-10"), undefined);
  assert.equal(get("students/ES4").data.status, "Inactive"); assert.deepEqual(get("students/ES4").union.teacherIds, []);   // goi bi huy khong gan giao vien
  assert.ok(!("paid" in get("enrollments/ES1_2026-08-10").data));                      // giao vien doc duoc enrollments => khong chua thong tin thu tien
  // gop cac SC cung ten thanh 1 hoc vien (ma = SC som nhat)
  const merged = I.buildWrites(p, { ...base, mergeByName: true });
  assert.equal(merged.students, 2); assert.equal(merged.writes.find((w) => w.path === "students/ES1"), undefined);   // ES9 hoc som nhat nen la ma hoc vien
  assert.deepEqual(merged.writes.find((w) => w.path === "students/ES9").data.packageScs.sort(), ["ES1", "ES1", "ES9"]);
});
test("gop hai cach viet ten giao vien thanh mot giao vien moi", () => {
  const rows = [H, row({ sc: "ES1", name: "A", teacher: "Kristea" }), row({ sc: "ES2", name: "B", teacher: "Krishtea" })];
  const p = I.parseStudentList(rows, {});
  const out = I.buildWrites(p, { include: new Set(p.records.map((r) => r.rowNo)), teacherMap: { kristea: "__new__", krishtea: "~kristea" } });
  assert.equal(out.newTeachers, 1);
  const ids = out.writes.filter((w) => w.path.startsWith("enrollments/")).map((w) => w.data.teacherId);
  assert.equal(new Set(ids).size, 1);
});
test("khong co tieu de", () => assert.ok(I.parseStudentList([["a", "b"]]).error));

// ---------- lich tuan: gop khoang gio, nhap ClassSKD ----------
import * as S from "../public/assets/schedule-import-core.js";
test("lich tuan cua hoc vien: gop o lien tiep, nhieu giao vien", () => {
  const all = { T1: { "1_2000": { t: "Minh Nghia" }, "1_2030": { t: "minh nghia" }, "3_2000": { t: "Minh Nghia" }, "3_2100": { t: "Minh Nghia" }, "4_2000": { t: "Minh Nghia", k: "na" } }, T2: { "1_0900": { t: "Lan, Minh Nghia" } } };
  assert.deepEqual(G.slotsForName(all, "Minh Nghia"), [
    { teacherId: "T2", day: 1, from: "09:00", to: "09:30" }, { teacherId: "T1", day: 1, from: "20:00", to: "21:00" },
    { teacherId: "T1", day: 3, from: "20:00", to: "20:30" }, { teacherId: "T1", day: 3, from: "21:00", to: "21:30" }]);
  assert.deepEqual(G.slotsForName(all, ""), []);
});
test("khop ten giao vien: bo danh xung, sai 1 ky tu", () => {
  const ts = [{ id: "T1", name: "Alden" }, { id: "T2", name: "Krishtea" }, { id: "T3", name: "Jules" }];
  assert.equal(I.matchTeacher("ALDEN ", ts).id, "T1"); assert.equal(I.matchTeacher("Sir JULES ", ts).id, "T3");
  assert.deepEqual(I.matchTeacher("KRISTEA", ts), { id: "T2", exact: false }); assert.equal(I.matchTeacher("Nella", ts), null);
});
const time = (h, m = 0) => (h * 60 + m) / 1440;
test("doc ClassSKD: khoi giao vien, mau o, gio ngoai luoi", () => {
  const rows = [["", "Victoria"], ["VN Time", "PH Time", "Monday", "Tuesday"],
    [time(7), time(8), "", ""], [time(8), time(9), "", "Nguyen Nha Uyen"], [time(8, 30), time(9, 30), "", "Nguyen Nha Uyen"], [time(2), time(3), "Dem", ""],
    ["", "Sir JULES "], ["VN Time", "Phil time", "Monday"], [time(20), time(21), "Thanh Danh"], [time(20, 30), time(21, 30), ""]];
  const fills = { "2,2": "980000", "3,3": "9FC5E8", "9,2": "FFFF00", "5,2": "F4CCCC" };
  const p = S.parseClassSkd(rows, (r, c) => fills[`${r},${c}`] || "");
  assert.equal(p.blocks.length, 2); assert.equal(p.dropped, 1);
  const [v, j] = p.blocks;
  assert.deepEqual(v.cells["0_0700"], { t: "", k: "na" }); assert.deepEqual(v.cells["1_0800"], { t: "Nguyen Nha Uyen" }); assert.equal(v.count, 2); assert.equal(v.marked, 1);
  assert.equal(j.name, "Jules"); assert.equal(j.key, "jules"); assert.deepEqual(j.cells["0_2000"], { t: "Thanh Danh" }); assert.deepEqual(j.cells["0_2030"], { t: "", k: "res" });
  const w = S.buildScheduleWrites(p.blocks, { teacherMap: { victoria: "T1", jules: "__new__" }, existingIds: ["T1", "T4"], existingCells: { T1: { "6_2330": { t: "Cu" } } }, overwrite: false });
  assert.equal(w.newTeachers, 1); assert.equal(w.writes.find((x) => x.path === "teachers/T5").data.name, "Jules");
  assert.ok(w.writes.find((x) => x.path === "schedule/T1").data.cells["6_2330"]); assert.ok(w.writes.find((x) => x.path === "schedule/T5"));
});

// ---------- nhap bao cao hoc vien ----------
import * as RI from "../public/assets/reports-import-core.js";
test("ghep hoc vien theo ten khong dau, goi y ten gan giong", () => {
  const st = [{ sc: "A", fullName: "Hồ Linh San" }, { sc: "B", fullName: "Ho Linh San" }, { sc: "C", fullName: "Quoc Tri" }];
  assert.equal(RI.matchStudents(" ho  linh san", st).exact.length, 2);
  assert.equal(RI.matchStudents("Quoc Tri Nguyen", st).exact.length, 0);
  assert.deepEqual(RI.matchStudents("Quoc Trii", st).near.map((s) => s.sc), ["C"]);
});
const rep0 = (over = {}) => ({ student: "A", teacher: "Miles", url: "https://drive/x", meetLink: "https://meet/x", warnings: [], scoreTable: [], attendance: [], rcs: [], ...over });
const ctx0 = (o = {}) => ({ sc: "ES1", teacherIdFor: (n) => ({ miles: "T2", alden: "T1" })[String(n).toLowerCase()] || "", agencyId: "TEC", minDate: "2026-01-01", student: {}, ...o });
test("ghep khoi bao cao voi diem danh theo thu tu, lay ngay diem danh, danh dau lech", () => {
  const att = [["2026-10-20", "Present"], ["2026-11-17", "Present"], ["2026-11-20", "Cancelled"], ["2026-11-21", "Absent"]].map(([date, status], i) => ({ no: i + 1, date, status }));
  const blocks = [{ date: "2026-10-20", status: "Present", teacher: "Miles", progress: "P1", academic: "A1", participation: "C1" }, { date: "2026-10-17", status: "Present", teacher: "MILES", progress: "P2", academic: "", participation: "" },
    { date: "", status: "Absent", teacher: "Miles", progress: "", academic: "x", participation: "" }];
  const p = RI.planReport(rep0({ attendance: att, rcs: [{ rc: 1, sessions: blocks }] }), ctx0());
  const s = Object.fromEntries(p.writes.filter((w) => w.path.startsWith("sessions/")).map((w) => [w.path.slice(13), w.data]));
  assert.deepEqual(Object.keys(s), ["2026-10-20", "2026-11-17", "2026-11-20", "2026-11-21"]);   // ngay diem danh thang ngay go sai 10-17
  assert.equal(s["2026-11-17"].reportDate, "2026-10-17"); assert.ok(s["2026-11-17"].flags.includes("date_differs"));
  assert.deepEqual([s["2026-10-20"].rcNo, s["2026-10-20"].rcSeq, s["2026-11-20"].rcNo, s["2026-11-21"].rcSeq], [1, 1, null, 3]);   // Cancelled khong tinh RC
  assert.equal(s["2026-11-21"].topic, ""); assert.equal(s["2026-11-21"].lesson, "x"); assert.equal(s["2026-10-20"].teacherId, "T2");   // khoi khong ngay nhan ngay tu diem danh
  assert.equal(s["2026-11-20"].topic, undefined); assert.deepEqual(s["2026-11-20"].attendance, { ES1: "Cancelled" });
  assert.deepEqual(s["2026-10-20"].agencyIds, ["TEC"]);
});
test("khac so buoi tinh thi ghep theo ngay, buoi le thanh 'chi co o mot ben'; loc theo ngay toi thieu", () => {
  const att = [{ no: 1, date: "2026-02-01", status: "Present" }, { no: 2, date: "2025-12-30", status: "Present" }, { no: 3, date: "2026-02-05", status: "Present" }];
  const blocks = [{ date: "2026-02-01", status: "Present", teacher: "", progress: "p", academic: "", participation: "" }, { date: "2026-02-09", status: "Present", teacher: "", progress: "q", academic: "", participation: "" }];
  const p = RI.planReport(rep0({ attendance: att, rcs: [{ rc: 1, sessions: blocks }] }), ctx0({ minDate: "2026-01-01" }));
  const s = Object.fromEntries(p.writes.filter((w) => w.path.startsWith("sessions/")).map((w) => [w.path.slice(13), w.data]));
  assert.deepEqual(Object.keys(s), ["2026-02-01", "2026-02-05", "2026-02-09"]);
  assert.deepEqual(s["2026-02-05"].flags, ["attendance_only"]); assert.deepEqual(s["2026-02-09"].flags, ["report_only"]); assert.equal(s["2026-02-01"].teacherId, "T2");   // lay GV cua file
  assert.equal(p.flagged, 2);
});
test("danh gia: lay tu bang diem General, nhan xet tu tab RC co cung diem, bo danh gia mau khong khop", () => {
  const scores = { Speaking: 12, Listening: 10, Pronunciation: 9, Vocabulary: 12, Grammar: 9 };
  const rep = rep0({ scoreTable: [{ remark: "Entrance", date: "2026-10-17", scores: { Speaking: 10, Listening: 9, Pronunciation: 8, Vocabulary: 10, Grammar: 8 }, level: "A2" }, { remark: "Exam 1", date: "2026-11-21", scores, level: "A2" }, { remark: "Exam 2", date: "", scores: {}, level: "A0" }],
    rcs: [{ rc: 1, sessions: [], evaluation: { date: "2026-11-21", scores, comments: { "General Review": "tot" } } }, { rc: 2, sessions: [], evaluation: { date: "", scores: { Speaking: 15, Listening: 15, Pronunciation: 15, Vocabulary: 15, Grammar: 15 }, comments: {} } }] });
  const p = RI.planReport(rep, ctx0()), ev = Object.fromEntries(p.writes.filter((w) => w.path.startsWith("evaluations/")).map((w) => [w.path, w.data]));
  assert.deepEqual(Object.keys(ev), ["evaluations/ES1_0", "evaluations/ES1_1"]);
  assert.equal(ev["evaluations/ES1_1"].comments["General Review"], "tot"); assert.equal(ev["evaluations/ES1_1"].kind, "Exam 1"); assert.equal(ev["evaluations/ES1_0"].comments["General Review"], undefined);
  assert.ok(p.warnings.some((w) => w.includes("RC2"))); assert.equal(p.writes.at(-1).path, "students/ES1");
  assert.equal(p.writes.at(-1).data.meetLink, "https://meet/x");
});

// ---------- tao buoi hoc tu luoi lich ----------
import * as SG from "../public/assets/session-gen-core.js";
test("dot lien tiep tren luoi: 2 o = 1 buoi 50 phut, o cach quang la buoi rieng", () => {
  const runs = SG.runsOf({ "1_2000": { t: "Minh" }, "1_2030": { t: "minh" }, "1_2130": { t: "Minh" }, "1_2200": { t: "An", k: "na" }, "3_0900": { t: "Lan, Binh" } });
  assert.deepEqual(runs.filter((r) => r.col === 1).map((r) => [r.rows, r.text]), [[2, "Minh"], [1, "Minh"]]);
  assert.equal(runs.length, 3);
});
test("tao buoi hoc tuan: thu trong tuan, ghep hoc vien, lop nhom, bo qua buoi da co", () => {
  const students = [{ sc: "ES1", fullName: "Minh Nghia", agencyId: "TEC" }, { sc: "ES2", fullName: "Lan" }, { sc: "ES3", fullName: "Binh" }, { sc: "ES4", fullName: "Trùng" }, { sc: "ES5", fullName: "Trung" }];
  const schedules = { T1: { "1_2000": { t: "Minh Nghia" }, "1_2030": { t: "Minh Nghia" }, "3_0900": { t: "Lan, Binh, Nguoi La" }, "4_1000": { t: "Trung" }, "0_0600": { t: "Minh Nghia" } } };
  const r = SG.generateSessions({ schedules, students, from: "2026-11-23", to: "2026-11-29", existing: new Set(["ES2_2026-11-26"]) });   // 23/11/2026 la thu Hai
  const by = Object.fromEntries(r.sessions.map((s) => [s.id, s.data]));
  assert.deepEqual(Object.keys(by).sort(), ["ES1_2026-11-23", "ES1_2026-11-24"]);
  assert.equal(by["ES1_2026-11-24"].minutes, 50); assert.equal(by["ES1_2026-11-24"].time, "20:00"); assert.deepEqual(by["ES1_2026-11-24"].agencyIds, ["TEC"]);
  assert.equal(by["ES1_2026-11-23"].time, "06:00"); assert.equal(by["ES1_2026-11-23"].minutes, 25);
  assert.equal(r.skippedExisting, 1);                                                    // ES2_2026-11-26 da co
  assert.ok(!by["ES2_2026-11-26"]); assert.equal(r.sessions.length, 2 + 0);
  assert.ok(r.unresolved.some((u) => u.name === "Nguoi La" && u.reason === "missing") && r.unresolved.some((u) => u.name === "Trung" && u.reason === "ambiguous"));
  assert.deepEqual([...SG.dateRange("2026-11-29", "2026-12-01")].map((d) => d.iso + ":" + d.col), ["2026-11-29:6", "2026-11-30:0", "2026-12-01:1"]);
});
