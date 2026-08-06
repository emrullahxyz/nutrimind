// ============================================================================
// Nutrimind — oturum yönetimi + kimlik uçları (Faz E).
//
// `server/auth.js` SAF kalıyor (kripto + kurallar, DB bilmez, HTTP bilmez);
// veritabanı ve istek/yanıt işi burada. `server/ai.js`'in kurduğu izole-modül
// sözleşmesi geçerli ve BİR ADIM GENİŞLETİLDİ:
//     {status, body}  →  {status, body, headers?}
// `Set-Cookie` ve `Retry-After` bu yüzden gerekli. `index.js`'in `send()`'i zaten
// bir headers nesnesi alıyor, dolayısıyla o fonksiyon DEĞİŞMİYOR.
//
// BU MODÜL ASLA THROW ETMEZ. Beklenmedik bir hata bile {status:500, body} olur —
// aksi hâlde index.js'in paylaşılan catch'i onu sessizce yutardı.
//
// KILL-SWITCH: `NUTRIMIND_AUTH_ENABLED` "1" değilse tüm kimlik özelliği KAPALI
// ve uygulama bugünkü gibi davranıyor. Bu, fazın davranış değiştirmeden
// gönderilebilmesini sağlayan şey (bkz. `NUTRIMIND_LLM_PROVIDER` precedent'i).
// ============================================================================
"use strict";

const { randomBytes } = require("node:crypto");
const auth = require("./auth.js");

const AUTH_ENABLED = process.env.NUTRIMIND_AUTH_ENABLED === "1";
const ALLOW_SIGNUP = process.env.NUTRIMIND_ALLOW_SIGNUP === "1";
const SECURE_COOKIE = process.env.NUTRI_SECURE_COOKIE === "1";
const SESSION_DAYS = Math.max(1, Number(process.env.NUTRI_SESSION_DAYS) || 30);
const PUBLIC_ORIGIN = process.env.NUTRIMIND_PUBLIC_ORIGIN || "";

const DAY_MS = 86400000;

/**
 * `__Host-` öneki tarayıcıya Secure + Path=/ + Domain yok şartlarını ZORLA
 * doğrulatır; şartlar tutmazsa çerezi tamamen reddeder. Bedava sertleştirme.
 * Yerelde http üzerinden test edilebilsin diye ada bayrakla karar veriliyor.
 */
const COOKIE_NAME = SECURE_COOKIE ? "__Host-nm_session" : "nm_session";

const cookieOpts = () => ({
  httpOnly: true,
  secure: SECURE_COOKIE,
  sameSite: "Lax", // Strict DEĞİL — bkz. auth.js'teki gerekçe (Google dönüşü)
  path: "/",
  maxAge: SESSION_DAYS * 24 * 3600,
});

// --- Hız sınırları -------------------------------------------------------------
// index.js'teki kova KÜRESEL; giriş denemelerinde tek bir saldırgan herkesi
// kilitlerdi. Bunlar anahtar başına.
const ipLimiter = auth.createKeyedLimiter({ perMinute: 20, maxKeys: 1000 });
const emailLimiter = auth.createKeyedLimiter({ perMinute: 5, maxKeys: 1000 });

/**
 * İstemci IP'si. Servis 127.0.0.1'e bağlı olduğu için `req.socket.remoteAddress`
 * HER ZAMAN 127.0.0.1 — nginx'in `X-Forwarded-For`'u okunmak zorunda. Başlığa
 * güvenmek YALNIZCA servise nginx dışından ulaşılamadığı için güvenli; son
 * sıçrama alınıyor (öndeki değerler istemci tarafından uydurulabilir).
 */
function clientIp(req) {
  const xff = req && req.headers && req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim() !== "") {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return (req && req.socket && req.socket.remoteAddress) || "bilinmiyor";
}

// --- Oturum --------------------------------------------------------------------

