# Xuất file báo cáo cũ sang LMS

Mục tiêu: đọc các file báo cáo học viên (Google Sheet, mỗi học viên một file) trong thư mục Drive, xuất thành một file JSON, rồi nhập vào LMS ở tab **Nhập báo cáo**.

Script chỉ **đọc** các file báo cáo, không sửa file nào. Kết quả nằm trong thư mục `LMS_Export` ở Drive của người chạy.

## Cài và chạy

1. Vào https://script.google.com, chọn **Dự án mới** (không dùng chung với script tính lương).
2. Tạo hai file: `ReportParser.gs` và `Export.gs`, dán nội dung từ `scripts/apps-script/` trong repo.
3. Trong `Export.gs`, kiểm tra `ROOT_FOLDER_ID` là thư mục gốc chứa các thư mục giáo viên.
4. Chọn hàm `thuTren5File`, bấm **Chạy**, đồng ý cấp quyền (Drive, Sheets, trigger). Xem **Nhật ký thực thi**: mỗi file hiện tên học viên, giáo viên, số tab RC, số buổi điểm danh, số cảnh báo.
5. Chọn hàm `batDauXuat`, bấm **Chạy**. Script tự chạy tiếp mỗi phút đến khi xong rồi tự gỡ bộ hẹn giờ. Có thể theo dõi trong Nhật ký thực thi.
6. Khi có dòng `XONG`, mở thư mục `LMS_Export`, tải `lms_reports_export.json`.
7. Vào LMS, tab **Nhập báo cáo**, chọn file vừa tải.

## Cách hệ thống hiểu file báo cáo

- Tab `General`: tên học viên, giáo viên, link Meet, bảng điểm Entrance/Exam 1-5 và lưới điểm danh.
- Các tab `RC1`, `RC2`...: các khối báo cáo từng buổi (ngày, trạng thái, giáo viên, Progress, Academic Performance, Class Participation) và khối Evaluation.
- Khối trống chỉ có sẵn chữ "Present" nhưng không có ngày và nội dung được bỏ qua.
- Buổi học được ghép giữa báo cáo và lưới điểm danh. Nếu số buổi tính (Present và Absent) hai bên bằng nhau thì ghép theo thứ tự, ngày trong điểm danh được ưu tiên và buổi bị lệch ngày được đánh dấu "cần kiểm". Nếu không bằng nhau thì ghép theo ngày, buổi lẻ được giữ lại và đánh dấu.
- Buổi Cancelled và Makeup chỉ có trong điểm danh, được nhập như buổi không tính vào RC. Số RC tính lại từ đầu: mỗi 10 buổi Present/Absent là một RC.
- Bảng điểm ở tab `General` là nguồn chính của đánh giá (Entrance là RC 0, Exam n là cuối RC n). Nhận xét lấy từ khối Evaluation có cùng điểm. Khối Evaluation không khớp bảng điểm bị bỏ qua (thường là điểm mặc định của mẫu).
- Điểm gõ sai dạng `.5.5` được đọc thành `5.5` và báo trong cảnh báo.

## Khi nhập vào LMS

- Học viên được ghép theo họ tên không dấu. Trùng tên hoặc không tìm thấy thì chọn tay trong bảng xem trước.
- Mặc định bỏ qua buổi học trước 2026-01-01.
- Mặc định không ghi đè buổi học và đánh giá đã có, nên nhập lại không làm mất chỉnh sửa của giáo viên.
- File có lỗi đọc được liệt kê cuối trang xem trước, và nằm trong danh sách `errors` của file JSON.
