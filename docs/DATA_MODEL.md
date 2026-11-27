# Mô hình dữ liệu (Firestore)

Nguồn: blueprint Edusphere Lite LMS, các quyết định của Peter ngày 26/11/2026.

| Collection | Khóa | Nội dung chính |
| --- | --- | --- |
| `config` | tên cài đặt | `sessions_per_rc`=10, `counts_toward_rc`=[Present, Absent], đơn giá lương (25p=100, 50p=200, vắng 25/50), lệch giờ Phil +1 |
| `users` | uid Auth | `username`, `displayName`, `role`, `teacherId`/`sc`/`agencyId`, `mustChangePassword` |
| `agencies` | agencyId | tên, liên hệ |
| `courses` | courseId | ESL_SP, IELTS_SP, ...; thang điểm `CEFR100` hoặc `IELTS_BAND`; tiêu chí chấm |
| `teachers` | teacherId | tên, ca làm việc (sáng/chiều/tối), đơn giá, trạng thái |
| `students` | SC (ES112) | họ tên, agencyId, `meetLink`, cờ mới/học thử, `teacherIds` (để giới hạn quyền xem) |
| `schedule` | teacherId | lịch tuần lặp lại của giáo viên: `cells` = {"<cột 0-6>_<HHMM>": {t: tên học viên (nhiều tên cách nhau dấu phẩy), k: na\|res}}, khung 30 phút giờ VN 06:00-23:30 (chỉ admin ghi, giáo viên xem lịch của mình) |
| `enrollments` | `<SC>_<ngày bắt đầu>` | sc, courseId, teacherId, số tuần, số buổi, 25/50 phút, ngày bắt đầu/kết thúc, New/Extend, trạng thái, Hold (hạn quay lại = buổi cuối + 14 tuần) |
| `billing` | cùng id với enrollment | hóa đơn, đã thu (chỉ admin, bổ sung sau) |
| `sessions` | id | ngày, giờ VN, độ dài, teacherId, `scs[]`, `agencyIds[]`, `attendance{sc: Present/Absent/Cancelled/Makeup}`, rcNo/rcSeq theo từng học viên, topic, lesson, vocabulary, homework, feedback, `makeupOf`, `locked` |
| `evaluations` | SC + số RC | Entrance hoặc Exam n (= cuối RC n), điểm từng tiêu chí, tổng, CEFR/Band, nhận xét, `status` Draft/Submitted/Approved |
| `public_reports` | mã bí mật dài | bản report hiện tại của 1 học viên (1 học viên 1 doc, ghi đè) |
| `rubrics` | thang + mức | bảng quy đổi điểm → CEFR/Band |
| `payroll_runs` | tháng + teacherId | số buổi theo trạng thái, số ca 25 phút, thành tiền (chỉ Worker ghi) |
| `audit_log` | tự tăng | ai, lúc nào, sửa gì |

## Quy tắc nghiệp vụ

- Mỗi RC đúng 10 buổi; chỉ Present và Absent được tính. Cancelled luôn có buổi bù (hoặc reschedule), hiện trong Attendance, không hiện trong Daily Report.
- Số RC của một buổi = ((thứ tự buổi tính của học viên − 1) div 10) + 1, đếm xuyên qua các gói Extend và các giáo viên.
- Lương: theo buổi (lớp nhóm cũng theo buổi). Vắng: 25 cho lớp 25 phút, 50 cho lớp 50 phút; một học viên vắng trong lớp nhóm vẫn trả đủ. Cancelled = 0.
- Giờ lưu theo giờ VN; giờ Phil = VN + 1 (tự tính, không nhập tay).
- Tháng đã chốt lương: `sessions.locked = true`, luật Firestore chặn sửa.

## Nhập dữ liệu (SL-Going)

- Mã SC là mã học viên: các gói Extend dùng lại cùng SC nên một học viên có nhiều `enrollments` (id = `<SC>_<ngày bắt đầu>`). Cột Paid/Invoice vào `billing` (giáo viên đọc được enrollments nên không để thông tin thu tiền ở đó).
- Dòng "cần kiểm" (Cancelled mà Paid, ngày kết thúc sớm hơn bắt đầu, khóa lạ, SC dùng cho học viên khác...) vẫn được nhập, mã cảnh báo lưu ở `enrollments.flags`.
- Nhập lại cùng file là an toàn: ghi theo id cố định với `merge`.
