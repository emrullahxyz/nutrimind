import { describe, expect, it } from "vitest";
import auth from "./auth.js";
import cases from "../src/lib/authRules.cases.json";

// ============================================================================
// Nutrimind — Sunucu Kimlik Doğrulama İlkeleri Testleri (Faz B).
//
// Bu dosya `server/auth.js` içindeki kimlik doğrulama ilkellerini (scrypt parola
// karma, oturum kimlikleme, çerez ayrıştırma/serileştirme, hız sınırlayıcı ve
// CSRF köken kontrolü) ve istemci-sunucu ayna uyumunu doğrular.
// ============================================================================

describe("Paylaşılan vaka tablosu aynalık kontrolü", () => {
  // Bu testin varlık sebebi: istemci (authRules.ts) ile sunucu (server/auth.js)
  // doğrulama kurallarının birbirinden kaymadığını (aynı kaldığını) kanıtlamaktır.
  cases.email.forEach(({ girdi, sorun }) => {
    it(`emailProblem girdi: "${girdi.slice(0, 30)}${girdi.length > 30 ? "..." : ""}"`, () => {
      expect(auth.emailProblem(girdi)).toBe(sorun);
    });
  });

  cases.password.forEach(({ girdi, sorun }) => {
    it(`passwordProblem girdi: "${girdi.slice(0, 30)}${girdi.length > 30 ? "..." : ""}"`, () => {
      expect(auth.passwordProblem(girdi)).toBe(sorun);
    });
  });
});

describe("hashPassword / verifyPassword", () => {
  it("doğru parola doğrulanır, yanlış parola reddedilir", () => {
    const hash = auth.hashPassword("parolam123");
    expect(auth.verifyPassword("parolam123", hash)).toBe(true);
    expect(auth.verifyPassword("yanlisparola", hash)).toBe(false);
  });

  it("aynı parola iki kez karma alınınca FARKLI çıktı verir (rastgele salt)", () => {
    const h1 = auth.hashPassword("parolam123");
    const h2 = auth.hashPassword("parolam123");
    expect(h1).not.toBe(h2);
  });

  it("üretilen karma scrypt$N=...,r=...,p=...$salt$hash biçimindedir (4 parça, $ ile ayrık)", () => {
    const hash = auth.hashPassword("parolam123");
    const parts = hash.split("$");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toMatch(/^N=\d+,r=\d+,p=\d+$/);
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it("bozuk/eksik/boş karma verifyPassword'de false döner, FIRLATMAZ", () => {
    expect(auth.verifyPassword("parolam123", "")).toBe(false);
    expect(auth.verifyPassword("parolam123", "abc")).toBe(false);
    expect(auth.verifyPassword("parolam123", "scrypt$$$")).toBe(false);
    expect(auth.verifyPassword("parolam123", null)).toBe(false);
    expect(auth.verifyPassword("parolam123", undefined)).toBe(false);
    expect(auth.verifyPassword("parolam123", "bcrypt$x$y$z")).toBe(false);
  });

  it("Türkçe karakterli parola ('şifreÇÖĞÜ') karma alınıp doğrulanabiliyor", () => {
    const trPass = "şifreÇÖĞÜ";
    const hash = auth.hashPassword(trPass);
    expect(auth.verifyPassword(trPass, hash)).toBe(true);
    expect(auth.verifyPassword("sifreCOGU", hash)).toBe(false);
  });
});

describe("newSessionId / hashSessionId", () => {
  it("newSessionId her çağrıda farklı, 64 karakter onaltılık döner", () => {
    const id1 = auth.newSessionId();
    const id2 = auth.newSessionId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{64}$/);
    expect(id2).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashSessionId deterministik, 64 karakter onaltılık ve girdiden farklıdır", () => {
    const id = auth.newSessionId();
    const hash1 = auth.hashSessionId(id);
    const hash2 = auth.hashSessionId(id);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).not.toBe(id);
  });
});

