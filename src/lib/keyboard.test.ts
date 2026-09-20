import { describe, expect, it } from "vitest";
import { keyboardInset, MIN_KEYBOARD_PX } from "./keyboard";

// iOS'ta klavye `window.innerHeight`'ı DEĞİŞTİRMEZ; yalnızca görsel görünüm
// alanını küçültür. Bu hesap, tam ekran formlarda alanın klavyenin altında
// kalmasını engelleyen alt boşluğun kaynağı.

describe("keyboardInset", () => {
  it("klavye açıkken kaplanan yüksekliği verir", () => {
    // 844 px ekran, klavye 336 px, kaydırma yok
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  });

  it("görsel alan kaydırılmışsa kaydırma payı düşülür", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 100 })).toBe(236);
  });

  it("klavye yokken 0 — adres çubuğu gürültüsü klavye sanılmaz", () => {
    // Safari adres çubuğu ~60 px: eşik altı
    expect(keyboardInset(844, { height: 784, offsetTop: 0 })).toBe(0);
  });

  it("sınır EŞİK DAHİL: eşiğe ulaşan değer klavye sayılır, bir altı sayılmaz", () => {
    expect(keyboardInset(844, { height: 844 - MIN_KEYBOARD_PX, offsetTop: 0 })).toBe(
      MIN_KEYBOARD_PX,
    );
    expect(keyboardInset(844, { height: 844 - MIN_KEYBOARD_PX + 1, offsetTop: 0 })).toBe(0);
  });

  it("görsel görünüm alanı yoksa (masaüstü) 0", () => {
    expect(keyboardInset(900, null)).toBe(0);
    expect(keyboardInset(900, undefined)).toBe(0);
  });

  it("anlamsız ölçümlerde 0 döner (çökmez)", () => {
    expect(keyboardInset(Number.NaN, { height: 100, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: Number.NaN, offsetTop: 0 })).toBe(0);
  });
});
