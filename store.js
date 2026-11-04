// ============================================================
// Trung Tâm Cảm Xúc — store.js
// Lớp dữ liệu thống nhất:
//   - Có DATABASE_URL -> PostgreSQL (đồng bộ nhiều thiết bị)
//   - Không có         -> file JSON cục bộ (data/*.json)
// Bao gồm: users, sessions, entries (+ chia sẻ + đính kèm),
//          notifications, conversations, messages (chat + chuỗi),
//          media.
// ============================================================
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
const USE_PG = !!DATABASE_URL;

const DATA_DIR = path.join(__dirname, "data");

let pool = null;

/* ---------- file JSON cục bộ ---------- */
async function ensureFile(name) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  try { await fsp.access(file); }
  catch { await fsp.writeFile(file, "[]", "utf8"); }
}
async function readCol(name) {
  await ensureFile(name);
  try {
    const a = JSON.parse(await fsp.readFile(path.join(DATA_DIR, `${name}.json`), "utf8"));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
async function writeCol(name, arr) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(arr, null, 2), "utf8");
}

/* ---------- khởi tạo ---------- */
async function initStore() {
  if (USE_PG) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        mood TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        tags JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE entries ADD COLUMN IF NOT EXISTS owner_id TEXT;
      ALTER TABLE entries ADD COLUMN IF NOT EXISTS shared_with JSONB NOT NULL DEFAULT '[]';
      ALTER TABLE entries ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        from_id TEXT,
        from_name TEXT,
        ref_id TEXT,
        message TEXT,
        read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_a TEXT NOT NULL,
        user_b TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        streak INTEGER NOT NULL DEFAULT 0,
        last_active_day TEXT,
        last_message_at TIMESTAMPTZ,
        restores_by_month JSONB NOT NULL DEFAULT '{}'
      );
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS previous_streak INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT,
        mime_type TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_entries_owner ON entries(owner_id);
      CREATE INDEX IF NOT EXISTS idx_entries_shared ON entries USING gin(shared_with);
      CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_conv_users ON conversations(user_a, user_b);
      CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
    `);
    console.log("✅ Đã kết nối PostgreSQL (đồng bộ nhiều thiết bị).");
  } else {
    for (const n of ["entries", "users", "sessions", "notifications", "conversations", "messages", "media"])
      await ensureFile(n);
    console.log("📦 Chạy bằng file JSON cục bộ trong data/ (chỉ trên máy này).");
  }
}

/* ---------- utils ---------- */
function newId() { return Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); }
function newToken() { return crypto.randomBytes(32).toString("hex"); }
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${h}`;
}
function verifyPassword(pw, stored) {
  try {
    const [salt, h] = stored.split(":");
    const c = crypto.scryptSync(pw, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(c, "hex"), Buffer.from(h, "hex"));
  } catch { return false; }
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ym() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function canon(a, b) { return a < b ? [a, b] : [b, a]; }
function isBroken(lastAt) {
  if (!lastAt) return false;
  const t = typeof lastAt === "string" ? new Date(lastAt) : lastAt;
  if (isNaN(t.getTime())) return false;
  return (Date.now() - t.getTime()) > 24 * 3600 * 1000;
}
function safeUser(u) {
  return u ? {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.display_name || u.username,
    createdAt: u.createdAt || u.created_at
  } : null;
}

/* ---------- USERS ---------- */
async function findUserByUsername(username) {
  username = String(username || "").trim().toLowerCase();
  if (USE_PG) {
    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      username: rows[0].username,
      passwordHash: rows[0].password_hash,
      displayName: rows[0].display_name,
      createdAt: rows[0].created_at,
    };
  }
  return (await readCol("users")).find(u => u.username === username) || null;
}
async function getUserById(id) {
  if (USE_PG) {
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      username: rows[0].username,
      passwordHash: rows[0].password_hash,
      displayName: rows[0].display_name,
      createdAt: rows[0].created_at,
    };
  }
  return (await readCol("users")).find(u => u.id === id) || null;
}
async function createUser({ username, password, displayName }) {
  username = String(username || "").trim().toLowerCase();
  if (!username || !password) throw new Error("Thiếu tên đăng nhập hoặc mật khẩu");
  if (username.length < 3) throw new Error("Tên đăng nhập cần ít nhất 3 ký tự");
  if (password.length < 4) throw new Error("Mật khẩu cần ít nhất 4 ký tự");
  if (await findUserByUsername(username)) throw new Error("Tên đăng nhập đã có người dùng");
  const user = {
    id: newId(),
    username,
    passwordHash: hashPassword(password),
    displayName: (displayName || username).trim(),
    createdAt: new Date().toISOString(),
  };
  if (USE_PG) {
    await pool.query(
      "INSERT INTO users (id,username,password_hash,display_name,created_at) VALUES ($1,$2,$3,$4,$5)",
      [user.id, user.username, user.passwordHash, user.displayName, user.createdAt]
    );
  } else {
    const a = await readCol("users"); a.push(user); await writeCol("users", a);
  }
  return safeUser(user);
}
async function searchUsers(q, excludeId) {
  const term = String(q || "").trim().toLowerCase();
  if (USE_PG) {
    const { rows } = await pool.query(
      "SELECT id,username,display_name FROM users WHERE ($1='' OR LOWER(username) LIKE $2 OR LOWER(display_name) LIKE $2) AND id<>$3 ORDER BY display_name LIMIT 20",
      [term, `%${term}%`, excludeId]
    );
    return rows.map(r => ({ id: r.id, username: r.username, displayName: r.display_name }));
  }
  const a = (await readCol("users"))
    .filter(u => u.id !== excludeId && (!term || u.username.includes(term) || (u.displayName || "").toLowerCase().includes(term)))
    .slice(0, 20);
  return a.map(safeUser);
}
async function batchGetUsers(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return [];
  if (USE_PG) {
    const { rows } = await pool.query("SELECT id,display_name FROM users WHERE id = ANY($1::text[])", [uniq]);
    return rows.map(r => ({ id: r.id, displayName: r.display_name }));
  }
  return (await readCol("users")).filter(u => uniq.includes(u.id)).map(safeUser);
}

