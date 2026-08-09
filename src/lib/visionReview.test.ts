import { describe, expect, it } from "vitest";
import {
  MIN_VISION_MULTIPLIER,
  combineVisionItems,
  multiplierFromGrams,
  stepVisionMultiplier,
  visionAliasUnitNutrition,
} from "./visionReview";
import type { Nutrition } from "../types";

const BASE: Nutrition = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };

describe("combineVisionItems", () => {
  it("boş listede sıfır besin döner", () => {
    expect(combineVisionItems([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });

  it("tek kalemde onu aynen döner", () => {
    expect(combineVisionItems([BASE])).toEqual(BASE);
  });

  it("birden fazla kalemi (Yemek modunun dahil edilen satırları) toplar", () => {
    const second: Nutrition = { kcal: 50, protein: 5, carbs: 10, fat: 2, fiber: 1 };
    expect(combineVisionItems([BASE, second])).toEqual({
      kcal: 150,
      protein: 15,
      carbs: 30,
      fat: 7,
      fiber: 3,
    });
  });

  it("mikro besin yalnızca en az bir kalemde varsa sonuca girer (addNutrition ile aynı kural)", () => {
    const withSodium: Nutrition = { ...BASE, sodium: 300 };
    const out = combineVisionItems([BASE, withSodium]);
    expect(out.sodium).toBe(300);
  });
});

describe("visionAliasUnitNutrition", () => {
  it("çarpan 1 iken nihai değeri aynen döner (1 porsiyon = tüketilen miktar)", () => {
    expect(visionAliasUnitNutrition(BASE, 1)).toEqual(BASE);
  });

  it("çarpan 2 iken nihai değeri yarıya bölüp 1 porsiyonluk tabanı çıkarır", () => {
    const consumed: Nutrition = { kcal: 200, protein: 20, carbs: 40, fat: 10, fiber: 4 };
    expect(visionAliasUnitNutrition(consumed, 2)).toEqual(BASE);
  });

  it("kesirli çarpanı (0.5) doğru geriye böler", () => {
    const consumed: Nutrition = { kcal: 50, protein: 5, carbs: 10, fat: 2.5, fiber: 1 };
    expect(visionAliasUnitNutrition(consumed, 0.5)).toEqual(BASE);
  });

  it("çarpan 0 ya da negatifse (guard) nihai değeri olduğu gibi döner, bölme hatası yapmaz", () => {
    expect(visionAliasUnitNutrition(BASE, 0)).toEqual(BASE);
    expect(visionAliasUnitNutrition(BASE, -1)).toEqual(BASE);
  });
});

describe("multiplierFromGrams", () => {
  it("100g = çarpan 1", () => {
    expect(multiplierFromGrams(100)).toBe(1);
  });

  it("50g = çarpan 0.5", () => {
    expect(multiplierFromGrams(50)).toBe(0.5);
  });

  it("1g = çarpan 0.01 (alt sınır — 25g'ye yapışmaz)", () => {
    expect(multiplierFromGrams(1)).toBe(0.01);
  });

  it("0/negatif girişi çarpan 0.01'e yuvarlar (asla sıfır/eksi değil)", () => {
    expect(multiplierFromGrams(0)).toBe(0.01);
    expect(multiplierFromGrams(-10)).toBe(0.01);
  });
});

describe("stepVisionMultiplier", () => {
  it("0.25 adımlarla artırır/azaltır", () => {
    expect(stepVisionMultiplier(1, 0.25)).toBe(1.25);
    expect(stepVisionMultiplier(1, -0.25)).toBe(0.75);
  });

  it("0.25'in altına inebilir (1g = 0.01)", () => {
    expect(stepVisionMultiplier(0.25, -0.05)).toBe(0.2);
    expect(stepVisionMultiplier(0.1, -0.05)).toBe(0.05);
  });

  it(`alt sınır ${MIN_VISION_MULTIPLIER} (1g), sıfırın altına asla inmez`, () => {
    expect(stepVisionMultiplier(MIN_VISION_MULTIPLIER, -0.25)).toBe(MIN_VISION_MULTIPLIER);
    expect(stepVisionMultiplier(0, -0.25)).toBe(MIN_VISION_MULTIPLIER);
    expect(stepVisionMultiplier(-1, 0)).toBe(MIN_VISION_MULTIPLIER);
  });

  it("kayan nokta artıklarını temizler", () => {
    expect(stepVisionMultiplier(0.1, 0.2)).toBe(0.3);
  });
});
