// ============================================================================
// Nutrimind — Google ile giriş: authorization-code + PKCE akışı (Faz H).
//
// NEDEN REDIRECT, GIS (Google Identity Services) DEĞİL:
// GIS `<script src="accounts.google.com/gsi/client">` ile tarayıcıya SÜRÜM
// SABİTLENEMEYEN, denetlenemeyen üçüncü taraf JS sokuyor — npm paketinden bile
// kötü (lockfile hash'i yok). Ayrıca o script'e ulaşılamazsa buton sessizce hiç
// render olmuyor; `display:standalone` bir PWA'da görünmez butonlu bir giriş
// ekranı kötü bir hata modu. Redirect yolu tarayıcıya SIFIR üçüncü taraf kod
// yüklüyor; tek dış temas, kullanıcının bilerek tıkladığı bir navigasyon.
//
// Kripto yalnızca `node:crypto` ile: JWKS'teki JWK doğrudan `createPublicKey`'e
// veriliyor (Node 16+), imza `crypto.verify` ile doğrulanıyor. Yeni bağımlılık YOK.
//
// Bu dosya BİLEREK ağdan bağımsız test edilebilir: JWKS ve saat DIŞARIDAN
// veriliyor, dolayısıyla `verifyIdToken` saf bir fonksiyon.
// ============================================================================
"use strict";

const { createHash, createPublicKey, randomBytes, verify: cryptoVerify } = require("node:crypto");

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** PKCE S256. `verifier` çerezde saklanır, `challenge` Google'a gider; kod
 *  çalınsa bile verifier olmadan tokena çevrilemez. */
function pkcePair() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function newState() {
  return b64url(randomBytes(16));
}

/**
 * Kapsam BİLEREK yalnızca `openid email profile`: bunlar "hassas olmayan"
 * kapsamlar, Google doğrulama incelemesi gerektirmiyor. Fazlası consent
 * ekranını inceleme kuyruğuna sokar.
 */
function buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // Yenileme tokenı İSTEMİYORUZ: id_token bir kez kullanılıp atılıyor.
    // (Bu yüzden consent ekranındaki "Testing modunda refresh token 7 günde
    // dolar" uyarısı bu uygulamayı hiç ilgilendirmiyor.)
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

/** JWT'yi parçalara ayırır. Doğrulama YAPMAZ — yalnızca ayrıştırır. */
function parseJwt(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: Buffer.from(parts[2], "base64url"),
    };
  } catch {
    return null;
  }
}

/**
 * Google'ın `id_token`'ını doğrular. `jwks` ve `now` dışarıdan verildiği için
 * ağ ve saat olmadan test edilebilir.
 *
 * SIRA ÖNEMLİ: önce İMZA, sonra iddialar. Ters sırada, doğrulanmamış bir
 * payload'ın alanlarına göre karar vermiş olurduk.
 *
 * @returns {{ok:true, payload:object} | {ok:false, error:string}}
 */
function verifyIdToken({ token, jwks, clientId, now }) {
  const parsed = parseJwt(token);
  if (!parsed) return { ok: false, error: "id_token ayrıştırılamadı" };

  if (parsed.header.alg !== "RS256") {
    // `alg: none` ve HMAC karışıklığı klasik JWT zafiyetleri — algoritma
    // token'ın KENDİSİNDEN değil, bizim beklentimizden gelmeli.
    return { ok: false, error: `beklenmeyen imza algoritması: ${parsed.header.alg}` };
  }

  const keys = (jwks && Array.isArray(jwks.keys) ? jwks.keys : []).filter((k) => k.kid === parsed.header.kid);
  if (keys.length === 0) return { ok: false, error: "imza anahtarı (kid) bulunamadı" };

  let imzaGecerli = false;
  for (const jwk of keys) {
    try {
      const key = createPublicKey({ format: "jwk", key: jwk });
      if (cryptoVerify("RSA-SHA256", Buffer.from(parsed.signingInput), key, parsed.signature)) {
        imzaGecerli = true;
        break;
      }
    } catch {
      /* bozuk anahtar — sıradakini dene */
    }
  }
  if (!imzaGecerli) return { ok: false, error: "id_token imzası geçersiz" };

  const p = parsed.payload;
  if (!VALID_ISSUERS.has(p.iss)) return { ok: false, error: "beklenmeyen issuer" };
  // `aud` kontrolü ŞART: başka bir uygulama için üretilmiş geçerli bir Google
  // token'ı, bu kontrol olmadan burada da kabul edilirdi.
  if (p.aud !== clientId) return { ok: false, error: "token bu uygulama için değil" };
  const t = Math.floor(now / 1000);
  if (typeof p.exp !== "number" || p.exp <= t) return { ok: false, error: "token süresi dolmuş" };
  if (typeof p.iat === "number" && p.iat > t + 300) return { ok: false, error: "token gelecekten geliyor" };
  if (!p.sub) return { ok: false, error: "sub yok" };

  return { ok: true, payload: p };
}

