import { describe, expect, it } from "vitest";
import type { MealItem } from "../types";
import { toPayload } from "./days";

describe("toPayload", () => {
  it("MealItem üzerindeki sources alanını MealPayload'a aktarmalı", () => {
    const meals: MealItem[] = [
      {
        id: "1",
        label: "Yoğurt (150g)",
        computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
        sources: [{ aliasId: "yogurt", qty: 150, unit: "g" }],
      },
      {
        id: "2",
        label: "Elma",
        computed: { kcal: 50, protein: 0, carbs: 12, fat: 0, fiber: 2 },
      },
    ];

    const payload = toPayload(meals);
    expect(payload[0].sources).toEqual([{ aliasId: "yogurt", qty: 150, unit: "g" }]);
    expect(payload[1].sources).toBeUndefined();
  });

  it("templateId'yi MealPayload'a aktarır — şablon kullanım sayacının kaynağı", () => {
    const payload = toPayload([
      {
        id: "1",
        label: "Sabah Kahvaltısı",
        computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
        templateId: "t_kahvalti",
      },
      {
        id: "2",
        label: "Elle eklenen",
        computed: { kcal: 50, protein: 1, carbs: 10, fat: 0, fiber: 1 },
      },
    ]);
    expect(payload[0].templateId).toBe("t_kahvalti");
    // Elle eklenen öğünde alan hiç yazılmaz (sayaç 0 — hata değil).
    expect(payload[1].templateId).toBeUndefined();
  });

  it("kaynaksız kalemin gramajını taşır (şablondan uygulama kaybı)", () => {
    const payload = toPayload([
      {
        id: "1",
        label: "Ev yapımı sos",
        computed: { kcal: 225, protein: 1, carbs: 8, fat: 20, fiber: 1 },
        grams: 150,
      },
    ]);
    expect(payload[0].grams).toBe(150);
  });
});