describe("parseCookies", () => {
  it("'a=1; b=2' -> {a:'1', b:'2'}, boş/undefined/bozuk girdi -> {}", () => {
    expect(auth.parseCookies("a=1; b=2")).toEqual({ a: "1", b: "2" });
    expect(auth.parseCookies("")).toEqual({});
    expect(auth.parseCookies(undefined)).toEqual({});
    expect(auth.parseCookies(null)).toEqual({});
  });

  it("değer yüzde kodluysa çözülür; bozuk yüzde kodlaması FIRLATMAZ", () => {
    expect(auth.parseCookies("user=%C3%96mer")).toEqual({ user: "Ömer" });
    expect(auth.parseCookies("a=%E0%A4%A")).toEqual({ a: "%E0%A4%A" });
  });

  it("tırnaklı değer tırnaksız döner", () => {
    expect(auth.parseCookies('a="x"')).toEqual({ a: "x" });
  });

  it("= içermeyen parça atlanır", () => {
    expect(auth.parseCookies("invalidcookie; a=1; badpart")).toEqual({ a: "1" });
  });
});

describe("serializeCookie / clearCookie", () => {
  it("varsayılanlar HttpOnly, Path=/, SameSite=Lax içerir", () => {
    const cookie = auth.serializeCookie("sid", "123");
    expect(cookie).toContain("sid=123");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("secure: true verilince Secure eklenir, verilmeyince EKLENMEZ", () => {
    const secureCookie = auth.serializeCookie("sid", "123", { secure: true });
    expect(secureCookie).toContain("Secure");
    const nonSecure = auth.serializeCookie("sid", "123", { secure: false });
    expect(nonSecure).not.toContain("Secure");
  });

  it("clearCookie Max-Age=0 içerir", () => {
    const cleared = auth.clearCookie("sid");
    expect(cleared).toContain("sid=");
    expect(cleared).toContain("Max-Age=0");
  });
});

describe("createKeyedLimiter", () => {
  it("perMinute kadar istek geçer, sonraki reddedilir (allowed: false)", () => {
    const limiter = auth.createKeyedLimiter({ perMinute: 2 });
    const now = 100000;
    expect(limiter.take("ip1", now)).toEqual({ allowed: true, retryAfter: 0 });
    expect(limiter.take("ip1", now)).toEqual({ allowed: true, retryAfter: 0 });
    const res = limiter.take("ip1", now);
    expect(res.allowed).toBe(false);
    expect(res.retryAfter).toBeGreaterThan(0);
  });

  it("anahtarlar birbirinden bağımsızdır", () => {
    const limiter = auth.createKeyedLimiter({ perMinute: 1 });
    const now = 100000;
    expect(limiter.take("ip1", now).allowed).toBe(true);
    expect(limiter.take("ip1", now).allowed).toBe(false);
    expect(limiter.take("ip2", now).allowed).toBe(true);
  });

  it("zaman ilerleyince jeton dolar", () => {
    const limiter = auth.createKeyedLimiter({ perMinute: 1 });
    let now = 100000;
    expect(limiter.take("ip1", now).allowed).toBe(true);
    expect(limiter.take("ip1", now).allowed).toBe(false);
    // 60 saniye (60000 ms) sonra 1 jeton yenilenmeli
    now += 60000;
    expect(limiter.take("ip1", now).allowed).toBe(true);
  });

  it("maxKeys aşılınca size() sınırın üstüne çıkmaz", () => {
    const limiter = auth.createKeyedLimiter({ maxKeys: 2 });
    const now = 100000;
    limiter.take("k1", now);
    limiter.take("k2", now);
    expect(limiter.size()).toBe(2);
    limiter.take("k3", now);
    expect(limiter.size()).toBe(2);
  });
});

describe("isSameOriginRequest", () => {
  it("sec-fetch-site: same-origin -> true; cross-site -> false; same-site -> false", () => {
    expect(auth.isSameOriginRequest({ "sec-fetch-site": "same-origin" }, "https://example.com")).toBe(true);
    expect(auth.isSameOriginRequest({ "sec-fetch-site": "cross-site" }, "https://example.com")).toBe(false);
    expect(auth.isSameOriginRequest({ "sec-fetch-site": "same-site" }, "https://example.com")).toBe(false);
  });

  it("sec-fetch-site yok + origin yok -> true (curl)", () => {
    expect(auth.isSameOriginRequest({}, "https://example.com")).toBe(true);
  });

  it("sec-fetch-site yok + origin izin verilenle aynı -> true; farklı -> false", () => {
    expect(auth.isSameOriginRequest({ origin: "https://example.com" }, "https://example.com")).toBe(true);
    expect(auth.isSameOriginRequest({ origin: "https://evil.com" }, "https://example.com")).toBe(false);
  });
});
