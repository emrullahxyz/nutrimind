import { describe, expect, it } from "vitest";
import {
  categoryForHour,
  categoryForLoggedAt,
  groupMealsByCategory,
} from "./mealCategory";
import type { MealCategory } from "../types";

describe("mealCategory", () => {
  describe("categoryForHour", () => {
    it("returns correct category for hour boundaries", () => {
      expect(categoryForHour(0)).toBe("snack");
      expect(categoryForHour(4)).toBe("snack");
      expect(categoryForHour(5)).toBe("breakfast");
      expect(categoryForHour(10)).toBe("breakfast");
      expect(categoryForHour(11)).toBe("lunch");
      expect(categoryForHour(14)).toBe("lunch");
      expect(categoryForHour(15)).toBe("dinner");
      expect(categoryForHour(20)).toBe("dinner");
      expect(categoryForHour(21)).toBe("snack");
      expect(categoryForHour(23)).toBe("snack");
    });
  });

  describe("categoryForLoggedAt", () => {
    it("parses ISO date string and returns category based on local hour", () => {
      const date = new Date(2026, 7, 3, 8, 30); // 08:30 -> breakfast
      expect(categoryForLoggedAt(date.toISOString())).toBe("breakfast");
    });
  });

  describe("groupMealsByCategory", () => {
    it("places uncategorized meals into 'other'", () => {
      const meals = [
        { name: "Elma" },
        { name: "Yumurta", category: "breakfast" as MealCategory },
      ];
      const groups = groupMealsByCategory(meals);
      expect(groups).toEqual([
        {
          category: "breakfast",
          items: [{ meal: { name: "Yumurta", category: "breakfast" }, index: 1 }],
        },
        {
          category: "other",
          items: [{ meal: { name: "Elma" }, index: 0 }],
        },
      ]);
    });

    it("omits empty category groups from the result", () => {
      const meals = [{ name: "Tavuk Pilav", category: "lunch" as MealCategory }];
      const groups = groupMealsByCategory(meals);
      expect(groups).toEqual([
        {
          category: "lunch",
          items: [{ meal: { name: "Tavuk Pilav", category: "lunch" }, index: 0 }],
        },
      ]);
    });

    it("maintains strict category order breakfast -> lunch -> dinner -> snack -> other and preserves original flat array indices", () => {
      const meals = [
        { name: "Cips", category: "snack" as MealCategory },
        { name: "Steak", category: "dinner" as MealCategory },
        { name: "Bilinmeyen" },
        { name: "Omlet", category: "breakfast" as MealCategory },
        { name: "Salata", category: "lunch" as MealCategory },
        { name: "Peynir", category: "breakfast" as MealCategory },
      ];

      const groups = groupMealsByCategory(meals);
      expect(groups).toEqual([
        {
          category: "breakfast",
          items: [
            { meal: { name: "Omlet", category: "breakfast" }, index: 3 },
            { meal: { name: "Peynir", category: "breakfast" }, index: 5 },
          ],
        },
        {
          category: "lunch",
          items: [{ meal: { name: "Salata", category: "lunch" }, index: 4 }],
        },
        {
          category: "dinner",
          items: [{ meal: { name: "Steak", category: "dinner" }, index: 1 }],
        },
        {
          category: "snack",
          items: [{ meal: { name: "Cips", category: "snack" }, index: 0 }],
        },
        {
          category: "other",
          items: [{ meal: { name: "Bilinmeyen" }, index: 2 }],
        },
      ]);
    });
  });
});
