import { describe, expect, it } from "vitest";
import type { Alias, MealItem } from "../types";
import type { Days } from "./days";
import { usualQuantity } from "./quantity";

describe("usualQuantity", () => {
  const mockAliases: Alias[] = [
    {
      id: "yogurt",
      name: "Yoğurt",
      triggers: ["yogurt", "yoğurt"],
      brand: null,
      serving_g: 100,
      nutrition: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 0 },
    },
    {
      id: "yumurta",
      name: "Yumurta",
      triggers: ["yumurta"],
      brand: null,
      serving_g: 50,
      nutrition: { kcal: 70, protein: 6, carbs: 0, fat: 5, fiber: 0 },
      units: [{ name: "adet", grams: 50 }],
    },
  ];

  it("hiç veri yokken null döndürmeli", () => {
    const days: Days = {};
    expect(usualQuantity(days, "yogurt", "g", mockAliases)).toBeNull();
  });

  it("tek örnek varken null döndürmeli (en az 2 örnek gerekli)", () => {
    const days: Days = {
      "2026-07-30": [
        {
          id: "1",
          label: "Yoğurt (150g)",
          computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 150, unit: "g" }],
        },
      ],
    };
    expect(usualQuantity(days, "yogurt", "g", mockAliases)).toBeNull();
  });

  it("tek sayıda örnek için medyan doğru hesaplanmalı (3 örnek)", () => {
    const days: Days = {
      "2026-07-30": [
        {
          id: "1",
          label: "Yoğurt (150g)",
          computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 150, unit: "g" }],
        },
      ],
      "2026-07-29": [
        {
          id: "2",
          label: "Yoğurt (100g)",
          computed: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 100, unit: "g" }],
        },
      ],
      "2026-07-28": [
        {
          id: "3",
          label: "Yoğurt (200g)",
          computed: { kcal: 120, protein: 6, carbs: 8, fat: 6, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 200, unit: "g" }],
        },
      ],
    };

    // 100, 150, 200 -> medyan 150
    const result = usualQuantity(days, "yogurt", "g", mockAliases);
    expect(result).toEqual({ value: 150, sampleCount: 3 });
  });

  it("çift sayıda örnek için medyan doğru hesaplanmalı (4 örnek)", () => {
    const days: Days = {
      "2026-07-30": [
        {
          id: "1",
          label: "Yoğurt (100g)",
          computed: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 100, unit: "g" }],
        },
      ],
      "2026-07-29": [
        {
          id: "2",
          label: "Yoğurt (150g)",
          computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 150, unit: "g" }],
        },
      ],
      "2026-07-28": [
        {
          id: "3",
          label: "Yoğurt (200g)",
          computed: { kcal: 120, protein: 6, carbs: 8, fat: 6, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 200, unit: "g" }],
        },
      ],
      "2026-07-27": [
        {
          id: "4",
          label: "Yoğurt (250g)",
          computed: { kcal: 150, protein: 7.5, carbs: 10, fat: 7.5, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 250, unit: "g" }],
        },
      ],
    };

    // 100, 150, 200, 250 -> medyan (150 + 200) / 2 = 175
    const result = usualQuantity(days, "yogurt", "g", mockAliases);
    expect(result).toEqual({ value: 175, sampleCount: 4 });
  });

  it("en son 10 kayıt sınırına uymalı", () => {
    const days: Days = {};

    // 12 gün kayıt ekleyelim (en yeni 10 gün 100g, en eski 2 gün 999g)
    for (let i = 1; i <= 12; i++) {
      const dateStr = `2026-07-${i.toString().padStart(2, "0")}`;
      const qty = i <= 2 ? 999 : 100;
      days[dateStr] = [
        {
          id: `m_${i}`,
          label: `Yoğurt (${qty}g)`,
          computed: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty, unit: "g" }],
        },
      ];
    }

    // datesDesc en yeni tarihlerden başlar (2026-07-12, 11, 10... 03).
    // İlk 10 kayıt hepsi 100g olmalı, 999g'lık eski kayıtlar hesaba girmemeli.
    const result = usualQuantity(days, "yogurt", "g", mockAliases);
    expect(result).toEqual({ value: 100, sampleCount: 10 });
  });

  it("birim ayrımına uymalı (gram geçmişi adet tahminine karışmamalı)", () => {
    const days: Days = {
      "2026-07-30": [
        {
          id: "1",
          label: "Yumurta (100g)",
          computed: { kcal: 140, protein: 12, carbs: 0, fat: 10, fiber: 0 },
          sources: [{ aliasId: "yumurta", qty: 100, unit: "g" }],
        },
      ],
      "2026-07-29": [
        {
          id: "2",
          label: "Yumurta (150g)",
          computed: { kcal: 210, protein: 18, carbs: 0, fat: 15, fiber: 0 },
          sources: [{ aliasId: "yumurta", qty: 150, unit: "g" }],
        },
      ],
      "2026-07-28": [
        {
          id: "3",
          label: "Yumurta (2 adet)",
          computed: { kcal: 140, protein: 12, carbs: 0, fat: 10, fiber: 0 },
          sources: [{ aliasId: "yumurta", qty: 2, unit: "adet" }],
        },
      ],
    };

    // "adet" için sadece 1 kayıt var -> null
    expect(usualQuantity(days, "yumurta", "adet", mockAliases)).toBeNull();

    // "g" için 2 kayıt var (100, 150) -> medyan 125
    expect(usualQuantity(days, "yumurta", "g", mockAliases)).toEqual({
      value: 125,
      sampleCount: 2,
    });
  });

  it("bozuk sources verilerini eleyebilmeli", () => {
    const days: Days = {
      "2026-07-30": [
        {
          id: "1",
          label: "Bozuk",
          computed: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: -50, unit: "g" }],
        },
        {
          id: "2",
          label: "Bozuk NaN",
          computed: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: NaN, unit: "g" }],
        },
      ],
      "2026-07-29": [
        {
          id: "3",
          label: "Geçerli 1",
          computed: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 100, unit: "g" }],
        },
      ],
      "2026-07-28": [
        {
          id: "4",
          label: "Geçerli 2",
          computed: { kcal: 60, protein: 3, carbs: 4, fat: 3, fiber: 0 },
          sources: [{ aliasId: "yogurt", qty: 200, unit: "g" }],
        },
      ],
    };

    // Bozuk kayıtlar elenmeli, kalan 100 ve 200 ile medyan 150 çıkmalı
    expect(usualQuantity(days, "yogurt", "g", mockAliases)).toEqual({
      value: 150,
      sampleCount: 2,
    });
  });

  it("eski kayıtlar için (sources yoksa) regex yedeğini kullanabilmeli", () => {
    const days: Days = {
      "2026-07-30": [
        {
          id: "1",
          label: "Yoğurt (150g)",
          computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
          // sources yok
        },
      ],
      "2026-07-29": [
        {
          id: "2",
          label: "Yoğurt (250g) + Yumurta (2 adet)",
          computed: { kcal: 290, protein: 19.5, carbs: 10, fat: 17.5, fiber: 0 },
          // sources yok
        },
      ],
    };

    const yogurtResult = usualQuantity(days, "yogurt", "g", mockAliases);
    expect(yogurtResult).toEqual({ value: 200, sampleCount: 2 }); // (150 + 250)/2 = 200
  });
});
