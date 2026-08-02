import { describe, expect, it } from "vitest";
import { breakdownRows } from "./mealBreakdown";
import { makeNutrition } from "./nutrients";

describe("breakdownRows", () => {
  it("4 makroyu her zaman registry sırasında döner", () => {
    const n = makeNutrition({ kcal: 500, protein: 30, carbs: 40, fat: 10, fiber: 5 });
    const rows = breakdownRows(n);
    const macroKeys = rows.filter((r) => r.def.group === "macro").map((r) => r.def.key);
    expect(macroKeys).toEqual(["protein", "carbs", "fat", "fiber"]);
  });

  it("girilmiş mikro (0 dahil) görünür, girilmemiş mikro HİÇ görünmez", () => {
    const n = makeNutrition({ kcal: 500, protein: 30, carbs: 40, fat: 10, fiber: 5, sodium: 0 });
    const rows = breakdownRows(n);
    const microKeys = rows.filter((r) => r.def.group === "micro").map((r) => r.def.key);
    expect(microKeys).toEqual(["sodium"]);
    expect(rows.find((r) => r.def.key === "sodium")?.value).toBe(0);
    expect(microKeys).not.toContain("sugar");
    expect(microKeys).not.toContain("satFat");
  });

  it("hiç mikro girilmemişse yalnızca 4 satır döner", () => {
    const n = makeNutrition({ kcal: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 });
    expect(breakdownRows(n)).toHaveLength(4);
  });
});
