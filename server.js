// ============================================================
// Trung Tâm Cảm Xúc — server
// API: auth (đăng ký/đăng nhập), entries (+ chia sẻ + đính kèm),
//      feed, notifications, conversations/messages (chat + chuỗi),
//      upload ảnh/video (base64, không cần thêm gói).
// Phục vụ giao diện tĩnh trong public/.
// ============================================================
require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs").promises;
const crypto = require("crypto");
const store = require("./store");

const app = express();
app.use(express.json({ limit: "30mb" })); // cho phép upload base64

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Phục vụ giao diện (public/)
app.use(express.static(path.join(__dirname, "public")));

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function newId() { return Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); }

/* ---------- auth middleware ---------- */
async function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const userId = token ? await store.getSession(token) : null;
  if (!userId) return res.status(401).json({ error: "Chưa đăng nhập" });
  const u = await store.getUserById(userId);
  if (!u) return res.status(401).json({ error: "Phiên hết hạn, hãy đăng nhập lại" });
  req.token = token;
  req.userId = userId;
  req.user = store.safeUser(u);
  next();
}

/* ============================================================
   AUTH
============================================================ */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, displayName } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Thiếu tên đăng nhập hoặc mật khẩu" });
    const u = await store.createUser({ username, password, displayName });
    const token = await store.createSession(u.id);
    res.json({ token, user: u });
  } catch (err) {
    res.status(400).json({ error: err.message || "Không đăng ký được" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Thiếu tên đăng nhập hoặc mật khẩu" });
    const u = await store.findUserByUsername(String(username || "").toLowerCase());
    if (!u || !store.verifyPassword(String(password || ""), u.passwordHash))
      return res.status(401).json({ error: "Sai tên đăng nhập hoặc mật khẩu" });
    const token = await store.createSession(u.id);
    res.json({ token, user: store.safeUser(u) });
  } catch (err) {
    console.error("Lỗi đăng nhập:", err);
    res.status(500).json({ error: "Lỗi đăng nhập" });
  }
});

app.post("/api/auth/logout", auth, async (req, res) => {
  if (req.token) await store.deleteSession(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, async (req, res) => res.json({ user: req.user }));

/* ============================================================
   USERS (tìm bạn bè để chia sẻ / nhắn tin)
============================================================ */
app.get("/api/users/search", auth, async (req, res) => {
  try { res.json(await store.searchUsers(req.query.q || "", req.userId)); }
  catch (err) { res.status(500).json({ error: "Không tìm được" }); }
});

app.get("/api/users/batch", auth, async (req, res) => {
  try {
    const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean);
    res.json(await store.batchGetUsers(ids));
  } catch (err) { res.status(500).json({ error: "Không lấy được" }); }
});

/* ============================================================
   ENTRIES (cá nhân + chia sẻ + đính kèm)
============================================================ */
app.get("/api/entries", auth, async (req, res) => {
  try { res.json(await store.listMyEntries(req.userId)); }
  catch (err) { console.error(err); res.status(500).json({ error: "Không đọc được dữ liệu" }); }
});

app.post("/api/entries", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const entry = {
      id: b.id ? String(b.id) : newId(),
      date: b.date || todayISO(),
      mood: b.mood ? String(b.mood) : null,
      title: b.title ? String(b.title) : "",
      text: b.text ? String(b.text) : "",
      tags: Array.isArray(b.tags) ? b.tags : [],
      sharedWith: Array.isArray(b.sharedWith) ? b.sharedWith.filter(x => typeof x === "string") : [],
      attachments: Array.isArray(b.attachments) ? b.attachments : [],
      createdAt: b.createdAt || new Date().toISOString(),
    };
    if (!entry.mood || !entry.text) return res.status(400).json({ error: "Thiếu mood hoặc nội dung" });
    await store.upsertEntry(entry, req.userId);
    res.status(201).json(entry);
  } catch (err) {
    console.error("Lỗi lưu entry:", err);
    res.status(400).json({ error: err.message || "Không lưu được" });
  }
});

