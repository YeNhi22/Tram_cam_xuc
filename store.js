// ============================================================
// Kho dữ liệu
// - Có DATABASE_URL  -> dùng PostgreSQL (đồng bộ nhiều thiết bị)
// - Không có          -> dùng file JSON cục bộ (chạy thử trên máy)
// ============================================================
const fsp = require("fs").promises;
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "entries.json");

let pool = null;

// ---- File JSON cục bộ ----
async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, "[]", "utf8");
  }
}

async function fileReadAll() {
  await ensureDataFile();
  try {
    const arr = JSON.parse(await fsp.readFile(DATA_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function fileWriteAll(arr) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(DATA_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// ---- Khởi tạo ----
async function initStore() {
  if (DATABASE_URL) {
    const { Pool } = require("pg"); // chỉ nạp khi cần
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        mood TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log("✅ Đã kết nối PostgreSQL (đồng bộ nhiều thiết bị).");
  } else {
    await ensureDataFile();
    console.log("📦 Chạy bằng file JSON cục bộ: data/entries.json (chỉ trên máy này).");
  }
}

// ---- Đọc tất cả entry ----
async function listEntries() {
  if (DATABASE_URL) {
    const { rows } = await pool.query(
      "SELECT id, date, mood, title, text, created_at FROM entries ORDER BY date DESC, created_at DESC"
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      mood: r.mood,
      title: r.title || "",
      text: r.text,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  }
  const arr = await fileReadAll();
  return arr.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
}

// ---- Tạo / cập nhật (upsert theo id) ----
async function upsertEntry(entry) {
  if (DATABASE_URL) {
    await pool.query(
      `INSERT INTO entries (id, date, mood, title, text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date,
         mood = EXCLUDED.mood,
         title = EXCLUDED.title,
         text = EXCLUDED.text`,
      [entry.id, entry.date, entry.mood, entry.title, entry.text, entry.createdAt]
    );
    return;
  }
  const arr = await fileReadAll();
  const i = arr.findIndex((e) => e.id === entry.id);
  if (i >= 0) arr[i] = entry;
  else arr.push(entry);
  await fileWriteAll(arr);
}

// ---- Xoá theo id ----
async function deleteEntry(id) {
  if (DATABASE_URL) {
    await pool.query("DELETE FROM entries WHERE id = $1", [id]);
    return;
  }
  const arr = (await fileReadAll()).filter((e) => e.id !== id);
  await fileWriteAll(arr);
}

module.exports = { initStore, listEntries, upsertEntry, deleteEntry };
