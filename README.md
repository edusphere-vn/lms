# Edusphere LMS

LMS gọn cho trung tâm tiếng Anh (20 giáo viên, 200 học viên, ~3.000 buổi/tháng), ưu tiên công nghệ miễn phí:
Firebase (Auth + Firestore, gói Spark), Cloudflare Pages/Worker, GitHub. Tên miền: `lms.edusphere.vn`.

## Cấu trúc

- `public/` giao diện web tĩnh (đăng nhập, khung ứng dụng). Triển khai bằng Cloudflare Pages, thư mục xuất bản là `public`, không cần build.
- `firestore.rules` luật bảo mật theo vai trò (admin, teacher, student, agency).
- `tests/` kiểm thử luật bảo mật bằng Firestore emulator (`npm run test:rules`, cần Java).
- `worker/` Cloudflare Worker (tạo tài khoản, reset mật khẩu; chỉ admin gọi được). Kiểm thử: `npm run test:worker`.
- `scripts/bootstrap-admin.mjs` tạo tài khoản admin đầu tiên.
- `docs/DATA_MODEL.md` mô hình dữ liệu và quy tắc nghiệp vụ.

## Thiết lập lần đầu

1. Firebase console: bật Authentication > Email/Password; Firestore đã tạo ở asia-southeast1, production mode.
2. Đăng nhập Firebase CLI và đẩy luật: `npx firebase login` rồi `npx firebase deploy --only firestore:rules`.
3. Tạo admin đầu tiên bằng `scripts/bootstrap-admin.mjs` (xem hướng dẫn trong file). Không bao giờ commit file khóa service account.
4. Cloudflare Pages: kết nối repo này, build command để trống, output directory `public`. Sau đó gắn tên miền `lms.edusphere.vn`.

## Đăng nhập

Người dùng đăng nhập bằng tên đăng nhập + mật khẩu do admin cấp; Firebase Auth lưu dưới dạng `<tên>@lms.edusphere.vn` (email nội bộ, không gửi thư). Lần đầu bắt buộc đổi mật khẩu. Vai trò nằm trong custom claims do admin/Worker gán, người dùng không tự sửa được.

## Lộ trình

Giai đoạn 0 (đang làm): khung repo, luật bảo mật, đăng nhập, nhập dữ liệu 2026. Xem blueprint để biết các giai đoạn sau.

## Triển khai Worker

1. Firebase console > Project settings > Service accounts > Generate new private key (file JSON, chỉ để trên máy, không commit).
2. `cd worker && npx wrangler login`, rồi `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` và dán toàn bộ nội dung file JSON.
3. Sửa `ALLOWED_ORIGINS` trong `worker/wrangler.toml` thành domain thật của giao diện (lms.edusphere.vn và địa chỉ `*.pages.dev`), rồi `npx wrangler deploy`.
4. Worker xác minh ID token Firebase của người gọi (claim `role = admin`), tạo user với custom claims (role, teacherId/sc/agencyId), ghi `users/{uid}` và đặt `mustChangePassword`.
