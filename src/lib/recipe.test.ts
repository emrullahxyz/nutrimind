import { describe, expect, it } from "vitest";
import { parseRecipe } from "./api";
import {
  calculateRecipeTotals,
  draftIngredientGrams,
  draftIngredientsTotalG,
  scaleNutrition,
  toGrams,
} from "./nutrition";
import type { DraftIngredientWeight } from "./nutrition";
import type { Alias, RecipeIngredient } from "../types";
import { ZERO_NUTRITION } from "../types";

describe("recipe calculation & validation (Faz 7)", () => {
  it("100 g başına hesabı ve totalG farklı olduğunda ölçekleme (1200 g çorbadan 350 g)", () => {
    // Malzemeler: 300 g mercimek + 200 g soğan + 20 g yağ
    const ing1: RecipeIngredient = {
      name: "Mercimek",
      qty: 300,
      unit: "g",
      nutrition: { kcal: 1050, protein: 72, carbs: 180, fat: 6, fiber: 30 },
    };
    const ing2: RecipeIngredient = {
      name: "Soğan",
      qty: 200,
      unit: "g",
      nutrition: { kcal: 80, protein: 2, carbs: 18, fat: 0, fiber: 4 },
    };
    const ing3: RecipeIngredient = {
      name: "Zeytinyağı",
      qty: 20,
      unit: "g",
      nutrition: { kcal: 180, protein: 0, carbs: 0, fat: 20, fiber: 0 },
    };

    const totalG = 1200; // Pişmiş toplam ağırlık (1200 g çorba)
    const { totalNutrition, per100g } = calculateRecipeTotals([ing1, ing2, ing3], totalG);

    // Çorba toplamı: 1050+80+180 = 1310 kcal, 74g P, 198g K, 26g Y, 34g L
    expect(totalNutrition.kcal).toBe(1310);
    expect(totalNutrition.protein).toBe(74);
    expect(totalNutrition.carbs).toBe(198);
    expect(totalNutrition.fat).toBe(26);
    expect(totalNutrition.fiber).toBe(34);

    // 100 g per100g = totalNutrition * 100 / 1200
    expect(per100g.kcal).toBe(109.2);
    expect(per100g.protein).toBe(6.2);
    expect(per100g.carbs).toBe(16.5);
    expect(per100g.fat).toBe(2.2);
    expect(per100g.fiber).toBe(2.8);

    // Kullanıcı bu çorbadan 350 g yediğinde ölçekleme
    const eaten = scaleNutrition(per100g, 100, 350);
    expect(eaten.kcal).toBe(382.2);
    expect(eaten.protein).toBe(21.7);
    expect(eaten.carbs).toBe(57.8);
  });

  it("mikro besinlerde 'bilinmiyor ≠ sıfır' toplamının korunması", () => {
    const ingWithSodium: RecipeIngredient = {
      name: "Tuzlu sos",
      qty: 50,
      unit: "g",
      nutrition: { kcal: 50, protein: 0, carbs: 5, fat: 2, fiber: 0, sodium: 200 },
    };
    const ingWithoutSodium: RecipeIngredient = {
      name: "Sebze",
      qty: 100,
      unit: "g",
      nutrition: { kcal: 30, protein: 1, carbs: 6, fat: 0, fiber: 2 },
    };

    const { totalNutrition, per100g } = calculateRecipeTotals([ingWithSodium, ingWithoutSodium], 150);
    expect(totalNutrition.sodium).toBe(200);
    expect(per100g.sodium).toBe(133.3);

    const { totalNutrition: cleanTotal, per100g: clean100 } = calculateRecipeTotals([ingWithoutSodium], 100);
    expect("sodium" in cleanTotal).toBe(false);
    expect("sugar" in cleanTotal).toBe(false);
    expect("sodium" in clean100).toBe(false);
    expect("sugar" in clean100).toBe(false);
  });

  it("totalG <= 0 reddi", () => {
    const ing: RecipeIngredient = {
      name: "Test",
      qty: 100,
      unit: "g",
      nutrition: { kcal: 100, protein: 10, carbs: 10, fat: 2, fiber: 1 },
    };
    const { per100g } = calculateRecipeTotals([ing], 0);
    expect(per100g.kcal).toBe(0);
    expect(per100g.protein).toBe(0);

    expect(parseRecipe({ totalG: 0, ingredients: [ing] })).toBeUndefined();
    expect(parseRecipe({ totalG: -500, ingredients: [ing] })).toBeUndefined();
  });

  it("porsiyon biriminin totalG / porsiyonSayısı olarak hesaplanması", () => {
    const totalG = 1200;
    const portionCount = 4;
    const portionGrams = Math.round((totalG / portionCount) * 10) / 10;
    expect(portionGrams).toBe(300);

    expect(toGrams(1, { name: "porsiyon", grams: portionGrams })).toBe(300);
  });

  it("bozuk recipe verisinin elenmesi (parseRecipe)", () => {
    expect(parseRecipe(null)).toBeUndefined();
    expect(parseRecipe(undefined)).toBeUndefined();
    expect(parseRecipe("invalid")).toBeUndefined();
    expect(parseRecipe({})).toBeUndefined();
    expect(parseRecipe({ totalG: 500 })).toBeUndefined();
    expect(parseRecipe({ totalG: 500, ingredients: [] })).toBeUndefined();
    expect(parseRecipe({ totalG: 500, ingredients: "not-an-array" })).toBeUndefined();
    expect(
      parseRecipe({
        totalG: 500,
        ingredients: [{ name: "", qty: 0, unit: "g", nutrition: { kcal: 100 } }],
      }),
    ).toBeUndefined();

    const validRaw = {
      totalG: 600,
      ingredients: [
        {
          aliasId: "yumurta",
          name: "Yumurta",
          qty: 2,
          unit: "adet",
          nutrition: { kcal: 155, protein: 13, carbs: 1, fat: 11, fiber: 0 },
        },
      ],
    };
    const parsed = parseRecipe(validRaw);
    expect(parsed).toBeDefined();
    expect(parsed?.totalG).toBe(600);
    expect(parsed?.ingredients).toHaveLength(1);
    expect(parsed?.ingredients[0].name).toBe("Yumurta");
    expect(parsed?.ingredients[0].aliasId).toBe("yumurta");
  });

  it("paylaşılan ZERO_NUTRITION sabitini referansla döndürmez", () => {
    // Sabit dondurulmuş değil ve kod tabanındaki her kullanımı kopyalıyor.
    // Referans dönseydi, dönen nesneyi değiştiren bir çağrı uygulamanın
    // TAMAMINDAKİ sıfırı bozardı.
    const bos = calculateRecipeTotals([], 0);
    expect(bos.totalNutrition).not.toBe(ZERO_NUTRITION);
    expect(bos.per100g).not.toBe(ZERO_NUTRITION);
    expect(bos.totalNutrition).toEqual(ZERO_NUTRITION);

    bos.per100g.kcal = 9999;
    expect(ZERO_NUTRITION.kcal).toBe(0);
    // totalG geçersizken de aynı koruma geçerli olmalı.
    expect(calculateRecipeTotals([], -5).per100g.kcal).toBe(0);
  });
});

