// resolveMealIngredients: sources çözülürse kalemler, aksi halde null.
// swapIngredientLine: gram korunur, makro yeniden hesaplanır.
// linesToMealParts: kalemler → toplam + sources.
import { describe, expect, it } from "vitest";
import { linesToMealParts, resolveMealIngredients, swapIngredientLine } from "./ingredientLines";
import type { Alias, MealItem } from "../types";

function alias(over: Partial<Alias> = {}): Alias {
  return {
    id: "a1",
    triggers: ["tavuk"],
    name: "Tavuk",
    brand: null,
    serving_g: 100,
    nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
    ...over,
  };
}

function meal(sources: MealItem["sources"]): MealItem {
  return {
    id: "m1",
    label: "Tavuk + Pilav",
    computed: { kcal: 300, protein: 35, carbs: 20, fat: 5, fiber: 1 },
    sources,
  };
}

describe("resolveMealIngredients", () => {
  it("sources yoksa null döner (kırılım yok)", () => {
    expect(resolveMealIngredients(meal(undefined), [alias()])).toBeNull();
  });

  it("çözülen kaynaklardan kalem üretir", () => {
    const tavuk = alias();
    const pilav = alias({
      id: "a2",
      name: "Pilav",
      nutrition: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
    });
    const lines = resolveMealIngredients(
      meal([
        { aliasId: "a1", qty: 150, unit: "g" },
        { aliasId: "a2", qty: 100, unit: "g" },
      ]),
      [tavuk, pilav],
    );
    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(2);
    expect(lines![0].name).toBe("Tavuk");
    expect(lines![0].grams).toBe(150);
    expect(lines![0].nutrition.kcal).toBe(247.5); // scaleNutrition 1 ondalığa yuvarlar
    expect(lines![1].nutrition.protein).toBeCloseTo(2.7, 1);
  });

  it("silinmiş alias varsa null döner", () => {
    expect(
      resolveMealIngredients(meal([{ aliasId: "yok", qty: 100, unit: "g" }]), [alias()]),
    ).toBeNull();
  });

  it("bilinmeyen birimde null döner (sessiz gram varsayımı yok)", () => {
    expect(
      resolveMealIngredients(meal([{ aliasId: "a1", qty: 2, unit: "kase-dolusu" }]), [alias()]),
    ).toBeNull();
  });
});

describe("swapIngredientLine", () => {
  it("gramı korur, makroyu yeniden hesaplar", () => {
    const lines = resolveMealIngredients(meal([{ aliasId: "a1", qty: 150, unit: "g" }]), [
      alias(),
    ])!;
    const tofu = alias({
      id: "a3",
      name: "Tofu",
      serving_g: 100,
      nutrition: { kcal: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3 },
    });
    const swapped = swapIngredientLine(lines[0], tofu);
    expect(swapped.grams).toBe(150);
    expect(swapped.aliasId).toBe("a3");
    expect(swapped.nutrition.kcal).toBe(114); // 76 × 1.5 → 1 ondalığa yuvarlanır
    expect(swapped.nutrition.protein).toBeCloseTo(12, 0);
  });
});

describe("linesToMealParts", () => {
  it("kalemleri toplar, sources üretir", () => {
    const lines = resolveMealIngredients(
      meal([
        { aliasId: "a1", qty: 100, unit: "g" },
        { aliasId: "a1", qty: 100, unit: "g" },
      ]),
      [alias()],
    )!;
    const parts = linesToMealParts(lines);
    expect(parts.nutrition.kcal).toBe(330);
    expect(parts.sources).toHaveLength(2);
  });

  it("toplam kayan nokta artığı bırakmaz (42.800000000000004 DEĞİL)", () => {
    const lines = resolveMealIngredients(
      meal([
        { aliasId: "a1", qty: 60, unit: "g" },
        { aliasId: "a1", qty: 30, unit: "g" },
        { aliasId: "a1", qty: 150, unit: "g" },
      ]),
      [alias()],
    )!;
    const parts = linesToMealParts(lines);
    expect(parts.nutrition.protein).toBe(74.4); // 31 × (0.6 + 0.3 + 1.5)
    expect(String(parts.nutrition.protein)).not.toContain("000");
  });
});
