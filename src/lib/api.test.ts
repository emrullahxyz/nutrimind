import { describe, expect, it } from "vitest";
import { parseSources } from "./api";
import { defaultUnitForAlias } from "./nutrition";

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