describe("taslak malzemelerinden toplam gram", () => {
  const oat = {
    id: "yulaf",
    units: [{ name: "avuç", grams: 40 }],
  } as Pick<Alias, "id" | "units">;
  const milk = { id: "sut", units: [] } as Pick<Alias, "id" | "units">;
  const aliases = [oat, milk];

  it("kullanıcının tarifindeki gram toplamını verir (90 + 35 + 175)", () => {
    // Gerçek senaryo: yulaf + protein tozu + süt → 300 g pişmiş toplam.
    const rows: DraftIngredientWeight[] = [
      { mode: "alias", aliasId: "yulaf", qty: "90", unit: "g" },
      { mode: "alias", aliasId: "sut", qty: "175", unit: "g" },
    ];
    expect(draftIngredientsTotalG(rows, aliases)).toBe(265);
    expect(
      draftIngredientsTotalG(
        [...rows, { mode: "manual", aliasId: "", qty: "35", unit: "g" }],
        aliases,
      ),
    ).toBe(300);
  });

  it("alias satırında özel birimi gram karşılığına çevirir", () => {
    expect(draftIngredientGrams({ mode: "alias", aliasId: "yulaf", qty: "2", unit: "avuç" }, aliases)).toBe(80);
    // Birim adı alias'ın birim listesinde yoksa varsayılana (gram) düşer.
    expect(draftIngredientGrams({ mode: "alias", aliasId: "yulaf", qty: "2", unit: "kase" }, aliases)).toBe(2);
  });

  it("elle satırda yalnızca 'g' toplama katılır", () => {
    // "ml" yoğunluk bilinmediği, "adet" ağırlığı kişiye göre olduğu için sayılmaz.
    expect(draftIngredientGrams({ mode: "manual", aliasId: "", qty: "200", unit: "ml" }, aliases)).toBe(0);
    expect(draftIngredientGrams({ mode: "manual", aliasId: "", qty: "2", unit: "adet" }, aliases)).toBe(0);
    expect(draftIngredientGrams({ mode: "manual", aliasId: "", qty: "20", unit: "G" }, aliases)).toBe(20);
    expect(draftIngredientGrams({ mode: "manual", aliasId: "", qty: "20", unit: " g " }, aliases)).toBe(20);
  });

  it("miktar hâlâ yazılıyken geçersiz satırı 0 sayar (liste zorla sıfırlanmaz)", () => {
    expect(draftIngredientGrams({ mode: "alias", aliasId: "yulaf", qty: "", unit: "g" }, aliases)).toBe(0);
    expect(draftIngredientGrams({ mode: "alias", aliasId: "yulaf", qty: "abc", unit: "g" }, aliases)).toBe(0);
    expect(draftIngredientGrams({ mode: "alias", aliasId: "yulaf", qty: "-5", unit: "g" }, aliases)).toBe(0);
    // Silinmiş bir hafıza kaydına bağlı satır da 0 — sessizce yanlış gram üretmez.
    expect(draftIngredientGrams({ mode: "alias", aliasId: "yok", qty: "50", unit: "g" }, aliases)).toBe(0);
    expect(draftIngredientsTotalG([], aliases)).toBe(0);
  });
});