function createSession(db, userId, req, now) {
  const sessionId = auth.newSessionId();
  const idHash = auth.hashSessionId(sessionId);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_DAYS * DAY_MS).toISOString();
  const ua = ((req && req.headers && req.headers["user-agent"]) || "").slice(0, 200);
  db.prepare(
    "INSERT INTO sessions (id_hash, user_id, created_at, expires_at, ua) VALUES (?, ?, ?, ?, ?)",
  ).run(idHash, userId, createdAt, expiresAt, ua);
  return { sessionId, expiresAt };
}

/**
 * Çerezden oturumu çözer. Süresi geçmiş satır BULUNDUĞU YERDE SİLİNİR — ölü
 * satırların birikmesini engelleyen tek mekanizma bu (ayrı bir temizlik işi yok).
 *
 * @returns {{userId:string, sessionId:string, refreshed:boolean} | null}
 */
function resolveSession(db, req, now) {
  const cookies = auth.parseCookies(req && req.headers && req.headers.cookie);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return null;

  const idHash = auth.hashSessionId(sessionId);
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE id_hash = ?").get(idHash);
  if (!row) return null;

  if (Date.parse(row.expires_at) <= now) {
    db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(idHash);
    return null;
  }

  // Kayan yenileme: her istekte DEĞİL. Her istekte döndürmek eşzamanlı istekleri
  // ve PWA'nın tekrar oynattığı istekleri kırardı. Yalnızca son uzatmanın
  // üzerinden bir günden fazla geçtiyse uzatılır.
  const target = now + SESSION_DAYS * DAY_MS;
  let refreshed = false;
  if (target - Date.parse(row.expires_at) > DAY_MS) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?").run(
      new Date(target).toISOString(),
      idHash,
    );
    refreshed = true;
  }
  return { userId: row.user_id, sessionId, refreshed };
}

function destroySession(db, sessionId) {
  if (!sessionId) return;
  db.prepare("DELETE FROM sessions WHERE id_hash = ?").run(auth.hashSessionId(sessionId));
}

// --- Yardımcılar ---------------------------------------------------------------

const publicUser = (row) =>
  row ? { id: row.id, email: row.email, name: row.display_name || null } : null;

const setCookieHeader = (sessionId) => ({
  "Set-Cookie": auth.serializeCookie(COOKIE_NAME, sessionId, cookieOpts()),
});

/** Tüm 401'ler AYNI gövdeyi döner: "e-posta kayıtlı ama parola yanlış" ile
 *  "böyle bir e-posta yok" ayrımı sızmasın. */
const BAD_CREDENTIALS = { status: 401, body: { error: "e-posta veya parola hatalı" } };

// --- Uçlar ---------------------------------------------------------------------

/**
 * @returns {{status:number, body:object, headers?:object}} — ASLA throw etmez.
 */
