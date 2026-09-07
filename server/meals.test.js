import { describe, expect, it } from "vitest";
import { normalizeMeals, MAX_MEALS } from "./meals.js";

describe("normalizeMeals", () => {
  it("geçerli dizi aynen döner", () => {
    const r = normalizeMeals([{ name: "Yumurta", nutrition: { kcal: 70 } }]);
    expect(r.ok).toBe(true);
    expect(r.meals).toEqual([{ name: "Yumurta", nutrition: { kcal: 70 } }]);
  });

  it("nesne olmayan öğeyi reddeder", () => {
    expect(normalizeMeals(["abc"]).ok).toBe(false);
    expect(normalizeMeals([null]).ok).toBe(false);
    expect(normalizeMeals([42]).ok).toBe(false);
  });

  it("dizi olmayanı reddeder", () => {
    expect(normalizeMeals({}).ok).toBe(false);
    expect(normalizeMeals("x").ok).toBe(false);
  });

  it("uzun name kırpılır", () => {
    const r = normalizeMeals([{ name: "x".repeat(999) }]);
    expect(r.ok).toBe(true);
    expect(r.meals[0].name.length).toBe(200);
  });

  it("öğe sayısı sınırlı", () => {
    const many = Array.from({ length: MAX_MEALS + 1 }, () => ({}));
    expect(normalizeMeals(many).ok).toBe(false);
  });

  it("boş dizi geçerli (günü silme deseni)", () => {
    expect(normalizeMeals([]).ok).toBe(true);
  });
});
