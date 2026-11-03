# 🌸 Trung Tâm Cảm Xúc

Nhật ký cảm xúc cá nhân — ghi niềm vui, trút bực dọc. Hỗ trợ **đồng bộ qua nhiều thiết bị** (máy tính + điện thoại) nhờ backend + database online.

## Cấu trúc

- `server.js` — API `/api/entries` + phục vụ giao diện
- `store.js` — lớp lưu trữ (PostgreSQL nếu có `DATABASE_URL`, không thì file JSON cục bộ)
- `public/` — giao diện (HTML / CSS / JS)

## 1) Chạy thử trên máy (nhanh)

Cần Node.js ≥ 18 (tải tại https://nodejs.org).

```bash
npm install
npm start
```

Mở **http://localhost:3000** (mở qua trình duyệt, đừng mở file `index.html` trực tiếp).
Ở chế độ này dữ liệu lưu vào `data/entries.json` — chỉ trên máy này, chưa đồng bộ.

> Mẹo: muốn xem trên điện thoại ngay tại nhà (cùng WiFi), mở `http://<IP-máy-tính>:3000` trên điện thoại.

## 2) Đồng bộ máy + điện thoại (cùng một nhật ký)

Cần một database online (Neon — miễn phí) và một chỗ host backend (Render — miễn phí).

### Bước A — Tạo database online (Neon)
1. Đăng ký tại https://neon.tech (dùng Google/GitHub).
2. Tạo project mới → copy **connection string** (kiểu `postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require`).

### Bước B — Chạy local với database online
Tạo file `.env` ở thư mục này (dựa trên `.env.example`):
```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require
```
Rồi:
```bash
npm install
npm start
```
Giờ dữ liệu đã lưu trên cloud.

### Bước C — Cài Git và đẩy code lên GitHub
1. Cài Git: tải tại https://git-scm.com/downloads (chọn Windows). Cài xong mở lại terminal.
2. Đăng ký tài khoản GitHub tại https://github.com (nếu chưa có).
3. Trên GitHub: bấm **New repository** → đặt tên (vd `trung-tam-cam-xuc`) → **Create** (để Public, không tick README).
4. Trong thư mục dự án, chạy lệnh (thay `ten-ban` bằng tên GitHub của bạn):
```bash
git init
git add .
git commit -m "Khởi tạo ứng dụng"
git branch -M main
git remote add origin https://github.com/ten-ban/trung-tam-cam-xuc.git
git push -u origin main
```
> Khi push, Git sẽ hỏi đăng nhập — dùng **Personal Access Token** (GitHub → Settings → Developer settings → Tokens) làm mật khẩu, không dùng mật khẩu GitHub.

### Bước D — Deploy lên Render để điện thoại truy cập
1. Vào https://render.com → **New → Web Service** → kết nối repo GitHub vừa push.
2. Cấu hình:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Mục **Environment** → thêm biến: `DATABASE_URL` = chuỗi kết nối Neon (giống Bước A).
4. Deploy xong, Render cấp URL kiểu `https://ten-ban.onrender.com` — mở trên điện thoại, dùng được liền, **cùng nhật ký với máy**.
5. Trên điện thoại: mở URL → trình duyệt thường có mục **"Thêm vào màn hình chính"** — app sẽ chạy toàn màn hình như app thật.

## Cài app lên màn hình điện thoại (PWA)

App đã hỗ trợ PWA nên sau khi mở URL trên điện thoại:
- **Android (Chrome):** menu ⋮ → **Add to Home screen** → sẽ hiện biểu tượng hoa 🌸 trên màn hình, mở như app.
- **iPhone (Safari):** nút Share → **Add to Home Screen** → tương tự.

App này sẽ mở toàn màn hình, có biểu tượng riêng — không khác gì app tải về.

## Sao lưu

Trong app có nút **"Tải về máy"** (xuất file JSON) và **"Nhập lại"** — giữ bản sao phòng khi cần.

## Lưu ý riêng tư

- Dữ liệu nằm trong database Neon của bạn + backend Render của bạn. Không bên thứ ba nào khác xem được.
- Muốn khoá riêng tư hơn, có thể thêm mật khẩu truy cập sau.
