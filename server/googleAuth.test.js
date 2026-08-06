import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import googleAuth from "./googleAuth.js";

const { buildAuthUrl, linkDecision, parseJwt, pkcePair, verifyIdToken } = googleAuth;

// ============================================================================
// Google'ın `id_token`'ı, "bu kişi gerçekten o" iddiasının TEK dayanağı. Bu
// yüzden testler ağa çıkmadan gerçek kripto ile çalışıyor: burada bir RSA
// anahtar çifti üretiliyor, token gerçekten imzalanıyor ve doğrulayıcı gerçek
// imzayı doğruluyor. `verifyIdToken` JWKS'i ve saati DIŞARIDAN aldığı için bu
// mümkün.
//
// Testlerin çoğu "geçerli token kabul ediliyor mu" değil, "SAHTE token
// REDDEDİLİYOR mu" sorusunu soruyor.
// ============================================================================

const CLIENT_ID = "326424123295-test.apps.googleusercontent.com";
const KID = "test-kid-1";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
// KeyObject'i doğrudan JWK'ya çeviriyoruz — Google'ın JWKS'inin verdiği biçimin aynısı.
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
const JWKS = { keys: [jwk] };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Gerçekten imzalanmış bir token üretir. */
function tokenUret(payloadOverrides, headerOverrides, imzala = true) {
  const header = { alg: "RS256", kid: KID, typ: "JWT", ...(headerOverrides || {}) };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "emrullah@ornek.com",
    email_verified: true,
    name: "Emrullah",
    iat: now,
    exp: now + 3600,
    ...(payloadOverrides || {}),
  };
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const sig = imzala
    ? cryptoSign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")
    : "sahteimza";
  return `${signingInput}.${sig}`;
}

const SIMDI = Date.now();

