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

  it("sources VARKEN de gramaj korunur (birleştirilmiş şablon: kaynaksız kalem)", () => {
    // `grams` artık yalnız kaynaksız öğüne yazılmıyor: tek öğüne birleşen
    // şablonda kaynaklı + kaynaksız kalem bir arada durur.
    const days = parseDays(
      raw([
        {
          name: "Yulaf + Ev sosu",
          nutrition: { kcal: 450 },
          sources: [{ aliasId: "yulaf", qty: 90, unit: "g" }],
          grams: 50,
        },
      ]),
    );
    expect(days["2026-10-05"][0].sources).toHaveLength(1);
    expect(days["2026-10-05"][0].grams).toBe(50);
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

  it("items'ı MealItem'a taşır (kalem kırılımı sunucu gidiş-dönüşünde kaybolmaz)", () => {
    const days = parseDays(
      raw([
        {
          name: "Kahvaltı",
          nutrition: { kcal: 300 },
          items: [
            { name: "Yulaf", nutrition: { kcal: 200 }, sources: [{ aliasId: "yulaf", qty: 90, unit: "g" }] },
            { name: "Ev sosu", nutrition: { kcal: 100 }, grams: 40 },
          ],
        },
      ]),
    );
    const items = days["2026-10-05"][0].items;
    expect(items).toHaveLength(2);
    expect(items?.[0]).toEqual({
      name: "Yulaf",
      nutrition: expect.objectContaining({ kcal: 200 }),
      sources: [{ aliasId: "yulaf", qty: 90, unit: "g" }],
    });
    expect(items?.[1]).toEqual({
      name: "Ev sosu",
      nutrition: expect.objectContaining({ kcal: 100 }),
      grams: 40,
    });
  });

  it("bozuk items boş/atılır — items yoksa alan hiç yazılmaz", () => {
    // namesiz kalem + dizi olmayan items → boş sonuç → alan YAZILMAZ.
    const days = parseDays(
      raw([{ name: "X", nutrition: { kcal: 1 }, items: [{ nutrition: { kcal: 1 } }, "çöp"] }]),
    );
    expect("items" in days["2026-10-05"][0]).toBe(false);
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
