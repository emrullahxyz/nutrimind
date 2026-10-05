import { describe, expect, it } from "vitest";
import { parseDays, parseSources } from "./api";
import { defaultUnitForAlias } from "./nutrition";

describe("parseDays", () => {
  const raw = (meals: unknown[]) =>
    ({ goals: null, days: { "2026-10-05": meals } }) as unknown as Parameters<typeof parseDays>[0];

  it("templateId'yi MealItem'a taşır — kullanım sayacı gün verisinden türer", () => {
    const days = parseDays(raw([{ name: "Kahvaltı", nutrition: { kcal: 100 }, templateId: "t_1" }]));
    expect(days["2026-10-05"][0].templateId).toBe("t_1");
  });

  it("templateId yoksa alan hiç yazılmaz (sayaç 0 — hata değil)", () => {
    const days = parseDays(raw([{ name: "Elle öğün", nutrition: { kcal: 100 } }]));
    expect("templateId" in days["2026-10-05"][0]).toBe(false);
  });

  it("boş templateId yok sayılır", () => {
    const days = parseDays(raw([{ name: "X", nutrition: { kcal: 1 }, templateId: "   " }]));
    expect(days["2026-10-05"][0].templateId).toBeUndefined();
  });

  it("kaynaksız kalemin gramajını korur", () => {
    const days = parseDays(raw([{ name: "Ev yapımı sos", nutrition: { kcal: 225 }, grams: 150 }]));
    expect(days["2026-10-05"][0].grams).toBe(150);
  });

  it("grams yalnız pozitif ve sonlu kabul edilir (0/negatif/geçersiz = bilinmiyor)", () => {
    expect(parseDays(raw([{ name: "A", nutrition: { kcal: 1 }, grams: 0 }]))["2026-10-05"][0].grams)
      .toBeUndefined();
    expect(parseDays(raw([{ name: "A", nutrition: { kcal: 1 }, grams: -5 }]))["2026-10-05"][0].grams)
      .toBeUndefined();
    expect(
      parseDays(raw([{ name: "A", nutrition: { kcal: 1 }, grams: "150" }]))["2026-10-05"][0].grams,
    ).toBeUndefined();
  });
});

describe("parseSources", () => {
  it("geçerli sources verisini ayrıştırmalı", () => {
    const raw = [
      { aliasId: "yogurt", qty: 150, unit: "g" },
      { aliasId: "yumurta", qty: 2, unit: "adet" },
    ];
    expect(parseSources(raw)).toEqual([
      { aliasId: "yogurt", qty: 150, unit: "g" },
      { aliasId: "yumurta", qty: 2, unit: "adet" },
    ]);
  });

  it("bozuk/hatalı satırları elenebilmeli", () => {
    const raw = [
      { aliasId: "", qty: 150, unit: "g" },
      { aliasId: "yogurt", qty: -10, unit: "g" },
      { aliasId: "yogurt", qty: "invalid", unit: "g" },
      null,
      "not an object",
    ];
    expect(parseSources(raw)).toBeUndefined();
  });

  it("varsayılan birim 'g' atanmalı", () => {
    const raw = [{ aliasId: "yogurt", qty: 150 }];
    expect(parseSources(raw)).toEqual([{ aliasId: "yogurt", qty: 150, unit: "g" }]);
  });

  it("alias defaultUnit değeri mevcut modelde güvenle kullanılabilir", () => {
    expect(defaultUnitForAlias({ defaultUnit: "adet", units: [{ name: "adet", grams: 50 }] }).name).toBe("adet");
  });
});
