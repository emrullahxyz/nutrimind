// ============================================================================
// Nutrimind — uygulama-içi geri bildirim + özellik isteği uçları.
//
// POST /api/feedback   — oturumlu HER kullanıcı (kategori + mesaj; ad ve sürüm
//                        isteğe bağlı). Yalnızca yazma hızı sınırlı.
// GET  /api/feedback   — YALNIZCA sahip (NUTRIMIND_OWNER_EMAIL ile eşleşen
//                        hesap). Liste + okundu bayrağı; silinmiş kullanıcıda
//                        ad/e-posta null kalır (JOIN boşta).
// PATCH /api/feedback/:id — YALNIZCA sahip. `read: true/false` → okundu/okunmadı.
//
// `server/authRoutes.js` ile aynı izole-modül sözleşmesi geçerli: ASLA throw
// ETMEZ, her zaman {status, body, headers?} döner. Bir istisna bile 500 olur —
// aksi hâlde index.js'in paylaşılan catch'i onu sessizce yutardı.
//
// `feedback` tablosu LAZY oluşur: `server/index.js` ve `server/migrate.js`
// donmuş, göç akışına dokunulmuyor. Şema tanımı `authRoutes.js`'teki hesap
// silme kopyasıyla BİREBİR aynı tutulmak zorunda (feedback kayıtları kullanıcı
// verisidir; hesap silinince KVKK gereği onlar da gider). `PRAGMA user_version`
// bu özellikten habersizdir.
// ============================================================================
"use strict";

const { randomUUID } = require("node:crypto");
const authRoutes = require("./authRoutes.js"); // resolveSession (fonksiyon env'e bağlı değil)
const auth = require("./auth.js"); // createKeyedLimiter, isSameOriginRequest, normalizeEmail

const OWNER_EMAIL = auth.normalizeEmail(process.env.NUTRIMIND_OWNER_EMAIL || "");
const PUBLIC_ORIGIN = process.env.NUTRIMIND_PUBLIC_ORIGIN || "";
const CATEGORIES = new Set(["feature", "bug", "other"]);
const postLimiter = auth.createKeyedLimiter({ perMinute: 3, maxKeys: 2000 });

/** Tablo + indeks tek db.exec içinde. `category` CHECK kısıtı BİLEREK yok —
 *  doğrulama koddadır (tek doğruluk kaynağı). */
const FEEDBACK_SCHEMA = `
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    user_name TEXT,
    app_version TEXT,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
`;

/** Idempotent: her çağrıda bir kez çalışır, yok sayılan bir CREATE. */
function ensureSchema(db) {
  db.exec(FEEDBACK_SCHEMA);
}

function isAdminUser(db, userId) {
  if (!OWNER_EMAIL) return false;
  const row = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
  return !!row && row.email === OWNER_EMAIL;
}

/** Her zaman {status, body, headers?} döner — ASLA throw etmez. */
async function handleFeedback({ db, req, method, path, readBody }) {
  const now = Date.now();
  try {
    // Kimlik özelliği kapalıysa oturum yok demektir → bu özellik de kapalı.
    // Bayrağı istek anında okumak (modül yüklenirken değil) testlerde env
    // değişimine izin verir; prod'da davranış aynıdır.
    if (process.env.NUTRIMIND_AUTH_ENABLED !== "1") {
      return { status: 503, body: { error: "kimlik doğrulama bu ortamda kapalı" } };
    }

    const s = authRoutes.resolveSession(db, req, now);
    if (!s) return { status: 401, body: { error: "oturum gerekli" } };
    const uid = s.userId;

    // State değiştirenlerde CSRF kapısı (authRoutes deseni) — POST + PATCH.
    if (method !== "GET" && !auth.isSameOriginRequest(req.headers, PUBLIC_ORIGIN)) {
      return { status: 403, body: { error: "köken doğrulanamadı" } };
    }

    if (method === "POST" && path === "/api/feedback") {
      const keep = postLimiter.take(`fb:${uid}`, now);
      if (!keep.allowed) {
        return { status: 429, body: { error: "çok fazla istek", retryAfter: keep.retryAfter } };
      }

      ensureSchema(db);
      const b = (await readBody(req)) || {};
      const category = typeof b.category === "string" ? b.category : "";
      if (!CATEGORIES.has(category)) return { status: 400, body: { error: "geçersiz kategori" } };
      const message = typeof b.message === "string" ? b.message.trim() : "";
      if (message.length < 10 || message.length > 4000) {
        return { status: 400, body: { error: "mesaj 10-4000 karakter olmalı" } };
      }
      const name = typeof b.name === "string" ? b.name.trim().slice(0, 100) || null : null;
      const app_version = typeof b.app_version === "string" ? b.app_version.trim().slice(0, 20) || null : null;

      const id = randomUUID();
      const created = new Date(now).toISOString();
      db.prepare(
        "INSERT INTO feedback (id, user_id, category, message, user_name, app_version, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      ).run(id, uid, category, message, name, app_version, created);
      return { status: 201, body: { ok: true, id } };
    }

    if (method === "GET" && path === "/api/feedback") {
      ensureSchema(db);
      if (!isAdminUser(db, uid)) return { status: 403, body: { error: "yetkisiz" } };
      const rows = db
        .prepare(
          `SELECT f.id, f.category, f.message, f.user_name, f.app_version, f.created_at, f.read_at,
                  u.email AS user_email
           FROM feedback f LEFT JOIN users u ON u.id = f.user_id
           ORDER BY f.created_at DESC LIMIT 200`,
        )
        .all();
      return {
        status: 200,
        body: {
          ok: true,
          items: rows.map((r) => ({
            id: r.id,
            category: r.category,
            message: r.message,
            user_name: r.user_name,
            user_email: r.user_email,
            app_version: r.app_version,
            created_at: r.created_at,
            read: r.read_at !== null,
          })),
        },
      };
    }

    if (method === "PATCH" && path.startsWith("/api/feedback/")) {
      ensureSchema(db);
      if (!isAdminUser(db, uid)) return { status: 403, body: { error: "yetkisiz" } };
      // Bozuk yüzde-kodlama (örn. "%") URIError fırlatır → 500 değil 400 dönsün.
      let id;
      try {
        id = decodeURIComponent(path.slice("/api/feedback/".length));
      } catch {
        return { status: 400, body: { error: "geçersiz kimlik" } };
      }
      if (!id) return { status: 404, body: { error: "bulunamadı" } };
      const b = (await readBody(req)) || {};
      const exists = db.prepare("SELECT 1 FROM feedback WHERE id = ?").get(id);
      if (!exists) return { status: 404, body: { error: "bulunamadı" } };
      if (b.read === true) {
        db.prepare("UPDATE feedback SET read_at = ? WHERE id = ?").run(new Date(now).toISOString(), id);
      } else if (b.read === false) {
        db.prepare("UPDATE feedback SET read_at = NULL WHERE id = ?").run(id);
      } else {
        return { status: 400, body: { error: "read boolean olmalı" } };
      }
      return { status: 200, body: { ok: true } };
    }

    return { status: 404, body: { error: "bulunamadı" } };
  } catch (e) {
    return { status: 500, body: { error: "geri bildirim hatası: beklenmeyen durum" } };
  }
}

module.exports = { handleFeedback };
