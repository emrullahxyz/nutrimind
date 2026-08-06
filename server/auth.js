// ============================================================================
// Nutrimind — kimlik doğrulama İLKELLERİ (Faz B).
//
// Bu dosya BİLEREK saf: hiçbir yerden çağrılmıyor, veritabanına dokunmuyor,
// HTTP bilmiyor. Faz E'de oturum/uç mantığı bunun ÜSTÜNE eklenecek. Böylece
// kriptografi ve doğrulama kuralları, hiçbir davranış değişmeden tek başına
// gözden geçirilip test edilebiliyor.
//
// `server/ai.js` ile aynı izole-modül sözleşmesi geçerli: dışa dönük fonksiyonlar
// ASLA throw ETMEZ, karar döner. `server/index.js`'e bu fazda dokunulmuyor.
//
// SIFIR BAĞIMLILIK: yalnızca `node:crypto`. Parola karma için scrypt (Node'un
// standart kütüphanesi), oturum kimliği için `randomBytes`. AGENTS.md'nin
// "yaygın işlevi yeniden yazma" kuralı burada standart kütüphaneyle karşılanıyor;
// el yazımı bir kripto YOK.
// ============================================================================
"use strict";

const { createHash, randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

// --- Parola karma --------------------------------------------------------------

const SCRYPT_N = Math.max(1024, Number(process.env.NUTRI_SCRYPT_N) || 32768);
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * scrypt'in bellek ihtiyacı `128 * N * r` bayt: N=32768, r=8 için ~33,5 MB.
 * Node'un VARSAYILAN `maxmem` sınırı 32 MB — yani `maxmem` verilmezse bu
 * parametrelerle scrypt `ERR_CRYPTO_INVALID_SCRYPT_PARAM` FIRLATIR. İki katını
 * veriyoruz ki `NUTRI_SCRYPT_N` yükseltilse de aynı tuzağa düşülmesin.
 */
function maxmemFor(n, r) {
  return 128 * n * r * 2;
}

/** Aynı parolanın farklı klavyelerde farklı kodlanması (Türkçe karakterler)
 *  iki ayrı karma üretirdi. Hem karma hem doğrulama aynı normalizasyonu kullanır. */
function normalizePassword(password) {
  return String(password == null ? "" : password).normalize("NFKC");
}

/**
 * Kendini tanımlayan tek bir metin döner:
 *   `scrypt$N=32768,r=8,p=1$<saltB64>$<hashB64>`
 * Parametreler karmanın İÇİNDE tutuluyor ki ileride maliyet ayarı değiştiğinde
 * eski parolalar doğrulanmaya devam etsin (ayrı bir salt sütunu da gerekmiyor).
 */
function hashPassword(password, saltOverride) {
  const salt = saltOverride ? Buffer.from(saltOverride) : randomBytes(SALT_LEN);
  const key = scryptSync(normalizePassword(password), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: maxmemFor(SCRYPT_N, SCRYPT_R),
  });
  return `scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

function parseStoredHash(stored) {
  if (typeof stored !== "string") return null;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return null;

  const params = {};
  for (const kv of parts[1].split(",")) {
    const [k, v] = kv.split("=");
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    params[k] = n;
  }
  if (!params.N || !params.r || !params.p) return null;

  let salt;
  let hash;
  try {
    salt = Buffer.from(parts[2], "base64");
    hash = Buffer.from(parts[3], "base64");
  } catch {
    return null;
  }
  if (salt.length === 0 || hash.length === 0) return null;
  return { N: params.N, r: params.r, p: params.p, salt, hash };
}

/** Sabit zamanlı karşılaştırma. Bozuk/eksik karma `false` döner — throw ETMEZ. */
function verifyPassword(password, stored) {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  let key;
  try {
    key = scryptSync(normalizePassword(password), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: maxmemFor(parsed.N, parsed.r),
    });
  } catch {
    return false;
  }
  // `timingSafeEqual` uzunluk uyuşmazlığında FIRLATIR; uzunluk zaten gizli değil.
  if (key.length !== parsed.hash.length) return false;
  return timingSafeEqual(key, parsed.hash);
}

/**
 * Bilinmeyen e-posta ile YANLIŞ PAROLA aynı süreyi harcamalı; aksi hâlde yanıt
 * süresinden hangi e-postaların kayıtlı olduğu okunabilir. Kullanıcı bulunamadığında
 * bu çağrılır ve sonucu ATILIR — tek amacı aynı işi yapmak.
 */
let dummyHashCache = null;
function equalizeVerifyCost(password) {
  if (dummyHashCache === null) dummyHashCache = hashPassword("nutrimind-zaman-esitleyici");
  verifyPassword(password, dummyHashCache);
}

// --- Oturum kimliği ------------------------------------------------------------

/** Çerezde taşınan opak değer. Tahmin edilemez olması TEK gereksinim. */
function newSessionId() {
  return randomBytes(32).toString("hex");
}

/** Veritabanına kimliğin KENDİSİ değil, SHA-256'sı yazılır: veritabanı sızsa
 *  bile satırlar canlı oturuma çevrilemez (çerezdeki değer geri üretilemez). */
function hashSessionId(sessionId) {
  return createHash("sha256").update(String(sessionId), "utf8").digest("hex");
}

// --- Çerez ---------------------------------------------------------------------

function parseCookies(header) {
  const out = {};
  if (typeof header !== "string" || header === "") return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value; // bozuk yüzde kodlaması — ham hâliyle bırak
    }
  }
  return out;
}

/**
 * `Set-Cookie` değeri üretir. Varsayılanlar bilinçli:
 *  - `HttpOnly`: XSS ile okunamasın.
 *  - `SameSite=Lax` (Strict DEĞİL): Google girişinden dönen ÜST SEVİYE
 *    navigasyonda `Strict` çerezi göndermez ve oturum kaybolurdu.
 *  - `Path=/`: uygulamanın tamamı.
 */
function serializeCookie(name, value, opts) {
  const o = opts || {};
  const parts = [`${name}=${encodeURIComponent(String(value))}`];
  if (o.maxAge !== undefined && Number.isFinite(o.maxAge)) {
    parts.push(`Max-Age=${Math.floor(o.maxAge)}`);
  }
  parts.push(`Path=${o.path || "/"}`);
  if (o.httpOnly !== false) parts.push("HttpOnly");
  if (o.secure) parts.push("Secure");
  parts.push(`SameSite=${o.sameSite || "Lax"}`);
  return parts.join("; ");
}

/** Çerezi silmek = aynı adla boş değer + `Max-Age=0`. Bayraklar da eşleşmeli,
 *  yoksa tarayıcı farklı bir çerez sanıp eskisini bırakır. */
function clearCookie(name, opts) {
  return serializeCookie(name, "", { ...(opts || {}), maxAge: 0 });
}

// --- Doğrulama kuralları --------------------------------------------------------
// AYNA: `src/lib/authRules.ts` bunların TypeScript kopyasıdır (istemci anında
// geri bildirim verebilsin diye). Kaymayı önlemek için İKİ test dosyası da AYNI
// vaka tablosunu (`authRules.cases.json`) çalıştırır. YETKİLİ OLAN BURASI —
// istemci tarafı yalnızca kullanıcı deneyimi içindir.

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** `UNIQUE` sütunun işini yapabilmesi için e-posta küçük harfe indirgenerek
 *  saklanır — böylece ifade indeksi gerekmez. */
function normalizeEmail(raw) {
  return String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
}

function emailProblem(raw) {
  const email = normalizeEmail(raw);
  if (email === "") return "E-posta gerekli.";
  if (email.length > EMAIL_MAX) return "E-posta çok uzun.";
  if (!EMAIL_RE.test(email)) return "Geçerli bir e-posta adresi yaz.";
  return null;
}

function passwordProblem(raw) {
  const password = typeof raw === "string" ? raw : "";
  if (password === "") return "Parola gerekli.";
  if (password.trim() === "") return "Parola yalnızca boşluktan oluşamaz.";
  // Uzunluk KOD NOKTASI ile sayılır: "şğüöçı" gibi karakterler UTF-16'da iki
  // birim tutabiliyor ve kullanıcının saydığından farklı bir sonuç çıkardı.
  const length = [...password.normalize("NFKC")].length;
  if (length < PASSWORD_MIN) return `Parola en az ${PASSWORD_MIN} karakter olmalı.`;
  // Üst sınır bir DoS önlemi: scrypt maliyeti girdiyle birlikte artıyor ve
  // gövde sınırı (1 MB) tek başına yeterli değil.
  if (length > PASSWORD_MAX) return `Parola en fazla ${PASSWORD_MAX} karakter olabilir.`;
  return null;
}

// --- Anahtar başına hız sınırı ---------------------------------------------------

/**
 * IP ve e-posta başına ayrı jeton kovası. `server/index.js`'teki genel kova
 * KÜRESELDİR (tüm istekler tek kovayı paylaşır); giriş denemelerinde bu işe
 * yaramaz — tek bir saldırgan herkesi kilitlerdi.
 *
 * `now` DIŞARIDAN veriliyor: saat enjekte edilebilir olunca sınır saf bir
 * fonksiyon gibi test edilebiliyor.
 */
function createKeyedLimiter(options) {
  const perMinute = Math.max(1, Number(options && options.perMinute) || 10);
  const maxKeys = Math.max(1, Number(options && options.maxKeys) || 1000);
  const refillPerMs = perMinute / 60000;
  const buckets = new Map();

  return {
    take(key, now) {
      const k = String(key);
      let bucket = buckets.get(k);
      // Map ekleme sırasını korur: silip yeniden ekleyerek "en son kullanılan"
      // sona alınıyor, böylece taşmada en eskisi atılıyor.
      if (bucket) buckets.delete(k);
      else bucket = { tokens: perMinute, last: now };

      const elapsed = Math.max(0, now - bucket.last);
      bucket.tokens = Math.min(perMinute, bucket.tokens + elapsed * refillPerMs);
      bucket.last = now;

      const allowed = bucket.tokens >= 1;
      if (allowed) bucket.tokens -= 1;
      buckets.set(k, bucket);

      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next().value;
        buckets.delete(oldest);
      }

      return {
        allowed,
        retryAfter: allowed ? 0 : Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000)),
      };
    },
    size() {
      return buckets.size;
    },
  };
}

// --- CSRF: köken kontrolü --------------------------------------------------------

/**
 * Durum değiştiren isteklerde köken kontrolü. `SameSite=Lax` zaten çapraz-site
 * POST'larda çerezi göndermiyor; bu ikinci katman.
 *
 * `allowedOrigin` ORTAM DEĞİŞKENİNDEN gelmeli, `Host` başlığından ASLA —
 * `Host` istemci kontrolündedir ve kontrolü anlamsız kılardı.
 */
function isSameOriginRequest(headers, allowedOrigin) {
  const h = headers || {};
  const fetchSite = h["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "") {
    // Modern tarayıcılar bunu her zaman gönderir ve taklit edilemez.
    return fetchSite === "same-origin" || fetchSite === "none";
  }
  const origin = h.origin;
  // Origin yoksa tarayıcı-dışı bir istemcidir (curl, mobil uygulama): çerez
  // tabanlı CSRF zaten mümkün değil.
  if (typeof origin !== "string" || origin === "") return true;
  return typeof allowedOrigin === "string" && allowedOrigin !== "" && origin === allowedOrigin;
}

module.exports = {
  // parola
  hashPassword,
  verifyPassword,
  equalizeVerifyCost,
  normalizePassword,
  // oturum
  newSessionId,
  hashSessionId,
  // çerez
  parseCookies,
  serializeCookie,
  clearCookie,
  // kurallar
  normalizeEmail,
  emailProblem,
  passwordProblem,
  // altyapı
  createKeyedLimiter,
  isSameOriginRequest,
  // sabitler (aynanın senkron kalması için)
  LIMITS: { EMAIL_MAX, PASSWORD_MIN, PASSWORD_MAX },
};
