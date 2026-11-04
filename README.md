# 🌸 Trung Tâm Cảm Xúc

Nhật ký cảm xúc cá nhân — ghi niềm vui, trút bực dọc, kết nối bạn bè. Hỗ trợ **đồng bộ qua nhiều thiết bị** (máy tính + điện thoại) nhờ backend Node.js + database PostgreSQL (Neon) hoặc file JSON cục bộ.

---

## 🌟 Các tính năng chính

1. **Đăng ký & Đăng nhập**:
   - Quản lý tài khoản cá nhân an toàn (mật khẩu mã hoá `scrypt` kèm salt ngẫu nhiên).
   - Tự động ghi nhớ phiên đăng nhập qua token.

2. **Ghi nhật ký & Chia sẻ có chọn lọc**:
   - Chọn tâm trạng (Vui 😊, Bực 😤, Buồn 😔, Bình thường 😌).
   - Đính kèm thẻ tag (`#gia-dinh`, `#cong-viec`,...).
   - **Tùy chọn chia sẻ**: Tìm và chọn người muốn chia sẻ bằng tên hoặc `@username`. Nếu để trống, bài viết là **hoàn toàn riêng tư**, chỉ mình bạn xem được.

3. **Bảng tin (Feed)**:
   - Nơi xem những bài viết mà bạn bè hoặc người khác đã chia sẻ cho bạn.
   - Nút **"💬 Nhắn tin"** cạnh bài viết để ngay lập tức mở cuộc trò chuyện riêng với tác giả.

4. **Tải ảnh & Video lên**:
   - Cho phép tải lên tối đa 6 tệp đa phương tiện (ảnh hoặc video, dung lượng mỗi tệp lên đến 20MB).
   - Xem video trực tiếp với trình phát video tích hợp.
   - Bấm vào ảnh để phóng to toàn màn hình (lightbox xem ảnh).

5. **Thông báo**:
   - Chuông thông báo 🔔 trên thanh điều hướng với huy hiệu đếm thông báo chưa đọc.
   - Nhận thông báo tức thì khi ai đó chia sẻ entry với bạn hoặc gửi tin nhắn cho bạn.
   - Bấm vào thông báo sẽ tự động chuyển đến bài viết hoặc cuộc trò chuyện tương ứng.

6. **Trò chuyện 2 người & Giữ chuỗi liên tiếp (Streak 🔥)**:
   - Trò chuyện riêng tư giữa 2 người dùng.
   - Nhắn tin cho nhau mỗi ngày để thắp sáng và tích lũy chuỗi ngày liên tiếp (`🔥 X ngày`).
   - Tìm kiếm người dùng trực tiếp trong giao diện trò chuyện để bắt đầu cuộc trò chuyện mới.

7. **Khôi phục chuỗi (5 lần / tháng)**:
   - Nếu quá 24 giờ không ai nhắn tin, chuỗi sẽ bị đánh dấu đứt (`💔`).
   - Mỗi người dùng được cấp **5 lượt khôi phục chuỗi mỗi tháng**.
   - Bấm nút **"🔄 Khôi phục chuỗi"** để hồi sinh lại số ngày chuỗi đã đạt được!

8. **Thống kê & Tiện ích khác**:
   - Biểu đồ cảm xúc 7 ngày & 30 ngày.
   - "Ngày này năm ngoái" (On this day) để ôn lại kỷ niệm.
   - Tóm tắt cảm xúc tháng này.
   - Chế độ Sáng / Tối (Dark mode) & 4 giao diện màu pastel dễ thương (Hồng, Tím, Mint, Vàng).
   - Hiệu ứng pháo hoa giấy (confetti), cánh hoa rơi (particles) và âm thanh vui tai.
   - Hỗ trợ PWA: Cài đặt lên màn hình chính điện thoại như ứng dụng native.

---

## 🚀 Hướng dẫn khởi chạy

### Cách 1: Chạy trực tiếp trên Windows (dùng sẵn Node tích hợp)
Chạy file script `node.bat`:
```powershell
.\node.bat server.js
```

### Cách 2: Chạy bằng lệnh chuẩn Node.js
```bash
npm install
npm start
```
Mở trình duyệt truy cập: **http://localhost:3000**

---

## 🗄️ Cấu trúc dữ liệu & Biến môi trường

Trong file `.env`:
```env
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
PORT=3000
```
- Nếu có `DATABASE_URL`: Ứng dụng tự động kết nối Neon PostgreSQL (đồng bộ toàn bộ tài khoản, bài viết, tin nhắn, chuỗi và thông báo giữa các thiết bị).
- Nếu không có: Ứng dụng tự động lưu vào file JSON cục bộ trong thư mục `data/`.
