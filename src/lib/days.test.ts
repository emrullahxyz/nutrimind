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
});