app.delete("/api/entries/:id", auth, async (req, res) => {
  try {
    await store.deleteEntry(req.params.id, req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Lỗi xoá entry:", err);
    res.status(400).json({ error: err.message || "Không xoá được" });
  }
});

/* ============================================================
   FEED — những entry người khác chia sẻ với mình
============================================================ */
app.get("/api/feed", auth, async (req, res) => {
  try { res.json(await store.listFeed(req.userId)); }
  catch (err) { console.error(err); res.status(500).json({ error: "Không đọc được feed" }); }
});

/* ============================================================
   NOTIFICATIONS
============================================================ */
app.get("/api/notifications", auth, async (req, res) => {
  try { res.json(await store.listNotifications(req.userId)); }
  catch (err) { res.status(500).json({ error: "Không đọc được" }); }
});

app.get("/api/notifications/unread-count", auth, async (req, res) => {
  try { res.json({ count: await store.unreadCount(req.userId) }); }
  catch (err) { res.status(500).json({ error: "Không đọc được" }); }
});

app.post("/api/notifications/:id/read", auth, async (req, res) => {
  try { await store.markNotificationRead(req.params.id, req.userId); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: "Không cập nhật được" }); }
});

/* ============================================================
   UPLOAD (base64 — không cần multer)
============================================================ */
app.post("/api/upload", auth, async (req, res) => {
  try {
    const { data, name } = req.body || {};
    if (!data || typeof data !== "string") return res.status(400).json({ error: "Thiếu dữ liệu file" });
    const m = data.match(/^data:(image|video)\/([\w.+-]+);base64,(.+)$/i);
    if (!m) return res.status(400).json({ error: "Chỉ hỗ trợ ảnh hoặc video" });
    const kind = m[1].toLowerCase();
    const ext = m[2].toLowerCase().replace(/[^a-z0-9.+-]/g, "").split("+")[0] || kind;
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 20 * 1024 * 1024) return res.status(413).json({ error: "File quá lớn (tối đa 20MB)" });
    const id = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
    const filename = `${id}.${ext}`;
    await fsp.writeFile(path.join(UPLOAD_DIR, filename), buf);
    await store.saveMedia({ id, ownerId: req.userId, filename, originalName: name || "", mimeType: `${kind}/${ext}` });
    res.status(201).json({ id, url: "/uploads/" + filename, type: kind, name: name || filename });
  } catch (err) {
    console.error("Lỗi upload:", err);
    res.status(500).json({ error: "Không tải lên được" });
  }
});

/* ============================================================
   CONVERSATIONS / MESSAGES (chat 2 người + chuỗi)
============================================================ */
app.get("/api/conversations", auth, async (req, res) => {
  try { res.json(await store.listConversations(req.userId)); }
  catch (err) { res.status(500).json({ error: "Không đọc được" }); }
});

app.post("/api/conversations", auth, async (req, res) => {
  try {
    const otherId = String((req.body || {}).otherUserId || "");
    if (!otherId) return res.status(400).json({ error: "Thiếu người nhận" });
    if (otherId === req.userId) return res.status(400).json({ error: "Không thể tự nhắn cho chính mình" });
    const conv = await store.getOrCreateConversation(req.userId, otherId);
    const other = await store.getUserById(otherId);
    res.json(store.withConvMeta({
      ...conv,
      otherId,
      otherName: other ? other.displayName : "Người dùng",
    }));
  } catch (err) { res.status(400).json({ error: err.message || "Không tạo được" }); }
});

app.get("/api/conversations/:id/messages", auth, async (req, res) => {
  try { res.json(await store.listMessages(req.params.id, req.userId)); }
  catch (err) { res.status(403).json({ error: err.message }); }
});

app.post("/api/conversations/:id/messages", auth, async (req, res) => {
  try {
    const text = String((req.body || {}).text || "");
    const result = await store.sendMessage(req.params.id, req.userId, text);
    res.status(201).json(result);
  } catch (err) { res.status(400).json({ error: err.message || "Không gửi được" }); }
});

app.post("/api/conversations/:id/restore", auth, async (req, res) => {
  try {
    const conv = await store.restoreStreak(req.params.id, req.userId);
    res.json(conv);
  } catch (err) { res.status(400).json({ error: err.message || "Không khôi phục được" }); }
});

const PORT = process.env.PORT || 3000;

store.initStore().then(() => {
  app.listen(PORT, () => {
    console.log(`🌸 Trung Tâm Cảm Xúc đang chạy tại http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Không khởi tạo được kho dữ liệu:", err);
  process.exit(1);
});