/* ---------- SESSIONS ---------- */
async function createSession(userId) {
  const token = newToken();
  if (USE_PG) await pool.query("INSERT INTO sessions (token,user_id,created_at) VALUES ($1,$2,$3)", [token, userId, new Date().toISOString()]);
  else { const a = await readCol("sessions"); a.push({ token, userId, createdAt: new Date().toISOString() }); await writeCol("sessions", a); }
  return token;
}
async function getSession(token) {
  if (!token) return null;
  if (USE_PG) { const { rows } = await pool.query("SELECT user_id FROM sessions WHERE token=$1", [token]); return rows[0] ? rows[0].user_id : null; }
  const s = (await readCol("sessions")).find(x => x.token === token);
  return s ? s.userId : null;
}
async function deleteSession(token) {
  if (!token) return;
  if (USE_PG) await pool.query("DELETE FROM sessions WHERE token=$1", [token]);
  else { const a = (await readCol("sessions")).filter(x => x.token !== token); await writeCol("sessions", a); }
}

/* ---------- ENTRIES ---------- */
function rowToEntry(r) {
  return {
    id: r.id, date: r.date, mood: r.mood, title: r.title || "",
    text: r.text, tags: Array.isArray(r.tags) ? r.tags : [],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    ownerId: r.owner_id, sharedWith: Array.isArray(r.shared_with) ? r.shared_with : [],
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
  };
}
async function getEntry(id) {
  if (USE_PG) { const { rows } = await pool.query("SELECT * FROM entries WHERE id=$1", [id]); return rows[0] ? rowToEntry(rows[0]) : null; }
  return (await readCol("entries")).find(e => e.id === id) || null;
}
async function listMyEntries(userId) {
  if (USE_PG) {
    const { rows } = await pool.query("SELECT * FROM entries WHERE owner_id=$1 ORDER BY date DESC, created_at DESC", [userId]);
    return rows.map(rowToEntry);
  }
  return (await readCol("entries"))
    .filter(e => e.ownerId === userId)
    .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.createdAt < a.createdAt ? -1 : 1)));
}
async function listFeed(userId) {
  if (USE_PG) {
    const { rows } = await pool.query(
      `SELECT e.*, u.display_name AS owner_name FROM entries e
       LEFT JOIN users u ON u.id = e.owner_id
       WHERE e.shared_with @> $1::jsonb ORDER BY e.created_at DESC`,
      [JSON.stringify([userId])]
    );
    return rows.map(r => ({ ...rowToEntry(r), ownerName: r.owner_name }));
  }
  const users = await readCol("users");
  return (await readCol("entries"))
    .filter(e => Array.isArray(e.sharedWith) && e.sharedWith.includes(userId))
    .map(e => ({ ...e, ownerName: (users.find(u => u.id === e.ownerId) || {}).displayName || "Unknown" }))
    .sort((a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0));
}
async function upsertEntry(entry, userId) {
  const existing = await getEntry(entry.id);
  if (existing && existing.ownerId && existing.ownerId !== userId)
    throw new Error("Không có quyền sửa entry này");
  const oldShared = existing && Array.isArray(existing.sharedWith) ? existing.sharedWith : [];
  entry.ownerId = userId;
  entry.sharedWith = (Array.isArray(entry.sharedWith) ? entry.sharedWith : []).filter(x => typeof x === "string");
  entry.attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
  const added = entry.sharedWith.filter(u => !oldShared.includes(u) && u !== userId);

  if (USE_PG) {
    await pool.query(
      `INSERT INTO entries (id,date,mood,title,text,tags,created_at,owner_id,shared_with,attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         date=EXCLUDED.date, mood=EXCLUDED.mood, title=EXCLUDED.title, text=EXCLUDED.text,
         tags=EXCLUDED.tags, owner_id=COALESCE(entries.owner_id, EXCLUDED.owner_id),
         shared_with=EXCLUDED.shared_with, attachments=EXCLUDED.attachments`,
      [entry.id, entry.date, entry.mood, entry.title, entry.text,
       JSON.stringify(entry.tags || []), entry.createdAt, userId,
       JSON.stringify(entry.sharedWith), JSON.stringify(entry.attachments)]
    );
  } else {
    const a = await readCol("entries");
    const i = a.findIndex(e => e.id === entry.id);
    const rec = { ...entry, tags: entry.tags || [], ownerId: userId, sharedWith: entry.sharedWith, attachments: entry.attachments };
    if (i >= 0) a[i] = rec; else a.push(rec);
    await writeCol("entries", a);
  }

  if (added.length) {
    const sharer = await getUserById(userId);
    for (const rid of added) {
      await createNotification({
        userId: rid, type: "share", fromId: userId,
        fromName: sharer ? sharer.displayName : "", refId: entry.id,
        message: `${sharer ? sharer.displayName : "Ai đó"} đã chia sẻ một entry với bạn`,
      });
    }
  }
  return entry;
}
async function deleteEntry(id, userId) {
  const e = await getEntry(id);
  if (!e) return false;
  if (e.ownerId !== userId) throw new Error("Không có quyền xoá");
  if (USE_PG) await pool.query("DELETE FROM entries WHERE id=$1", [id]);
  else { const a = (await readCol("entries")).filter(x => x.id !== id); await writeCol("entries", a); }
  return true;
}

