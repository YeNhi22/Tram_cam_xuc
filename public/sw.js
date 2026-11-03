/* ============================================================
   Service Worker — lưu tạm giao diện để mở nhanh trên điện thoại
   - API (/api/*): luôn gọi mạng, không lưu (dữ liệu phải tươi)
   - Trang + file tĩnh: lưu tạm, mở lại nhanh ngay cả khi mạng chậm
   Khi cập nhật code, đổi VERSION bên dưới để xoá cache cũ.
   ============================================================ */
const VERSION = "v2";
const CACHE = "camxuc-shell-" + VERSION;
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API luôn đi mạng, không lưu tạm
  if (url.pathname.startsWith("/api/")) return;
  // Chỉ xử lý GET
  if (e.request.method !== "GET") return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          // Lưu bản mới vào cache (bỏ qua nếu không ok / không cùng gốc)
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      // Có cache thì trả cache trước, cập nhật nền; không thì đợi mạng
      return cached || fetchPromise;
    })
  );
});
