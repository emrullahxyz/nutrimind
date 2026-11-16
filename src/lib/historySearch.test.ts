import { describe, expect, it } from "vitest";
import type { MealItem } from "../types";
import type { Days } from "./days";
import { filterHistoryWeeks } from "./historySearch";
import { weeks } from "./weeks";

function meal(label: string, kcal = 400): MealItem {
  return { id: label, label, computed: { kcal, protein: 10, carbs: 20, fat: 5, fiber: 2 } };
}

const days: Days = {
  "2026-11-16": [meal("Mercimek çorbası")],
  "2026-11-09": [meal("2 Lahmacun"), meal("Ayran", 100)],
  "2026-11-10": [meal("Lahmacun", 300)],
  "2026-11-02": [
    { ...meal("Akşam yemeği"), items: [{ name: "Lahmacun", nutrition: meal("").computed }] },
  ],
  "2026-10-26": [meal("Ispanak ve SÜT")],
  "2026-10-19": [meal("İncir")],
  "2026-10-12": [meal("Pilav")],
  "2026-10-05": [meal("Eski lahmacun")],
};

describe("filterHistoryWeeks", () => {
  it.each(["lahmacun", "LAHMACUN", " Lahma "])(
    "matches titles and ingredients across all weeks: %s",
    (query) => {
      expect(filterHistoryWeeks(weeks(days), days, query).map((w) => w.startDate)).toEqual([
        "2026-11-09",
        "2026-11-02",
        "2026-10-05",
      ]);
    },
  );

  it.each([
    ["ıspanak", "2026-10-26"],
    ["süt", "2026-10-26"],
    ["incir", "2026-10-19"],
  ])("handles Turkish casing: %s", (query, date) => {
    expect(filterHistoryWeeks(weeks(days), days, query).map((w) => w.startDate)).toEqual([date]);
  });

  it.each(["", "   "])("returns all weeks for an empty query", (query) => {
    const all = weeks(days);
    expect(filterHistoryWeeks(all, days, query)).toBe(all);
  });

  it("returns no matches for absent food or absent records", () => {
    expect(filterHistoryWeeks(weeks(days), days, "pizza")).toEqual([]);
    expect(filterHistoryWeeks([], {}, "lahmacun")).toEqual([]);
  });

  it("keeps complete week totals and original objects without mutating input", () => {
    const all = weeks(days);
    const before = JSON.stringify({ all, days });
    const result = filterHistoryWeeks(all, days, "lahmacun");
    expect(result[0]).toBe(all[1]);
    expect(result[0].total.kcal).toBe(800);
    expect(result[0].activeDays).toBe(2);
    expect(result[0].avgKcal).toBe(400);
    expect(JSON.stringify({ all, days })).toBe(before);
  });

  it("uses refreshed day data instead of retaining stale matches", () => {
    const updated = { ...days, "2026-11-02": [meal("Pilav")] };
    expect(filterHistoryWeeks(weeks(updated), updated, "lahmacun").map((w) => w.startDate)).toEqual(
      ["2026-11-09", "2026-10-05"],
    );
  });
});
