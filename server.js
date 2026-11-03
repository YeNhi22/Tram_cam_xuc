// ============================================================
// Trung Tâm Cảm Xúc — server
// Cung cấp API /api/entries và phục vụ giao diện tĩnh (public/)
// ============================================================
require("dotenv").config(); // nạp .env (chỉ dùng khi chạy local)
const express = require("express");
const path = require("path");
const store = require("./store");

const app = express();
app.use(express.json({ limit: "1mb" }));

// Phục vụ giao diện (public/)
app.use(express.static(path.join(__dirname, "public")));

function todayISO() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Chuẩn hoá entry đầu vào, đảm bảo đủ trường
function normalizeEntry(body) {
  return {
    id: body && body.id ? String(body.id) : null,
    date: (body && body.date) || todayISO(),
    mood: body && body.mood ? String(body.mood) : null,
    title: body && body.title ? String(body.title) : "",
    text: body && body.text ? String(body.text) : "",
    createdAt: (body && body.createdAt) || new Date().toISOString(),
  };
}

// Lấy danh sách entry
app.get("/api/entries", async (_req, res) => {
  try {
    res.json(await store.listEntries());
  } catch (err) {
    console.error("Lỗi đọc entries:", err);
    res.status(500).json({ error: "Không đọc được dữ liệu" });
  }
});

// Tạo / cập nhật entry (upsert theo id)
app.post("/api/entries", async (req, res) => {
  try {
    const entry = normalizeEntry(req.body);
    if (!entry.id || !entry.text || !entry.mood) {
      return res.status(400).json({ error: "Thiếu id, mood hoặc nội dung" });
    }
    await store.upsertEntry(entry);
    res.status(201).json(entry);
  } catch (err) {
    console.error("Lỗi lưu entry:", err);
    res.status(500).json({ error: "Không lưu được" });
  }
});

// Xoá entry theo id
app.delete("/api/entries/:id", async (req, res) => {
  try {
    await store.deleteEntry(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Lỗi xoá entry:", err);
    res.status(500).json({ error: "Không xoá được" });
  }
});

const PORT = process.env.PORT || 3000;

store
  .initStore()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🌸 Trung Tâm Cảm Xúc đang chạy tại http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Không khởi tạo được kho dữ liệu:", err);
    process.exit(1);
  });
