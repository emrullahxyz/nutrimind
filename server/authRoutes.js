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
const google = require("./googleAuth.js");

const AUTH_ENABLED = process.env.NUTRIMIND_AUTH_ENABLED === "1";
const ALLOW_SIGNUP = process.env.NUTRIMIND_ALLOW_SIGNUP === "1";
/** "İzinli E-postalar" listesini yönetebilecek TEK hesap. Boşsa yönetici yok. */
const OWNER_EMAIL = auth.normalizeEmail(process.env.NUTRIMIND_OWNER_EMAIL || "");
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

// --- Google ---------------------------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_ENABLED = GOOGLE_CLIENT_ID !== "" && GOOGLE_CLIENT_SECRET !== "";
/** Google Console'da KAYITLI olan yol — birebir tutmak zorunda. */
const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
const googleRedirectUri = () => `${PUBLIC_ORIGIN}${GOOGLE_CALLBACK_PATH}`;
/** `state` + PKCE `code_verifier`'ı taşıyan kısa ömürlü çerez. */
const OAUTH_COOKIE = SECURE_COOKIE ? "__Host-nm_oauth" : "nm_oauth";
const OAUTH_TTL_SEC = 600;

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
  const h = (req && req.headers) || {};
  const xff = h["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim() !== "") {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  // `X-Real-IP` yedeği: nginx vhost'u YunoHost tarafından yönetiliyor ve yeniden
  // üretildiğinde elle eklenen `X-Forwarded-For` satırı kaybolabilir. `X-Real-IP`
  // zaten vhost'un kendi varsayılanında var. Bu yedek olmadan sessizce HERKES
  // 127.0.0.1 görünür ve IP başına hız sınırı tek bir küresel kovaya çöker —
  // yani bir saldırgan tüm kullanıcıları kilitleyebilirdi.
  const real = h["x-real-ip"];
  if (typeof real === "string" && real.trim() !== "") return real.trim();
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

// --- İzinli e-postalar ----------------------------------------------------------

/** Listeyi küme olarak döndürür. BOŞ küme = kapı kapalı (eski davranış). */
function allowlistSet(db) {
  return new Set(db.prepare("SELECT email FROM signup_allowlist").all().map((r) => r.email));
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
    // "İzinli e-postalar" tablosu LAZY kurulur: `server/index.js` donmuş, göç
    // akışına dokunulmuyor. İşlem yok sayılan bir CREATE — her istekte 1-2µs.
    db.exec("CREATE TABLE IF NOT EXISTS signup_allowlist (email TEXT PRIMARY KEY)");

    // ---- GET /api/auth/me ----
    if (method === "GET" && path === "/api/auth/me") {
      // Bayrak kapalıyken kapı GEÇİRGEN: istemci `authDisabled` görüp giriş
      // ekranını hiç göstermez. Frontend fazının bayraktan ÖNCE
      // gönderilebilmesini sağlayan şey bu.
      if (!AUTH_ENABLED) return { status: 200, body: { ok: true, user: null, authDisabled: true } };
      const s = resolveSession(db, req, t);
      // Oturumsuzken de yetenekleri bildiriyoruz: giriş ekranı Google düğmesini
      // gösterip göstermeyeceğine buna bakarak karar veriyor.
      const yetenekler = { signupAllowed: ALLOW_SIGNUP, googleEnabled: GOOGLE_ENABLED, isAdmin: false };
      if (!s) return { status: 401, body: { error: "oturum yok", ...yetenekler } };
      const row = db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(s.userId);
      if (!row) return { status: 401, body: { error: "oturum yok", ...yetenekler } };
      return {
        status: 200,
        body: {
          ok: true,
          user: publicUser(row),
          ...yetenekler,
          isAdmin: OWNER_EMAIL !== "" && row.email === OWNER_EMAIL,
        },
        ...(s.refreshed ? { headers: setCookieHeader(s.sessionId) } : {}),
      };
    }

    if (!AUTH_ENABLED) return { status: 503, body: { error: "kimlik doğrulama bu ortamda kapalı" } };

    // ---- CSRF: durum değiştiren her istekte köken kontrolü ----
    if (method !== "GET" && !auth.isSameOriginRequest(req.headers, PUBLIC_ORIGIN)) {
      return { status: 403, body: { error: "geçersiz köken" } };
    }

    // ---- POST /api/auth/password ----
    // Parola belirleme/değiştirme. Oturum ŞART.
    if (method === "POST" && path === "/api/auth/password") {
      const s = resolveSession(db, req, t);
      if (!s) return { status: 401, body: { error: "oturum gerekli" } };

      const row = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(s.userId);
      if (!row) return { status: 401, body: { error: "oturum gerekli" } };

      const b2 = (await readBody(req)) || {};
      const yeni = typeof b2.newPassword === "string" ? b2.newPassword : "";
      const mevcut = typeof b2.currentPassword === "string" ? b2.currentPassword : "";

      const problem = auth.passwordProblem(yeni);
      if (problem) return { status: 400, body: { error: problem } };

      // Yalnızca Google ile açılmış hesapta `password_hash` NULL olur; orada
      // "mevcut parola" diye bir şey YOK, kullanıcı ilk kez belirliyor. Bu bir
      // yetki yükseltmesi değil: zaten geçerli bir oturumu var.
      if (row.password_hash !== null) {
        // Hız sınırı: geçerli oturumu olan biri bile mevcut parolayı deneme
        // yanılmayla bulmaya çalışmasın.
        const kontrol = emailLimiter.take(`pw:${row.id}`, t);
        if (!kontrol.allowed) {
          return {
            status: 429,
            body: { error: "çok fazla deneme, biraz sonra tekrar dene", retryAfter: kontrol.retryAfter },
            headers: { "Retry-After": String(kontrol.retryAfter) },
          };
        }
        if (!auth.verifyPassword(mevcut, row.password_hash)) {
          return { status: 403, body: { error: "mevcut parola hatalı" } };
        }
      }

      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(auth.hashPassword(yeni), row.id);

      // DİĞER cihazlardaki oturumlar düşürülür, bu cihazınki KALIR. Parola
      // değiştirmenin anlamı çalınmış bir oturumu kesmekse bu şart; kendi
      // oturumunu da düşürmek kullanıcıyı gereksizce dışarı atardı.
      const digerleri = db
        .prepare("DELETE FROM sessions WHERE user_id = ? AND id_hash != ?")
        .run(row.id, auth.hashSessionId(s.sessionId));

      return {
        status: 200,
        body: { ok: true, kapatilanOturum: (digerleri && digerleri.changes) || 0 },
      };
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

    // ---- GET /api/auth/account/export ----
    // KVKK m.11 / GDPR Art.20: kullanıcının tüm verisini makine-okunabilir
    // formatta indirme. Oturum ŞART. Yazma YAPMAZ (read-only).
    if (method === "GET" && path === "/api/auth/account/export") {
      const s = resolveSession(db, req, t);
      if (!s) return { status: 401, body: { error: "oturum gerekli" } };

      const user = db.prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?").get(s.userId);
      if (!user) return { status: 401, body: { error: "oturum gerekli" } };

      const days = db
        .prepare("SELECT date, meals FROM days WHERE user_id = ? ORDER BY date")
        .all(s.userId)
        .map((r) => ({ date: r.date, meals: JSON.parse(r.meals) }));
      const aliases = db
        .prepare("SELECT id, data FROM aliases WHERE user_id = ? ORDER BY id")
        .all(s.userId)
        .map((r) => ({ id: r.id, data: JSON.parse(r.data) }));
      const configRows = db.prepare("SELECT key, value FROM config WHERE user_id = ?").all(s.userId);
      const config = Object.fromEntries(configRows.map((r) => [r.key, r.value]));

      return {
        status: 200,
        body: {
          exportedAt: new Date(t).toISOString(),
          user: {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            createdAt: user.created_at,
          },
          days,
          aliases,
          config,
        },
      };
    }

    // ---- POST /api/auth/account ----
    // Hesap silme. Tüm kullanıcı verisi hard delete (KVKK m.7). OAuth revoke
    // YAPILMAZ — kullanıcı kararı: yalnızca lokal veri temizlenir, Google hesabı
    // etkilenmez. Tüm DELETE'ler atomik transaction.
    if (method === "POST" && path === "/api/auth/account") {
      const s = resolveSession(db, req, t);
      if (!s) return { status: 401, body: { error: "oturum gerekli" } };

      const user = db.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").get(s.userId);
      if (!user) return { status: 401, body: { error: "oturum gerekli" } };

      const b2 = (await readBody(req)) || {};
      const confirm = typeof b2.confirm === "string" ? b2.confirm : "";
      if (confirm !== "DELETE") {
        return { status: 400, body: { error: "onay metni DELETE olmalı" } };
      }

      // E-posta+parola hesabı: mevcut parola ŞART (OAuth-only ise NULL).
      // Hız sınırı: kötüye kullanıma karşı parolayı dene/yanıl doldurmayı
      // kısıtla — ama oturumu olan birinin buna ihtiyacı az, ana saldırı
      // vektörü çalınmış çerez; o zaten 30 günde düşer.
      if (user.password_hash !== null) {
        const parola = typeof b2.password === "string" ? b2.password : "";
        const kontrol = emailLimiter.take(`del:${user.id}`, t);
        if (!kontrol.allowed) {
          return {
            status: 429,
            body: { error: "çok fazla deneme, biraz sonra tekrar dene", retryAfter: kontrol.retryAfter },
            headers: { "Retry-After": String(kontrol.retryAfter) },
          };
        }
        if (!auth.verifyPassword(parola, user.password_hash)) {
          return { status: 401, body: { error: "e-posta veya parola hatalı" } };
        }
      }

      // Tek transaction: ya HEP'si silinir ya HİÇBİRİ. Yarıda kalırsa
      // kullanıcı "silindi" sanıp verisi hâlâ DB'de kalır — sızıntı riski.
      // `node:sqlite`'de `db.transaction` YOK; BEGIN/COMMIT/ROLLBACK manuel.

      // Geri bildirim kayıtları da kullanıcı verisidir (KVKK m.7) ve hesapla
      // birlikte silinir. Tablo LAZY oluşur (feedbackRoutes şeması); hiç geri
      // bildirim yazılmamışsa bu CREATE onu transaction İÇİNDE yaratır ki
      // aşağıdaki DELETE "no such table" ile DÜŞMESİN. Şema tanımı
      // feedbackRoutes.js'tekiyle BİREBİR aynı tutulmalı (kopya kaçınılmaz).
      db.exec(
        "CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL, user_name TEXT, app_version TEXT, created_at TEXT NOT NULL, read_at TEXT);",
      );

      const sifir = (sql, ...args) => db.prepare(sql).run(...args).changes;
      let silinen;
      try {
        db.exec("BEGIN");
        silinen = {
          days: sifir("DELETE FROM days WHERE user_id = ?", s.userId),
          config: sifir("DELETE FROM config WHERE user_id = ?", s.userId),
          aliases: sifir("DELETE FROM aliases WHERE user_id = ?", s.userId),
          sessions: sifir("DELETE FROM sessions WHERE user_id = ?", s.userId),
          // Geri bildirim kayıtları kullanıcı verisidir, hesapla birlikte silinir.
          feedback: sifir("DELETE FROM feedback WHERE user_id = ?", s.userId),
          allowlist: sifir("DELETE FROM signup_allowlist WHERE email = ?", user.email),
          users: sifir("DELETE FROM users WHERE id = ?", s.userId),
        };
        db.exec("COMMIT");
      } catch (e) {
        try { db.exec("ROLLBACK"); } catch {}
        return { status: 500, body: { error: `silme hatası: ${String((e && e.message) || e)}` } };
      }

      return {
        status: 200,
        body: { ok: true, silinen },
        headers: { "Set-Cookie": auth.clearCookie(COOKIE_NAME, cookieOpts()) },
      };
    }

    // ---- GET /api/auth/google/start ----
    // Üst seviye navigasyon (GET) olduğu için yukarıdaki CSRF kapısına takılmaz;
    // bu bilinçli. Google'dan dönüş de aynı sebeple GET.
    if (method === "GET" && path === "/api/auth/google/start") {
      if (!GOOGLE_ENABLED) return { status: 503, body: { error: "Google girişi yapılandırılmamış" } };
      if (!PUBLIC_ORIGIN) return { status: 500, body: { error: "NUTRIMIND_PUBLIC_ORIGIN ayarlanmamış" } };
      const state = google.newState();
      const { verifier, challenge } = google.pkcePair();
      const url = google.buildAuthUrl({
        clientId: GOOGLE_CLIENT_ID,
        redirectUri: googleRedirectUri(),
        state,
        codeChallenge: challenge,
      });
      return {
        status: 302,
        body: { ok: true, redirect: url },
        headers: {
          Location: url,
          // `state` ve `verifier` ÇEREZDE: sunucuda durum tutmuyoruz. Çerez
          // HttpOnly olduğu için sayfadaki JS bunları okuyamaz.
          "Set-Cookie": auth.serializeCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier }), {
            ...cookieOpts(),
            maxAge: OAUTH_TTL_SEC,
          }),
        },
      };
    }

    // ---- GET /api/auth/callback/google ----
    if (method === "GET" && path === GOOGLE_CALLBACK_PATH) {
      if (!GOOGLE_ENABLED) return { status: 503, body: { error: "Google girişi yapılandırılmamış" } };
      // Hatalar JSON değil YÖNLENDİRME ile bildiriliyor: burası bir üst seviye
      // navigasyon, kullanıcı tarayıcıda ham JSON görmemeli.
      const hata = (kod) => ({
        status: 302,
        body: { ok: false, error: kod },
        headers: {
          Location: `/?auth_error=${encodeURIComponent(kod)}`,
          "Set-Cookie": auth.clearCookie(OAUTH_COOKIE, cookieOpts()),
        },
      });

      const q = new URL(req.url || path, "http://yerel").searchParams;
      // Kullanıcı Google ekranında "iptal" derse buraya `error=access_denied` gelir.
      if (q.get("error")) return hata(q.get("error"));

      const cookies = auth.parseCookies(req.headers && req.headers.cookie);
      let saklanan = null;
      try {
        saklanan = JSON.parse(cookies[OAUTH_COOKIE] || "null");
      } catch {
        saklanan = null;
      }
      if (!saklanan || !saklanan.state || !saklanan.verifier) return hata("oturum_suresi_doldu");
      // CSRF: Google'ın döndürdüğü `state`, bizim ürettiğimizle aynı olmalı.
      if (q.get("state") !== saklanan.state) return hata("state_uyusmadi");
      const code = q.get("code");
      if (!code) return hata("kod_yok");

      let tokens;
      try {
        tokens = await google.exchangeCode({
          code,
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          redirectUri: googleRedirectUri(),
          codeVerifier: saklanan.verifier,
        });
      } catch {
        return hata("token_degisimi_basarisiz");
      }

      let jwks;
      try {
        jwks = (await google.fetchJwks(t)).keys;
      } catch {
        return hata("jwks_alinamadi");
      }
      let dogrulama = google.verifyIdToken({ token: tokens.id_token, jwks, clientId: GOOGLE_CLIENT_ID, now: t });
      if (!dogrulama.ok) {
        // Bilinmeyen `kid` anahtar rotasyonu olabilir — bir kez zorla tazele.
        try {
          jwks = (await google.fetchJwks(t, true)).keys;
          dogrulama = google.verifyIdToken({ token: tokens.id_token, jwks, clientId: GOOGLE_CLIENT_ID, now: t });
        } catch {
          /* aşağıdaki kontrol karar verecek */
        }
      }
      if (!dogrulama.ok) return hata("token_dogrulanamadi");

      const p = dogrulama.payload;
      const email = auth.normalizeEmail(p.email);
      const bySub = db.prepare("SELECT id, email, display_name FROM users WHERE google_sub = ?").get(p.sub);
      const byEmail = email
        ? db.prepare("SELECT id, email, display_name, google_sub FROM users WHERE email = ?").get(email)
        : null;

      const karar = google.linkDecision({ payload: p, bySub, byEmail, email, allowlist: allowlistSet(db) });
      let userId;
      if (karar === "giris") {
        userId = bySub.id;
      } else if (karar === "bagla") {
        userId = byEmail.id;
        db.prepare("UPDATE users SET google_sub = ?, display_name = COALESCE(display_name, ?) WHERE id = ?").run(
          p.sub,
          p.name || null,
          userId,
        );
      } else if (karar === "yeni") {
        // Yeni hesap açmak kayıt iznine tabi. Bağlama (`bagla`) tabi DEĞİL:
        // orada zaten var olan bir hesaba giriliyor.
        if (!ALLOW_SIGNUP) return hata("yeni_kayit_kapali");
        userId = `u_${t.toString(36)}${randomBytes(4).toString("hex")}`;
        db.prepare(
          "INSERT INTO users (id, email, password_hash, google_sub, display_name, created_at) VALUES (?, ?, NULL, ?, ?, ?)",
        ).run(userId, email, p.sub, p.name || null, new Date(t).toISOString());
      } else if (karar === "izinsiz") {
        // Liste DOLU ve bu e-posta listede yok — botların/istenmeyenlerin kapısı.
        return hata("kayit_izinsiz");
      } else {
        return hata("hesap_baglanamadi");
      }

      const { sessionId } = createSession(db, userId, req, t);
      return {
        status: 302,
        body: { ok: true },
        headers: {
          Location: "/",
          "Set-Cookie": [
            auth.serializeCookie(COOKIE_NAME, sessionId, cookieOpts()),
            auth.clearCookie(OAUTH_COOKIE, cookieOpts()),
          ],
        },
      };
    }

    // ---- "İzinli E-postalar" listesi (yalnızca sahip) ----
    // Kayıt kapısını besleyen liste; Ayarlar'dan yönetilir. Yönetici = oturumdaki
    // e-posta `NUTRIMIND_OWNER_EMAIL` ile eşleşen TEK hesap. Varlığını bile
    // sızdırmamak için yönetici olmayana her istek aynı 403'ü döner.
    if (path === "/api/auth/admin/allowlist") {
      const s = resolveSession(db, req, t);
      const sahip = s ? db.prepare("SELECT email FROM users WHERE id = ?").get(s.userId) : null;
      if (!sahip || OWNER_EMAIL === "" || sahip.email !== OWNER_EMAIL) {
        return { status: 403, body: { error: "bu işlem için yetkin yok" } };
      }

      if (method === "GET") {
        const emails = db
          .prepare("SELECT email FROM signup_allowlist ORDER BY email")
          .all()
          .map((r) => r.email);
        return { status: 200, body: { ok: true, emails } };
      }

      const b2 = (await readBody(req)) || {};
      const eposta = auth.normalizeEmail(b2.email);

      if (method === "POST") {
        const problem = auth.emailProblem(b2.email);
        if (problem) return { status: 400, body: { error: problem } };
        const varMi = db.prepare("SELECT 1 FROM signup_allowlist WHERE email = ?").get(eposta);
        if (varMi) return { status: 409, body: { error: "bu e-posta zaten listede" } };
        db.prepare("INSERT INTO signup_allowlist (email) VALUES (?)").run(eposta);
        return { status: 201, body: { ok: true, email: eposta } };
      }

      if (method === "DELETE") {
        const silinen = db.prepare("DELETE FROM signup_allowlist WHERE email = ?").run(eposta);
        if (!silinen.changes) return { status: 404, body: { error: "bu e-posta listede yok" } };
        return { status: 200, body: { ok: true, email: eposta } };
      }

      return { status: 405, body: { error: "metoda izin verilmiyor" } };
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

      // "İzinli e-postalar" kapısı: liste DOLUYSA yalnızca listedekiler kayıt
      // olabilir. Boş liste = kapı yok (yalnızca ALLOW_SIGNUP bayrağı geçerli).
      const izinli = allowlistSet(db);
      if (izinli.size > 0 && !izinli.has(email)) {
        return { status: 403, body: { error: "bu e-posta kayıt için izinli değil" } };
      }

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
    // İzole modül sözleşmesi: throw ETME, karar dön. İç hata mesajı istemciye
    // sızdırılmaz — yalnızca genel ibare döner (detay zaten loglanmaz).
    return { status: 500, body: { error: "kimlik doğrulama hatası: beklenmeyen durum" } };
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
