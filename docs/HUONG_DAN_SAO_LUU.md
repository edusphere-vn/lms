# Sao lưu Firestore ra Google Sheet mỗi đêm

Firestore là cơ sở dữ liệu chính. Script này chỉ **đọc** và chép mỗi collection vào một tab của một Google Sheet (cột `id` và `json`), để có một bản dự phòng nằm trong Google Drive của anh.

1. Tạo một Google Sheet trống, chép **ID** từ địa chỉ (đoạn giữa `/d/` và `/edit`).
2. Firebase console, Project settings, Service accounts, **Generate new private key**. File JSON tải về có `client_email` và `private_key`.
   Để chỉ đọc, nên tạo service account riêng trong Google Cloud console (IAM) với vai trò **Cloud Datastore Viewer**; dùng khóa của service account đó thay vì khóa admin.
3. Vào script.google.com, tạo dự án mới, dán nội dung `scripts/apps-script/Backup.gs`.
4. Project Settings, Script Properties, thêm 4 mục: `PROJECT_ID` = `esvn-lms`, `SHEET_ID`, `SA_EMAIL` = `client_email`, `SA_KEY` = `private_key` (dán nguyên văn, kể cả `-----BEGIN...`).
5. Chạy hàm `saoLuuNgay` một lần (cấp quyền khi được hỏi), kiểm tra Sheet đã có các tab.
6. Chạy hàm `datLichMoiDem` một lần để hẹn chạy mỗi ngày lúc 2 giờ sáng.

Không dán khóa vào chat hay commit vào repo. Nếu cần sao lưu ngay, vào admin, tab Cài đặt, bấm **Tải bản sao lưu (JSON)**.