/* ---------- NOTIFICATIONS ---------- */
function rowToNotif(r) {
  return {
    id: r.id, userId: r.user_id, type: r.type, fromId: r.from_id,
    fromName: r.from_name, refId: r.ref_id, message: r.message, read: r.read,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}
async function createNotification(n) {
  const rec = {
    id: newId(), userId: n.userId, type: n.type, fromId: n.fromId || null,
    fromName: n.fromName || "", refId: n.refId || null, message: n.message || "",
    read: false, createdAt: new Date().toISOString(),
  };
  if (USE_PG) {
    await pool.query(
      "INSERT INTO notifications (id,user_id,type,from_id,from_name,ref_id,message,read,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8)",
      [rec.id, rec.userId, rec.type, rec.fromId, rec.fromName, rec.refId, rec.message, rec.createdAt]
    );
  } else { const a = await readCol("notifications"); a.push(rec); await writeCol("notifications", a); }
  return rec;
}
async function listNotifications(userId) {
  if (USE_PG) {
    const { rows } = await pool.query("SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [userId]);
    return rows.map(rowToNotif);
  }
  return (await readCol("notifications")).filter(n => n.userId === userId)
    .sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1)).slice(0, 50);
}
async function markNotificationRead(id, userId) {
  if (USE_PG) await pool.query("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2", [id, userId]);
  else { const a = await readCol("notifications"); const n = a.find(x => x.id === id && x.userId === userId); if (n) n.read = true; await writeCol("notifications", a); }
}
async function unreadCount(userId) {
  if (USE_PG) { const { rows } = await pool.query("SELECT count(*)::int AS c FROM notifications WHERE user_id=$1 AND read=false", [userId]); return rows[0].c; }
  return (await readCol("notifications")).filter(n => n.userId === userId && !n.read).length;
}

