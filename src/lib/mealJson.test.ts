import { describe, expect, it } from "vitest";
import { parseMealJson } from "./mealJson";
import { parseTemplateItems } from "./api";
import { draftLinesToItems, itemsToDraftLines, mealToBasketSeed, setDraftGrams } from "./ingredientDraft";
import { templateItemsToPayload } from "./templates";
import type { TemplateItem } from "../types";

const meal = { name: "Breakfast", calories: 664, protein: 43.9, carbs: 55.9, fat: 28.3, portion_g: 556 };
const parse = (value: unknown) => parseMealJson(JSON.stringify(value));

describe("local meal JSON", () => {
  it("preserves nutrition_total as supplied without multiplying by servings", () => {
    expect(parse({ meal: "Ev yapımı dana kıymalı burrito", servings: 2, meat_filling_fraction: 1,
      lavash_raw_dough_g: 120, nutrition_total: { calories_kcal: 943, protein_g: 53, carbs_g: 64, fat_g: 51 } }))
      .toEqual({ kind: "valid", items: [{ name: "Ev yapımı dana kıymalı burrito", nutrition: { kcal: 943, protein: 53, carbs: 64, fat: 51, fiber: 0 } }] });
  });
  it("accepts meal and nutrition_estimate with informational ingredient quantities", () => {
    expect(parse({ meal: "Anne köftesi + ev yapımı lavaş", ingredients: {
      raw_mixed_ground_meat_g: 180, meat_fat_percent: 17.5, raw_lavash_dough_g: 180,
      hydration_percent: 60, salt_g: 2, estimated_flour_g: 111.3, estimated_water_g: 66.8,
    }, nutrition_estimate: { calories_kcal: 808, protein_g: 43.9, carbs_g: 84.9, fat_g: 32.6 } }))
      .toEqual({ kind: "valid", notice: "parentTotals", items: [{ name: "Anne köftesi + ev yapımı lavaş",
        nutrition: { kcal: 808, protein: 43.9, carbs: 84.9, fat: 32.6, fiber: 0 } }] });
  });
  it("normalizes common name, nutrient container, and list aliases", () => {
    for (const nameKey of ["meal", "meal_name", "food_name", "title", "label"]) {
      for (const nutritionKey of ["nutrition_estimate", "nutrition_facts", "nutritional_values", "macros", "total_nutrition"]) {
        const entry = { [nameKey]: "Lunch", [nutritionKey]: { energy_kcal: 808, protein: 43.9, carbohydrates_g: 84.9, fat: 32.6 } };
        for (const input of [entry, [entry], { meals: [entry] }, { foods: [entry] }]) {
          expect(parse(input)).toMatchObject({ kind: "valid", items: [{ name: "Lunch", nutrition: { kcal: 808, carbs: 84.9 } }] });
        }
      }
    }
  });
  it("does not silently choose conflicting aliases or invent missing nutrition", () => {
    expect(parse({ ...meal, meal: "Different" }).kind).toBe("invalid");
    expect(parse({ ...meal, nutrition_estimate: { calories_kcal: 1 } }).kind).toBe("invalid");
    expect(parse({ meal: "Lunch", ingredients: { flour_g: 100 } }).kind).toBe("invalid");
    expect(parse({ meals: [meal], nutrition_estimate: { calories_kcal: 1 } }).kind).toBe("invalid");
  });
  it("imports the selected per-serving recipe without multiplying by recipe servings", () => {
    expect(parse({ name: "Tavuklu domates soslu makarna", servings: 4, per_serving: {
      calories_kcal: 468, protein_g: 34.5, carbs_g: 67, fat_g: 6.3, fiber_g: 3,
    } })).toEqual({ kind: "valid", notice: "perServing", items: [{
      name: "Tavuklu domates soslu makarna",
      nutrition: { kcal: 468, protein: 34.5, carbs: 67, fat: 6.3, fiber: 3 },
    }] });
  });
  it("validates per-serving values and refuses mixed nutrition bases", () => {
    const serving = { calories_kcal: 468, protein_g: 34.5, carbs_g: 67, fat_g: 6.3 };
    for (const per_serving of [null, {}, { ...serving, protein_g: "34.5" }, { ...serving, fiber_g: -1 }]) {
      expect(parse({ name: "Pasta", servings: 4, per_serving }).kind).toBe("invalid");
    }
    expect(parse({ ...meal, servings: 4, per_serving: serving }).kind).toBe("invalid");
    expect(parse({ name: "Pasta", servings: 0, per_serving: serving }).kind).toBe("invalid");
    expect(parse({ items: [meal], per_serving: serving }).kind).toBe("invalid");
    expect(parse({ ...meal, ingredients: [{ name: "Pasta", per_serving: serving }] }).kind).toBe("invalid");
  });
  it("preserves example totals and grams when ingredients lack nutrition", () => {
    const result = parse({ ...meal, name: "Yumurtalı, lorlu çavdar ekmekli kahvaltı", ingredients: [
      { name: "L boy yumurta", amount: 2, unit: "adet" },
      { name: "Yarım yağlı lor", amount: 100, unit: "g" },
      { name: "Labne Piątnica", amount: 50, unit: "g" },
      { name: "Çavdar ekmeği", amount: 90, unit: "g" },
      { name: "Domates + salatalık", amount: 200, unit: "g" },
      { name: "Muz", amount: 0, unit: "g" },
    ] });
    expect(result).toEqual({ kind: "valid", notice: "parentTotals", items: [{ name: "Yumurtalı, lorlu çavdar ekmekli kahvaltı", baseAmount: 556, nutrition: { kcal: 664, protein: 43.9, carbs: 55.9, fat: 28.3, fiber: 0 } }] });
  });
  it("accepts canonical items and complete fences without inventing optional micros", () => {
    const item = { name: "Toast", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2 }, baseAmount: 30 };
    expect(parseMealJson("```json\n" + JSON.stringify({ items: [item] }) + "\n```")).toMatchObject({ kind: "valid", items: [{ ...item, nutrition: { ...item.nutrition, fiber: 0 } }] });
    expect(parseMealJson("```\n" + JSON.stringify(meal) + "\n```").kind).toBe("valid");
  });
  it("splits complete children without counting parent twice and derives only gram units", () => {
    expect(parse({ ingredients: [{ ...meal, portion_g: undefined, amount: 2, unit: "adet" }, { ...meal, amount: 556, unit: "g" }] })).toMatchObject({ kind: "valid", items: [{ nutrition: { kcal: 664 } }, { baseAmount: 556 }] });
    const result = parse({ ingredients: [{ ...meal, portion_g: undefined, amount: 2, unit: "adet" }] });
    if (result.kind !== "valid") throw new Error("Expected valid");
    expect(result.items[0].baseAmount).toBeUndefined();
  });
  it("allows 1 kcal / 0.1g rounding and rejects meaningful total conflicts", () => {
    expect(parse({ ...meal, calories: 665, protein: 44, ingredients: [meal] }).kind).toBe("valid");
    expect(parse({ ...meal, calories: 670, ingredients: [meal] })).toMatchObject({ kind: "invalid", error: "totals" });
  });
  it("keeps arrays atomic", () => {
    expect(parse([meal, { name: "missing" }]).kind).toBe("invalid");
    expect(parse([meal, meal])).toMatchObject({ kind: "valid", items: [{ baseAmount: 556 }, { baseAmount: 556 }] });
  });
  it.each([null, "5", -1, false])("rejects provided invalid nutrition %s even during parent fallback", (value) => {
    expect(parse({ ...meal, fiber: value }).kind).toBe("invalid");
    expect(parse({ ...meal, ingredients: [{ name: "child", protein: value }] }).kind).toBe("invalid");
  });
  it.each([0, -1, null, "100"])("rejects invalid base %s", (portion_g) => {
    expect(parse({ ...meal, portion_g }).kind).toBe("invalid");
  });
  it("excludes explicit zero amounts but rejects invalid amounts and unusable children", () => {
    expect(parse({ ingredients: [meal, { name: "unused", amount: 0 }] })).toMatchObject({ kind: "valid", items: [{ name: "Breakfast" }] });
    for (const amount of [-1, null, "2"]) expect(parse({ ...meal, ingredients: [{ name: "bad", amount }] }).kind).toBe("invalid");
    expect(parse({ ingredients: [{ name: "missing" }] }).kind).toBe("invalid");
  });
  it("preserves micros and never infers grams from names", () => {
    const result = parse({ ...meal, name: "Toast (100g)", portion_g: undefined, sugar: 2, sodium: 30 });
    expect(result).toMatchObject({ kind: "valid", items: [{ nutrition: { sugar: 2, sodium: 30 } }] });
    if (result.kind === "valid") expect(result.items[0].baseAmount).toBeUndefined();
  });
  it.each(["{broken", "[", "```json\n{}", "{}", "[]", "null", "42", '"hello"', '{"items":{}}'])("classifies malformed/unsupported JSON locally: %s", (input) => {
    expect(parseMealJson(input).kind).toBe("invalid");
  });
  it("leaves ordinary prose to AI", () => expect(parseMealJson("2 eggs and toast")).toEqual({ kind: "text" }));
  it.each(["```json\nhello\n```", "```\n2 eggs\n```", "```json\n\n```"])("rejects malformed fenced content locally: %s", (text) => {
    expect(parseMealJson(text)).toEqual({ kind: "invalid", error: "syntax" });
  });
  it.each(["}", "]", "undefined", "NaN", "Infinity", "-Infinity", "TRUE", "1e+"])("keeps malformed primitive or closing delimiter local: %s", (text) => {
    expect(parseMealJson(text).kind).toBe("invalid");
  });
  it.each(["e", "E", "egg", "2 eggs", "2.5 cups of yogurt"])("retains ordinary prose classification: %s", (text) => {
    expect(parseMealJson(text)).toEqual({ kind: "text" });
  });
  it("rejects ambiguous wrappers instead of dropping supplied meal values", () => {
    expect(parse({ items: [meal], calories: "bad" }).kind).toBe("invalid");
    expect(parse([meal, { ...meal, items: [meal] }]).kind).toBe("invalid");
  });
  it("checks summed child nutrition and both sides of rounding boundaries", () => {
    const half = { name: "Half", calories: 332, protein: 21.95, carbs: 27.95, fat: 14.15 };
    expect(parse({ ...meal, ingredients: [half, half] })).toMatchObject({ kind: "valid", items: [{ name: "Half" }, { name: "Half" }] });
    expect(parse({ ...meal, protein: 44.01, ingredients: [half, half] })).toMatchObject({ kind: "invalid", error: "totals" });
    expect(parse({ ...meal, calories: 662.9, ingredients: [half, half] })).toMatchObject({ kind: "invalid", error: "totals" });
  });
  it("validates every supplied nutrient alias and canonical nested value", () => {
    expect(parse({ ...meal, kcal: "664" }).kind).toBe("invalid");
    expect(parse({ ...meal, kcal: 600 }).kind).toBe("invalid");
    expect(parse({ name: "Toast", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2, sodium: null } }).kind).toBe("invalid");
    expect(parse({ ...meal, nutrition: null }).kind).toBe("invalid");
    expect(parse({ ...meal, ingredients: [{ ...meal, calories: 1e309 }] }).kind).toBe("invalid");
  });
  it("requires child names and compares supplied optional totals without inventing unknown micros", () => {
    expect(parse({ ...meal, ingredients: [{ ...meal, name: "" }] }).kind).toBe("invalid");
    expect(parse({ ...meal, sugar: 5, ingredients: [{ ...meal, sugar: 2 }] })).toMatchObject({ kind: "invalid", error: "totals" });
    expect(parse({ ...meal, ingredients: [] }).kind).toBe("valid");
  });
  it("accepts kcal alias and explicit zero nutrients, but not negative or nonfinite values", () => {
    expect(parse({ name: "Zero", kcal: 0, protein: 0, carbs: 0, fat: 0 })).toMatchObject({ kind: "valid", items: [{ nutrition: { kcal: 0, fiber: 0 } }] });
    expect(parseMealJson('{"name":"Bad","kcal":1e999,"protein":0,"carbs":0,"fat":0}').kind).toBe("invalid");
    expect(parse({ ...meal, fat: -0.1 }).kind).toBe("invalid");
  });
  it("preserves an explicit unknown gram amount through API parsing, reopen, and re-save", () => {
    const persisted = parseTemplateItems([{ name: "Toast (100g)", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2, fiber: 0 }, gramsUnknown: true }]);
    const lines = itemsToDraftLines(persisted, []);
    expect(lines[0].grams).toBe(0);
    expect(lines[0].qty).toBe("");
    expect(draftLinesToItems(lines)).toEqual([{ name: "Toast (100g)", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2, fiber: 0 }, gramsUnknown: true }]);
    const seeds = mealToBasketSeed({ id: "local", label: "Toast", computed: persisted[0].nutrition, items: persisted }, [], "Extra");
    expect(seeds).toEqual([{ name: "Toast (100g)", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2, fiber: 0 }, gramsUnknown: true }]);
  });
  it("allows an explicit measured amount to replace unknown without affecting legacy name inference", () => {
    const items = [{ name: "Toast (100g)", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2, fiber: 0 }, gramsUnknown: true }] as TemplateItem[];
    const measured = setDraftGrams(itemsToDraftLines(items, [])[0], "30", null);
    expect(draftLinesToItems([measured])).toEqual([{ name: "Toast (100g)", nutrition: { kcal: 80, protein: 3, carbs: 12, fat: 2, fiber: 0 }, grams: 30 }]);
    expect(itemsToDraftLines([{ name: "Toast (100g)", nutrition: items[0].nutrition }], [])[0].grams).toBe(100);
  });
  it("scales imported totals from supplied grams and retains the amount in the existing save pipeline", () => {
    const result = parse(meal);
    if (result.kind !== "valid") throw new Error("Expected valid");
    const item = result.items[0];
    const line = itemsToDraftLines([{ name: item.name, nutrition: item.nutrition, grams: item.baseAmount }], [])[0];
    const saved = draftLinesToItems([setDraftGrams(line, "278", null)]);
    expect(saved).toEqual([{ name: "Breakfast", grams: 278, nutrition: { kcal: 332, protein: 22, carbs: 28, fat: 14.2, fiber: 0 } }]);
    const payload = templateItemsToPayload(saved, "local-template");
    expect(payload?.items?.[0].grams).toBe(278);
    expect(payload?.sources).toBeUndefined();
    expect(itemsToDraftLines(parseTemplateItems(payload?.items), [])[0].nutrition.kcal).toBe(332);
  });
});