async function handleAuth({ db, req, method, path, readBody, now }) {
  const t = typeof now === "number" ? now : Date.now();

  try {
    // ---- GET /api/auth/me ----
    if (method === "GET" && path === "/api/auth/me") {
      // Bayrak kapalıyken kapı GEÇİRGEN: istemci `authDisabled` görüp giriş
      // ekranını hiç göstermez. Frontend fazının bayraktan ÖNCE
      // gönderilebilmesini sağlayan şey bu.
      if (!AUTH_ENABLED) return { status: 200, body: { ok: true, user: null, authDisabled: true } };
      const s = resolveSession(db, req, t);
      if (!s) return { status: 401, body: { error: "oturum yok" } };
      const row = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(s.userId);
      if (!row) return { status: 401, body: { error: "oturum yok" } };
      return {
        status: 200,
        body: { ok: true, user: publicUser(row), signupAllowed: ALLOW_SIGNUP },
        ...(s.refreshed ? { headers: setCookieHeader(s.sessionId) } : {}),
      };
    }

    if (!AUTH_ENABLED) return { status: 503, body: { error: "kimlik doğrulama bu ortamda kapalı" } };

    // ---- CSRF: durum değiştiren her istekte köken kontrolü ----
    if (method !== "GET" && !auth.isSameOriginRequest(req.headers, PUBLIC_ORIGIN)) {
      return { status: 403, body: { error: "geçersiz köken" } };
    }

    // ---- POST /api/auth/logout ----
    if (method === "POST" && path === "/api/auth/logout") {
      const cookies = auth.parseCookies(req.headers && req.headers.cookie);
      // Sunucu tarafında SİLMEK asıl olan; çerezi temizlemek yalnızca kozmetik.
      destroySession(db, cookies[COOKIE_NAME]);
      return {
        status: 200,
        body: { ok: true },
        headers: { "Set-Cookie": auth.clearCookie(COOKIE_NAME, cookieOpts()) },
      };
    }

    const isRegister = method === "POST" && path === "/api/auth/register";
    const isLogin = method === "POST" && path === "/api/auth/login";
    if (!isRegister && !isLogin) return { status: 404, body: { error: "bulunamadı" } };

    // ---- IP başına hız sınırı ----
    const ipCheck = ipLimiter.take(clientIp(req), t);
    if (!ipCheck.allowed) {
      return {
        status: 429,
        body: { error: "çok fazla deneme, biraz sonra tekrar dene", retryAfter: ipCheck.retryAfter },
        headers: { "Retry-After": String(ipCheck.retryAfter) },
      };
    }

    const b = (await readBody(req)) || {};
    const email = auth.normalizeEmail(b.email);
    const password = typeof b.password === "string" ? b.password : "";

    // ---- POST /api/auth/register ----
    if (isRegister) {
      if (!ALLOW_SIGNUP) return { status: 403, body: { error: "yeni kayıt kapalı" } };
      const problem = auth.emailProblem(b.email) || auth.passwordProblem(password);
      if (problem) return { status: 400, body: { error: problem } };

      const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(email);
      // UNIQUE kısıt zaten varlığı sızdırıyor; 1-5 kullanıcılık bir uygulamada
      // bunu gizlemenin yolu yok. En azından mesaj genel.
      if (exists) return { status: 409, body: { error: "bu e-posta zaten kayıtlı" } };

      // `aliases`'ın id desenin aynısı (index.js:394) — zaman + rastgelelik.
      const id = `u_${t.toString(36)}${randomBytes(4).toString("hex")}`;
      const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 80) : null;
      db.prepare(
        "INSERT INTO users (id, email, password_hash, google_sub, display_name, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
      ).run(id, email, auth.hashPassword(password), name, new Date(t).toISOString());

      const { sessionId } = createSession(db, id, req, t);
      const row = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(id);
      return { status: 201, body: { ok: true, user: publicUser(row) }, headers: setCookieHeader(sessionId) };
    }

    // ---- POST /api/auth/login ----
    const emailCheck = emailLimiter.take(email || "bos", t);
    if (!emailCheck.allowed) {
      return {
        status: 429,
        body: { error: "çok fazla deneme, biraz sonra tekrar dene", retryAfter: emailCheck.retryAfter },
        headers: { "Retry-After": String(emailCheck.retryAfter) },
      };
    }

    const row = db.prepare("SELECT id, email, password_hash, display_name FROM users WHERE email = ?").get(email);
    if (!row || !row.password_hash) {
      // ZAMANLAMA: kullanıcı yoksa da scrypt maliyeti ÖDENİR, yoksa yanıt
      // süresinden hangi e-postaların kayıtlı olduğu okunabilirdi.
      auth.equalizeVerifyCost(password);
      return BAD_CREDENTIALS;
    }
    if (!auth.verifyPassword(password, row.password_hash)) return BAD_CREDENTIALS;

    // Oturum SABİTLEME: girişte her zaman YENİ oturum kimliği üretilir.
    const { sessionId } = createSession(db, row.id, req, t);
    return { status: 200, body: { ok: true, user: publicUser(row) }, headers: setCookieHeader(sessionId) };
  } catch (e) {
    // İzole modül sözleşmesi: throw ETME, karar dön.
    return { status: 500, body: { error: `kimlik doğrulama hatası: ${String((e && e.message) || e)}` } };
  }
}

module.exports = {
  handleAuth,
  resolveSession,
  createSession,
  destroySession,
  clientIp,
  COOKIE_NAME,
  AUTH_ENABLED,
  ALLOW_SIGNUP,
};