/* ---------- CONVERSATIONS / MESSAGES ---------- */
function rowToConv(r) {
  return {
    id: r.id, userA: r.user_a, userB: r.user_b,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    streak: r.streak || 0,
    previousStreak: r.previous_streak || 0,
    lastActiveDay: r.last_active_day,
    lastMessageAt: r.last_message_at instanceof Date ? r.last_message_at.toISOString() : r.last_message_at,
    restoresByMonth: r.restores_by_month && typeof r.restores_by_month === "object" ? r.restores_by_month : {},
  };
}
function withConvMeta(c) {
  c.broken = isBroken(c.lastMessageAt);
  const m = ym();
  c.restoresUsed = c.restoresByMonth[m] || 0;
  c.restoresLeft = Math.max(0, 5 - c.restoresUsed);
  return c;
}
async function getOrCreateConversation(userA, userB) {
  const [a, b] = canon(userA, userB);
  if (a === b) throw new Error("Không thể tự trò chuyện với chính mình");
  if (USE_PG) {
    const { rows } = await pool.query("SELECT * FROM conversations WHERE user_a=$1 AND user_b=$2", [a, b]);
    if (rows[0]) return rowToConv(rows[0]);
    const conv = { id: newId(), userA: a, userB: b, createdAt: new Date().toISOString(), streak: 0, lastActiveDay: null, lastMessageAt: null, restoresByMonth: {} };
    await pool.query(
      "INSERT INTO conversations (id,user_a,user_b,created_at,streak,last_active_day,last_message_at,restores_by_month) VALUES ($1,$2,$3,$4,0,NULL,NULL,$5)",
      [conv.id, a, b, conv.createdAt, JSON.stringify({})]
    );
    return conv;
  }
  let arr = await readCol("conversations");
  let conv = arr.find(c => c.userA === a && c.userB === b);
  if (conv) return conv;
  conv = { id: newId(), userA: a, userB: b, createdAt: new Date().toISOString(), streak: 0, lastActiveDay: null, lastMessageAt: null, restoresByMonth: {} };
  arr.push(conv); await writeCol("conversations", arr);
  return conv;
}
async function getConversationForUser(id, userId) {
  let conv;
  if (USE_PG) { const { rows } = await pool.query("SELECT * FROM conversations WHERE id=$1", [id]); conv = rows[0] ? rowToConv(rows[0]) : null; }
  else conv = (await readCol("conversations")).find(c => c.id === id) || null;
  if (!conv) return null;
  if (conv.userA !== userId && conv.userB !== userId) return null;
  return conv;
}
async function listConversations(userId) {
  let list;
  if (USE_PG) {
    const { rows } = await pool.query("SELECT * FROM conversations WHERE user_a=$1 OR user_b=$1 ORDER BY last_message_at DESC NULLS LAST", [userId]);
    list = rows.map(rowToConv);
  } else {
    list = (await readCol("conversations")).filter(c => c.userA === userId || c.userB === userId)
      .sort((a, b) => (b.lastMessageAt || "") < (a.lastMessageAt || "") ? -1 : (b.lastMessageAt || "") > (a.lastMessageAt || "") ? 1 : 0);
  }
  const usersCache = USE_PG ? null : await readCol("users");
  const enriched = [];
  for (const c of list) {
    const otherId = c.userA === userId ? c.userB : c.userA;
    let otherName = "?";
    if (USE_PG) { const { rows } = await pool.query("SELECT display_name FROM users WHERE id=$1", [otherId]); otherName = rows[0] ? rows[0].display_name : "?"; }
    else { const u = usersCache.find(u => u.id === otherId); otherName = u ? u.displayName : "?"; }
    enriched.push(withConvMeta({ ...c, otherId, otherName }));
  }
  return enriched;
}
async function listMessages(conversationId, userId) {
  const conv = await getConversationForUser(conversationId, userId);
  if (!conv) throw new Error("Không có quyền xem cuộc trò chuyện này");
  if (USE_PG) {
    const { rows } = await pool.query("SELECT id,conversation_id,sender_id,text,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 200", [conversationId]);
    return rows.map(r => ({ id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, text: r.text, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at }));
  }
  return (await readCol("messages")).filter(m => m.conversationId === conversationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)).slice(-200);
}
async function sendMessage(conversationId, senderId, text) {
  const conv = await getConversationForUser(conversationId, senderId);
  if (!conv) throw new Error("Không có quyền");
  text = String(text || "").trim();
  if (!text) throw new Error("Tin nhắn trống");
  const msg = { id: newId(), conversationId, senderId, text, createdAt: new Date().toISOString() };
  const now = new Date();
  const today = todayISO();
  const broken = isBroken(conv.lastMessageAt);
  let streak = conv.streak || 0;
  let previousStreak = conv.previousStreak || 0;
  let lastActiveDay = conv.lastActiveDay;
  if (broken) {
    previousStreak = conv.streak || 0;
    streak = 1;
    lastActiveDay = today;
  }
  else if (conv.lastMessageAt) {
    if (lastActiveDay !== today) { streak += 1; lastActiveDay = today; }
  }
  else {
    streak = 1;
    lastActiveDay = today;
  }

  if (USE_PG) {
    await pool.query("INSERT INTO messages (id,conversation_id,sender_id,text,created_at) VALUES ($1,$2,$3,$4,$5)", [msg.id, conversationId, senderId, msg.text, msg.createdAt]);
    await pool.query("UPDATE conversations SET streak=$1,previous_streak=$2,last_active_day=$3,last_message_at=$4 WHERE id=$5", [streak, previousStreak, lastActiveDay, now, conversationId]);
  } else {
    const arr = await readCol("messages"); arr.push(msg); await writeCol("messages", arr);
    const carr = await readCol("conversations"); const ci = carr.findIndex(c => c.id === conversationId);
    if (ci >= 0) { carr[ci].streak = streak; carr[ci].previousStreak = previousStreak; carr[ci].lastActiveDay = lastActiveDay; carr[ci].lastMessageAt = now.toISOString(); }
    await writeCol("conversations", carr);
  }

  const otherId = conv.userA === senderId ? conv.userB : conv.userA;
  const sender = await getUserById(senderId);
  await createNotification({
    userId: otherId, type: "message", fromId: senderId, fromName: sender ? sender.displayName : "",
    refId: conversationId, message: `${sender ? sender.displayName : "Ai đó"} đã nhắn tin cho bạn`,
  });
  return { msg, streak, broken: false };
}
async function restoreStreak(conversationId, userId) {
  const conv = await getConversationForUser(conversationId, userId);
  if (!conv) throw new Error("Không có quyền");
  const meta = withConvMeta({ ...conv });
  if (!meta.broken && (conv.streak || 0) > 1 && !conv.previousStreak)
    throw new Error("Chuỗi chưa đứt, không cần khôi phục");
  if (meta.restoresLeft <= 0) throw new Error("Đã dùng hết 5 lần khôi phục trong tháng này");
  const m = ym();
  const restores = { ...conv.restoresByMonth, [m]: (meta.restoresUsed || 0) + 1 };
  const now = new Date().toISOString();
  const restoredStreak = Math.max(conv.streak || 0, conv.previousStreak || 0, 1);
  if (USE_PG) {
    await pool.query("UPDATE conversations SET streak=$1, previous_streak=0, last_message_at=$2, restores_by_month=$3 WHERE id=$4", [restoredStreak, now, JSON.stringify(restores), conversationId]);
  } else {
    const carr = await readCol("conversations"); const ci = carr.findIndex(c => c.id === conversationId);
    if (ci >= 0) { carr[ci].streak = restoredStreak; carr[ci].previousStreak = 0; carr[ci].lastMessageAt = now; carr[ci].restoresByMonth = restores; }
    await writeCol("conversations", carr);
  }
  return withConvMeta({ ...conv, streak: restoredStreak, previousStreak: 0, lastMessageAt: now, restoresByMonth: restores });
}

/* ---------- MEDIA ---------- */
async function saveMedia(meta) {
  const rec = { id: meta.id, ownerId: meta.ownerId, filename: meta.filename, originalName: meta.originalName || "", mimeType: meta.mimeType || "", createdAt: new Date().toISOString() };
  if (USE_PG) await pool.query("INSERT INTO media (id,owner_id,filename,original_name,mime_type,created_at) VALUES ($1,$2,$3,$4,$5,$6)", [rec.id, rec.ownerId, rec.filename, rec.originalName, rec.mimeType, rec.createdAt]);
  else { const a = await readCol("media"); a.push(rec); await writeCol("media", a); }
  return rec;
}

module.exports = {
  initStore, USE_PG, withConvMeta,
  // users / auth
  createUser, findUserByUsername, getUserById, searchUsers, batchGetUsers, safeUser, verifyPassword,
  // sessions
  createSession, getSession, deleteSession,
  // entries
  listMyEntries, listFeed, getEntry, upsertEntry, deleteEntry,
  // notifications
  createNotification, listNotifications, markNotificationRead, unreadCount,
  // chat
  getOrCreateConversation, getConversationForUser, listConversations, listMessages, sendMessage, restoreStreak,
  // media
  saveMedia,
};