/**
 * Hesap eşleştirme kararı — bu akışın TEK gerçek güvenlik yargısı ve saf
 * tutulmasının sebebi bu.
 *
 * Kural: mevcut bir hesaba Google bağlanması YALNIZCA e-posta Google tarafından
 * DOĞRULANMIŞSA ve o hesapta henüz `google_sub` YOKSA olur. Daha gevşek her
 * kural (ör. yalnızca e-posta eşleşmesine bakmak) hesap ele geçirme yoludur:
 * doğrulanmamış bir e-postayla Google hesabı açan biri, buradaki hesabı ele
 * geçirebilirdi.
 *
 * `allowlist` ("İzinli E-postalar") BOŞ küme ya da tanımsızsa eski davranış:
 * yeni hesap `"yeni"` ile onaylanır. DOLUYSa yalnızca listedeki e-postalar yeni
 * hesap açabilir — listede olmayan biri `"izinsiz"` döner (botların kapısı).
 * Karşılaştırma NORMALİZE edilmiş e-postayla yapılır: Google `payload.email`'i
 * olduğu gibi döner, "Emrullah@Gmail.com" ile "emrullah@gmail.com" aynı kişidir.
 *
 * @returns {"giris" | "bagla" | "yeni" | "izinsiz" | "reddet"}
 */
function linkDecision({ payload, bySub, byEmail, email, allowlist }) {
  if (bySub) return "giris"; // bu Google hesabı zaten bağlı
  if (!byEmail) {
    if (payload.email_verified !== true) return "reddet";
    if (allowlist && allowlist.size > 0 && !allowlist.has(email)) return "izinsiz";
    return "yeni";
  }
  if (payload.email_verified !== true) return "reddet";
  if (byEmail.google_sub) return "reddet"; // e-posta başka bir Google hesabına bağlı
  return "bagla";
}

// --- Ağ gerektiren kısımlar (test edilebilirlik için ayrı) ---------------------

let jwksCache = { keys: null, expiresAt: 0 };

/** JWKS'i `Cache-Control: max-age` süresince önbellekler. Bilinmeyen bir `kid`
 *  görülürse en fazla 5 dakikada bir yeniden çekilir — aksi hâlde uydurma bir
 *  `kid` gönderen biri sonsuz yeniden-çekme tetikleyebilirdi. */
async function fetchJwks(now, force) {
  const t = typeof now === "number" ? now : Date.now();
  if (!force && jwksCache.keys && jwksCache.expiresAt > t) return jwksCache;
  const res = await fetch(JWKS_URI);
  if (!res.ok) throw new Error(`JWKS alınamadı (HTTP ${res.status})`);
  const body = await res.json();
  const cc = res.headers.get("cache-control") || "";
  const m = /max-age=(\d+)/i.exec(cc);
  const maxAge = m ? Math.max(300, Number(m[1])) : 3600;
  jwksCache = { keys: body, expiresAt: t + maxAge * 1000 };
  return jwksCache;
}

function __resetJwksCacheForTests() {
  jwksCache = { keys: null, expiresAt: 0 };
}

/** Yetkilendirme kodunu token'a çevirir. SUNUCUDAN SUNUCUYA — client_secret
 *  tarayıcıya hiç gitmiyor. */
async function exchangeCode({ code, clientId, clientSecret, redirectUri, codeVerifier }) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }).toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Google'ın hata gövdesi client_secret içermez; yine de yalnızca kodu alıyoruz.
    const kod = (body && body.error) || `HTTP ${res.status}`;
    throw new Error(`token değişimi başarısız: ${kod}`);
  }
  return body;
}

module.exports = {
  pkcePair,
  newState,
  buildAuthUrl,
  parseJwt,
  verifyIdToken,
  linkDecision,
  fetchJwks,
  exchangeCode,
  __resetJwksCacheForTests,
  JWKS_URI,
  TOKEN_ENDPOINT,
  AUTH_ENDPOINT,
};
