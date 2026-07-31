// ============================================================================
// ScanSheet'in saf mantığı — Faz S3. `seedTrigger` bu fazın en riskli kararı:
// Faz 4 tetikleyiciyi BİLEREK boş bırakıyordu (uzun raf adı kötü tetikleyici
// olur), ama bu Kaydet'i açıklamasız kilitliyordu. Burada test edilen kural
// "doldurmamak" değil "KISA ve düzenlenebilir öner".
// ============================================================================
import { describe, expect, it } from "vitest";
import { defaultScanGrams, seedTrigger } from "./scan";
import { OFF_SERVING_G } from "./off";

describe("seedTrigger — uzun Lehçe raf adı", () => {
  it("brief'teki örnek: ilk sınırdan sonrasını atar, ilk kelimeyi önerir", () => {
    expect(seedTrigger("Skyr - jogurt typu islandzkiego z truskawkami")).toBe("skyr");
  });
  it("tire boşluksuzsa (bileşik kelime) BÖLÜNMEZ", () => {
    expect(seedTrigger("light-fit yoğurt")).toBe("light-fit yoğurt");
  });
});

describe("seedTrigger — noktalama", () => {
  it("virgülden sonrasını atar", () => {
    expect(seedTrigger("Jogurt, naturalny 400g")).toBe("jogurt");
  });
  it("parantez içeriğini almaz", () => {
    expect(seedTrigger("Twaróg (light) 250g")).toBe("twaróg");
  });
  it("noktalı virgül ve iki nokta da sınır sayılır", () => {
    expect(seedTrigger("Ser; twaróg")).toBe("ser");
    expect(seedTrigger("Ser: twaróg")).toBe("ser");
  });
});

describe("seedTrigger — tek kelimelik ad", () => {
  it("sınır yoksa olduğu gibi (küçük harfle) döner", () => {
    expect(seedTrigger("Twaróg")).toBe("twaróg");
  });
  it("sınır yoksa ve iki kelimeyse ikisi de alınır", () => {
    expect(seedTrigger("Skyr Naturalny")).toBe("skyr naturalny");
  });
  it("ikiden fazla kelime varsa yalnızca ilk ikisi alınır (KISA kalsın)", () => {
    expect(seedTrigger("Skyr Naturalny Islandzki Premium")).toBe("skyr naturalny");
  });
});

describe("seedTrigger — boş sonuç üreten adlar", () => {
  it("yalnızca rakam/noktalama içeren ad boş döner", () => {
    expect(seedTrigger("123")).toBe("");
    expect(seedTrigger("%0")).toBe("");
    expect(seedTrigger("---")).toBe("");
  });
  it("boş/boşluk metin boş döner", () => {
    expect(seedTrigger("")).toBe("");
    expect(seedTrigger("   ")).toBe("");
  });
  it("OFF'un 'İsimsiz ürün' yedeği bile BOŞ değil (form yine dolduruluyor)", () => {
    expect(seedTrigger("İsimsiz ürün").length).toBeGreaterThan(0);
  });
});

describe("defaultScanGrams — ambalaj/porsiyon ipucundan öntanımlı miktar", () => {
  it("ambalaj miktarından okur (Piątnica Skyr: '150 g')", () => {
    expect(defaultScanGrams({ quantity: "150 g", servingSize: null })).toBe(150);
  });
  it("ambalaj yoksa porsiyon metninden okur ('1 portion (150 g)')", () => {
    expect(defaultScanGrams({ quantity: null, servingSize: "1 portion (150 g)" })).toBe(150);
  });
  it("ikisi de yoksa/okunamıyorsa OFF'un referans değerine (100 g) düşer", () => {
    expect(defaultScanGrams({ quantity: null, servingSize: null })).toBe(OFF_SERVING_G);
    expect(defaultScanGrams({ quantity: "büyük paket", servingSize: null })).toBe(OFF_SERVING_G);
  });
  it("virgüllü ondalık da okunur (tr-TR/pl-PL yazımı)", () => {
    expect(defaultScanGrams({ quantity: "12,5 g", servingSize: null })).toBe(12.5);
  });
});
