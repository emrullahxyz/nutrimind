import { describe, expect, it } from "vitest";
import { editItemNutrition, resolveQuantityMode, scaleEditableItem } from "./ItemEditFields";
import type { MealSource } from "../types";

describe("editable item amounts", () => {
  const item = { name: "Breakfast", grams: 556, nutrition: { kcal: 664, protein: 43.9, carbs: 55.9, fat: 28.3, fiber: 0 } };

  it("scales measured grams with nutrition from the opening portion", () => {
    const scaled = scaleEditableItem(item, 1.5);
    expect(scaled.grams).toBe(834);
    expect(scaled.nutrition.kcal).toBe(996);
    expect(scaleEditableItem(item, 1).grams).toBe(556);
  });

  it("retains the current measured amount when nutrition is edited directly", () => {
    const scaled = scaleEditableItem(item, 1.5);
    const edited = editItemNutrition(scaled, { ...scaled.nutrition, kcal: 1000 });
    expect(edited.grams).toBe(834);
    expect(edited.nutrition.kcal).toBe(1000);
    expect(edited.sources).toBeUndefined();
  });

  it("keeps unknown grams unknown in both editor operations", () => {
    const unknown = { name: "Toast (100g)", nutrition: item.nutrition, gramsUnknown: true as const };
    const scaled = scaleEditableItem(unknown, 1.5);
    expect(scaled.grams).toBeUndefined();
    expect(scaled.gramsUnknown).toBe(true);
    const edited = editItemNutrition(scaled, item.nutrition);
    expect(edited.grams).toBeUndefined();
    expect(edited.gramsUnknown).toBe(true);
  });
});

describe("resolveQuantityMode", () => {
  it("sources yoksa stepper döner", () => {
    expect(resolveQuantityMode(undefined, [])).toBe("stepper");
  });

  it("sources boş dizi ise stepper döner", () => {
    expect(resolveQuantityMode([], [])).toBe("stepper");
  });

  it("birden fazla kaynakta (sepetten birleşmiş kalem) stepper döner", () => {
    const sources: MealSource[] = [
      { aliasId: "a", qty: 1, unit: "g" },
      { aliasId: "b", qty: 1, unit: "g" },
    ];
    expect(resolveQuantityMode(sources, [{ id: "a" }, { id: "b" }])).toBe("stepper");
  });

  it("tek kaynak ve alias hâlâ hafızada varsa exact döner", () => {
    const sources: MealSource[] = [{ aliasId: "a", qty: 100, unit: "g" }];
    expect(resolveQuantityMode(sources, [{ id: "a" }])).toBe("exact");
  });

  it("tek kaynak ama alias artık hafızada yoksa (silinmiş) stepper döner", () => {
    const sources: MealSource[] = [{ aliasId: "deleted", qty: 100, unit: "g" }];
    expect(resolveQuantityMode(sources, [{ id: "a" }])).toBe("stepper");
  });
});
