// ============================================================================
// scaleMealNutrition — NutritionSheet'in porsiyon ölçekleyicisi.
//
// Aç-kaydet sözleşmesi: çarpan 1 iken fonksiyon HİÇBİR ŞEYİ yuvarlamamalı —
// `.toFixed(1)` turu 2 ondalıklı makroyu sessizce 1 ondalığa tırnaklar ve
// `fromDraft` o tırnaklanmış değeri DB'ye geri yazar (8.75 → 8.8). Yuvarlama
// yalnızca stepper ölçeklemesinde (m ≠ 1) meşru.
// ============================================================================
import { describe, expect, it } from "vitest";
import { scaleMealNutrition } from "./NutritionSheet";
import { ZERO_NUTRITION } from "../types";

describe("scaleMealNutrition — aç-kaydet sözleşmesi (m=1 kayıpsız)", () => {
  it("m=1 iken 2 ondalıklı makrolar KORUNUR (8.75 → 8.8 DEĞİL)", () => {
    const out = scaleMealNutrition({ kcal: 320, protein: 12.34, carbs: 8.75, fat: 3.25, fiber: 1.05 }, 1);
    expect(out.carbs).toBe(8.75);
    expect(out.fat).toBe(3.25);
    expect(out.protein).toBe(12.34);
    expect(out.fiber).toBe(1.05);
    expect(out.kcal).toBe(320);
  });

  it("m=1 iken girilmemiş mikro 'bilinmiyor' kalır (undefined → 0 değil)", () => {
    const base = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };
    const out = scaleMealNutrition(base, 1);
    expect(out.sodium).toBeUndefined();
    expect(out.sugar).toBeUndefined();
    expect(out.satFat).toBeUndefined();
  });

  it("m=1 iken girilmiş mikro korunur", () => {
    const base = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2, sodium: 1400, sugar: 12.25 };
    const out = scaleMealNutrition(base, 1);
    expect(out.sodium).toBe(1400);
    expect(out.sugar).toBe(12.25);
  });

  it("m=1 ve computed yoksa ZERO_NUTRITION döner (çekirdek 0, mikro yok)", () => {
    const out = scaleMealNutrition(undefined, 1);
    expect(out).toEqual(ZERO_NUTRITION);
  });
});

describe("scaleMealNutrition — stepper ölçeklemesi (m ≠ 1)", () => {
  it("m=2 makroyu 1 ondalığa yuvarlar, kcal'i Math.round'lar", () => {
    const out = scaleMealNutrition({ kcal: 320.4, protein: 12.34, carbs: 8.75, fat: 3.25, fiber: 1.05 }, 2);
    expect(out.kcal).toBe(641); // Math.round(320.4 × 2)
    expect(out.protein).toBe(24.7); // 24.68 → toFixed(1)
    expect(out.carbs).toBe(17.5);
    expect(out.fat).toBe(6.5);
  });

  it("m=0.75 ondalıklı çarpanı 1 ondalığa yuvarlar", () => {
    const out = scaleMealNutrition({ kcal: 100, protein: 10, carbs: 8.75, fat: 5, fiber: 2 }, 0.75);
    expect(out.carbs).toBe(6.6); // 8.75 × 0.75 = 6.5625 → 6.6
    expect(out.kcal).toBe(75); // Math.round(100 × 0.75)
  });

  it("m ≠ 1 iken mikro ölçeklenir ve sodyum yuvarlanır", () => {
    const out = scaleMealNutrition({ kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2, sodium: 1400 }, 1.5);
    expect(out.sodium).toBe(2100); // Math.round(1400 × 1.5)
  });
});