describe("verifyIdToken — geçerli token", () => {
  it("gerçek imzalı token kabul edilir", () => {
    const r = verifyIdToken({ token: tokenUret(), jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(true);
    expect(r.payload.email).toBe("emrullah@ornek.com");
    expect(r.payload.sub).toBe("1234567890");
  });
});

describe("verifyIdToken — SAHTE tokenlar reddedilir", () => {
  it("imza bozuksa reddedilir", () => {
    const r = verifyIdToken({ token: tokenUret(null, null, false), jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
  });

  it("payload imzadan SONRA değiştirilmişse reddedilir", () => {
    const gecerli = tokenUret();
    const [h, , s] = gecerli.split(".");
    const kurcalanmis = `${h}.${b64({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "hacker", email: "hacker@x.co", email_verified: true, exp: Math.floor(SIMDI / 1000) + 3600 })}.${s}`;
    const r = verifyIdToken({ token: kurcalanmis, jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("imza");
  });

  it("alg:none reddedilir (klasik JWT zafiyeti)", () => {
    const r = verifyIdToken({ token: tokenUret(null, { alg: "none" }), jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("algoritma");
  });

  it("HS256'ya düşürme denemesi reddedilir", () => {
    const r = verifyIdToken({ token: tokenUret(null, { alg: "HS256" }), jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
  });

  it("BAŞKA bir uygulama için üretilmiş geçerli token reddedilir (aud)", () => {
    // Bu kontrol olmasa, baska-uygulama.apps.googleusercontent.com icin
    // uretilmis GERCEK imzali bir token burada da kabul edilirdi.
    const r = verifyIdToken({
      token: tokenUret({ aud: "baska-uygulama.apps.googleusercontent.com" }),
      jwks: JWKS, clientId: CLIENT_ID, now: SIMDI,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("bu uygulama için değil");
  });

  it("yanlış issuer reddedilir", () => {
    const r = verifyIdToken({ token: tokenUret({ iss: "https://kotu.example" }), jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("issuer");
  });

  it("süresi dolmuş token reddedilir", () => {
    const r = verifyIdToken({
      token: tokenUret({ exp: Math.floor(SIMDI / 1000) - 10 }),
      jwks: JWKS, clientId: CLIENT_ID, now: SIMDI,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("süresi");
  });

  it("bilinmeyen kid reddedilir (anahtar rotasyonu)", () => {
    const r = verifyIdToken({ token: tokenUret(null, { kid: "baska-kid" }), jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("kid");
  });

  it("bozuk/eksik token çökmez, hata döner", () => {
    for (const t of ["", "abc", "a.b", "a.b.c.d", null, undefined, 42]) {
      const r = verifyIdToken({ token: t, jwks: JWKS, clientId: CLIENT_ID, now: SIMDI });
      expect(r.ok).toBe(false);
    }
  });

  it("boş JWKS ile hiçbir token geçmez", () => {
    const r = verifyIdToken({ token: tokenUret(), jwks: { keys: [] }, clientId: CLIENT_ID, now: SIMDI });
    expect(r.ok).toBe(false);
  });
});

// ============================================================================
// Hesap eşleştirme bu akışın TEK gerçek güvenlik yargısı: gevşek bir kural
// (ör. yalnızca e-posta eşleşmesine bakmak) hesap ele geçirme yoludur.
// ============================================================================
describe("linkDecision", () => {
  const dogrulanmis = { email: "a@x.co", email_verified: true, sub: "g1" };
  const dogrulanmamis = { email: "a@x.co", email_verified: false, sub: "g1" };

  it("Google hesabı zaten bağlıysa doğrudan giriş", () => {
    expect(linkDecision({ payload: dogrulanmis, bySub: { id: "u1" }, byEmail: null })).toBe("giris");
  });

  it("doğrulanmış e-posta + bağsız hesap → bağla", () => {
    expect(linkDecision({ payload: dogrulanmis, bySub: null, byEmail: { id: "u1", google_sub: null } })).toBe("bagla");
  });

  it("DOĞRULANMAMIŞ e-posta mevcut hesaba BAĞLANAMAZ (ele geçirme yolu)", () => {
    expect(linkDecision({ payload: dogrulanmamis, bySub: null, byEmail: { id: "u1", google_sub: null } })).toBe("reddet");
  });

  it("e-posta BAŞKA bir Google hesabına bağlıysa reddedilir", () => {
    expect(linkDecision({ payload: dogrulanmis, bySub: null, byEmail: { id: "u1", google_sub: "baska" } })).toBe("reddet");
  });

  it("hesap yok + doğrulanmış e-posta → yeni", () => {
    expect(linkDecision({ payload: dogrulanmis, bySub: null, byEmail: null })).toBe("yeni");
  });

  it("hesap yok + DOĞRULANMAMIŞ e-posta → reddet", () => {
    expect(linkDecision({ payload: dogrulanmamis, bySub: null, byEmail: null })).toBe("reddet");
  });
});

describe("PKCE ve yetkilendirme adresi", () => {
  it("her çağrıda farklı verifier üretir ve challenge ondan türer", () => {
    const a = pkcePair();
    const b = pkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(a.verifier);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, dolgusuz
  });

  it("yetkilendirme adresi yalnızca hassas OLMAYAN kapsamları ister", () => {
    const url = buildAuthUrl({ clientId: "cid", redirectUri: "https://x/cb", state: "st", codeChallenge: "ch" });
    const q = new URL(url).searchParams;
    // Fazlası Google'ın doğrulama incelemesini tetiklerdi.
    expect(q.get("scope")).toBe("openid email profile");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("redirect_uri")).toBe("https://x/cb");
    expect(q.get("state")).toBe("st");
  });
});

describe("parseJwt", () => {
  it("geçerli tokenı parçalarına ayırır", () => {
    const p = parseJwt(tokenUret());
    expect(p.header.alg).toBe("RS256");
    expect(p.payload.sub).toBe("1234567890");
    expect(p.signature.length).toBeGreaterThan(0);
  });

  it("bozuk girdide null döner, fırlatmaz", () => {
    expect(parseJwt("a.b")).toBeNull();
    expect(parseJwt(null)).toBeNull();
  });
});
