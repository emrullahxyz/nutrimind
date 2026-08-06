import { describe, expect, it } from "vitest";
import cases from "./authRules.cases.json";
import {
  emailProblem,
  normalizeEmail,
  passwordProblem,
  registerProblem,
} from "./authRules";

// ============================================================================
// Nutrimind — İstemci Auth Doğrulama Kuralları Testleri.
//
// Bu test kümesi, istemci tarafındaki auth kurallarının (`authRules.ts`)
// beklenen doğrulama mantığını doğru çalıştırdığını ve paylaşılan vaka tablosu
// (`authRules.cases.json`) üzerindeki tüm durumları eksiksiz karşıladığını
// doğrular. İstemcide hatalı parola/e-posta kabul edilmesi veya geçerli
// girdilerin reddedilmesi gibi UX hatalarını engeller.
// ============================================================================

describe("normalizeEmail", () => {
  it("baştaki ve sondaki boşlukları kırpar ve tüm harfleri küçük harfe dönüştürür", () => {
    expect(normalizeEmail("  TEST.User@Example.COM  ")).toBe("test.user@example.com");
    expect(normalizeEmail("   ")).toBe("");
    expect(normalizeEmail("")).toBe("");
  });
});

describe("emailProblem (vaka tablosu)", () => {
  cases.email.forEach(({ girdi, sorun }) => {
    it(`girdi: "${girdi.slice(0, 30)}${girdi.length > 30 ? "..." : ""}" -> beklenen sorun: ${sorun}`, () => {
      expect(emailProblem(girdi)).toBe(sorun);
    });
  });
});

describe("passwordProblem (vaka tablosu)", () => {
  cases.password.forEach(({ girdi, sorun }) => {
    it(`girdi: "${girdi.slice(0, 30)}${girdi.length > 30 ? "..." : ""}" -> beklenen sorun: ${sorun}`, () => {
      expect(passwordProblem(girdi)).toBe(sorun);
    });
  });
});

describe("registerProblem", () => {
  it("e-posta hatalıysa e-posta hata mesajını döner", () => {
    const res = registerProblem({
      email: "gecersiz-eposta",
      password: "validPassword123",
      password2: "validPassword123",
    });
    expect(res).toBe("Geçerli bir e-posta adresi yaz.");
  });

  it("e-posta temiz ama parola hatalıysa parola hata mesajını döner", () => {
    const res = registerProblem({
      email: "kullanici@example.com",
      password: "kisa",
      password2: "kisa",
    });
    expect(res).toBe("Parola en az 8 karakter olmalı.");
  });

  it("e-posta ve parola temiz ama tekrar parolası eşleşmiyorsa 'Parolalar eşleşmiyor.' döner", () => {
    const res = registerProblem({
      email: "kullanici@example.com",
      password: "parola1234",
      password2: "parola5678",
    });
    expect(res).toBe("Parolalar eşleşmiyor.");
  });

  it("tüm alanlar geçerli ve parolalar eşleşiyorsa null döner", () => {
    const res = registerProblem({
      email: "kullanici@example.com",
      password: "parola1234",
      password2: "parola1234",
    });
    expect(res).toBeNull();
  });
});
