// EAN-13 kodlayıcısının testleri. İki cephe: (1) kontrol hanesi GERÇEK OFF
// ürün kodlarıyla uyuşmalı — yani tablolar/aritmetik dünyayla tutarlı, (2)
// modül deseni yapısal olarak doğru olmalı (korumalar, parite).
import { describe, expect, it } from "vitest";
import { ean13CheckDigit, ean13Modules, isValidEan13 } from "./ean13";
import {
  PIATNICA_SKYR_RESPONSE,
  SKYR_SEARCH_RESPONSE,
  TWAROG_SEARCH_RESPONSE,
} from "./off.fixtures";

/** Modülleri 0/1 dizgesine çevirir — beklenenler okunabilir olsun. */
const bits = (code: string, start = 0, len = 95): string => {
  const modules = ean13Modules(code);
  if (!modules) throw new Error(`geçersiz kod: ${code}`);
  return modules
    .slice(start, start + len)
    .map((m) => (m ? "1" : "0"))
    .join("");
};

describe("ean13CheckDigit", () => {
  it("12 hane dışındaki girdide null döner", () => {
    expect(ean13CheckDigit("12345")).toBeNull();
    expect(ean13CheckDigit("1234567890123")).toBeNull();
    expect(ean13CheckDigit("59005310045ab")).toBeNull();
    expect(ean13CheckDigit("")).toBeNull();
  });

  it("tek konumlar ×1, çift konumlar ×3 toplar", () => {
    // 000000000000 → toplam 0 → hane 0
    expect(ean13CheckDigit("000000000000")).toBe(0);
    // 100000000000 → tek konum 1 → (10 - 1) % 10 = 9
    expect(ean13CheckDigit("100000000000")).toBe(9);
  });
});

describe("isValidEan13", () => {
  it("OFF'tan gerçekten alınmış ürün kodlarının kontrol hanesi tutar", () => {
    // Fixture dosyasındaki kodlar OFF'tan olduğu gibi alındı (kendi kodumuzla
    // üretilmedi) — bu yüzden bağımsız bir doğrulama.
    const codes = [
      PIATNICA_SKYR_RESPONSE.barcode,
      ...SKYR_SEARCH_RESPONSE.products.map((p) => p.code),
      ...TWAROG_SEARCH_RESPONSE.products.map((p) => p.code),
    ].filter((c) => c.length === 13);

    expect(codes.length).toBeGreaterThan(5); // testin boşa düşmediğinin kanıtı
    for (const code of codes) expect({ code, valid: isValidEan13(code) }).toEqual({ code, valid: true });
  });

  it("bozuk kontrol hanesini reddeder", () => {
    expect(isValidEan13("5900531004544")).toBe(true);
    expect(isValidEan13("5900531004545")).toBe(false);
    expect(isValidEan13("590053100454")).toBe(false); // 12 hane
    expect(isValidEan13("59005310045444")).toBe(false); // 14 hane
    expect(isValidEan13("590053100454a")).toBe(false);
  });
});

describe("ean13Modules", () => {
  it("95 modül üretir ve koruma desenlerini doğru yerlere koyar", () => {
    expect(ean13Modules("5900531004544")).toHaveLength(95);
    expect(bits("5900531004544", 0, 3)).toBe("101"); // başlangıç
    expect(bits("5900531004544", 45, 5)).toBe("01010"); // orta
    expect(bits("5900531004544", 92, 3)).toBe("101"); // bitiş
  });

  it("ilk hane ÇİZİLMEZ, sol yarının paritesini seçer (5 → LGGLLG)", () => {
    // 5900531004544: ilk hane 5 → sol hane 9 L, 0 G, 0 G, 5 L, 3 L, 1 G.
    expect(bits("5900531004544", 3, 7)).toBe("0001011"); // L[9]
    expect(bits("5900531004544", 10, 7)).toBe("0100111"); // G[0]
    expect(bits("5900531004544", 17, 7)).toBe("0100111"); // G[0]
    expect(bits("5900531004544", 24, 7)).toBe("0110001"); // L[5]
    expect(bits("5900531004544", 31, 7)).toBe("0111101"); // L[3]
    expect(bits("5900531004544", 38, 7)).toBe("0110011"); // G[1]
    // Sağ yarı her zaman R: 0,0,4,5,4,4
    expect(bits("5900531004544", 50, 7)).toBe("1110010"); // R[0]
    expect(bits("5900531004544", 64, 7)).toBe("1011100"); // R[4]
    expect(bits("5900531004544")).toHaveLength(95);
  });

  it("ilk hane 0 ise sol yarının tamamı tek paritedir", () => {
    // Elle doğrulanabilir tam beklenti: 0000000000000 (kontrol hanesi 0).
    expect(bits("0000000000000")).toBe(
      "101" + "0001101".repeat(6) + "01010" + "1110010".repeat(6) + "101",
    );
  });

  it("geçersiz kodda null döner (bozuk barkod çizilmez)", () => {
    expect(ean13Modules("5900531004545")).toBeNull();
    expect(ean13Modules("123")).toBeNull();
    expect(ean13Modules("")).toBeNull();
  });

  it("ilk hane 9 için parite deseni LGGLGL'dir", () => {
    // 900000000000 → kontrol hanesi 1; sol hane 0 → L,G,G,L,G,L paritesi.
    expect(ean13CheckDigit("900000000000")).toBe(1);
    expect(bits("9000000000001", 3, 7)).toBe("0001101"); // L[0]
    expect(bits("9000000000001", 10, 7)).toBe("0100111"); // G[0]
    expect(bits("9000000000001", 17, 7)).toBe("0100111"); // G[0]
    expect(bits("9000000000001", 24, 7)).toBe("0001101"); // L[0]
    expect(bits("9000000000001", 31, 7)).toBe("0100111"); // G[0]
    expect(bits("9000000000001", 38, 7)).toBe("0001101"); // L[0]
  });
});
