// ============================================================================
// scaleMealNutrition — NutritionSheet'in porsiyon ölçekleyicisi.
//
// Aç-kaydet sözleşmesi: çarpan 1 iken fonksiyon HİÇBİR ŞEYİ yuvarlamamalı —
// `.toFixed(1)` turu 2 ondalıklı makroyu sessizce 1 ondalığa tırnaklar ve
// `fromDraft` o tırnaklanmış değeri DB'ye geri yazar (8.75 → 8.8). Yuvarlama
// yalnızca stepper ölçeklemesinde (m ≠ 1) meşru.
// ============================================================================
import { describe, expect, it } from "vitest";
import { addSkeletonLine, resetLineState, scaleMealNutrition } from "./NutritionSheet";
import { ZERO_NUTRITION } from "../types";
import { draftLinesToItems, mealDraftLines } from "../lib/ingredientDraft";
import type { Alias, MealItem } from "../types";

// ============================================================================
// "Malzeme ekle" state kurulumu — `addSkeletonLine` + `resetLineState`.
//
// Hata: `addRow()` `newDraftLine(aliases[0])` çağırıyordu, yani kullanıcıya
// HAFIZANIN İLK BESİNİ dayatılıyordu; seçim ekranı yoktu. Artık boş iskelet
// satır açılıyor ve seçim o satırda açılacak.
//
// Bu görev state'in KURULUMUNU doğrular; ekranın kendisi (AliasPicker render'ı,
// dört dallı satır JSX'i, "Elle gir") Task 2'nin işidir.
// ============================================================================

const tavuk: Alias = {
  id: "a1",
  triggers: ["tavuk"],
  name: "Tavuk",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
};

const pilav: Alias = {
  id: "a2",
  triggers: ["pilav"],
  name: "Pilav",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 130, protein: 4, carbs: 28, fat: 0.4, fiber: 0.6 },
};

const ALIASES: Alias[] = [tavuk, pilav];

/** Kırılımı olan tek kalemli öğün — `mealDraftLines` null döndürmesin. */
const MEAL: MealItem = {
  id: "m1",
  label: "Akşam",
  computed: { kcal: 330, protein: 62, carbs: 56, fat: 7.2, fiber: 1.2 },
  sources: [{ aliasId: "a1", qty: 200, unit: "g" }],
};

describe("addSkeletonLine — rastgele besin yerine boş iskelet", () => {
  it("eklenen satır blank + aliasId null (hafızanın ilk besini DOLDURULMAZ)", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);
    const added = lines[lines.length - 1];

    expect(added.blank).toBe(true);
    expect(added.aliasId).toBeNull();
    expect(added.name).toBe("");
    // Eski hata buradaydı: aliases[0] (tavuk) otomatik gelirdi.
    expect(added.aliasId).not.toBe(tavuk.id);
  });

  it("satır KAYDA girmez — iskelet malzeme değildir (draftLinesToItems düşürür)", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);
    const added = lines[lines.length - 1];
    const withoutAdded = lines.filter((l) => l.key !== added.key);

    expect(draftLinesToItems([added])).toHaveLength(0);
    // Mevcut kalemler etkilenmez: iskelet eklenince kayıt aynı kalır.
    expect(draftLinesToItems(lines)).toEqual(draftLinesToItems(withoutAdded));
  });

  it("mevcut satırlara dokunmaz, sona ekler", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);

    expect(lines).toHaveLength(base.length + 1);
    expect(lines.slice(0, base.length)).toEqual(base);
  });

  it("pickerFor, YENİ satırın key'idir (seçim ekranı o satırda açılır)", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines, pickerFor } = addSkeletonLine(base);
    const added = lines[lines.length - 1];

    expect(pickerFor).toBe(added.key);
    expect(pickerFor).not.toBe(base[0].key);
  });

  it("her eklemede YENİ key (picker eski satırda kalmaz)", () => {
    const once = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    const twice = addSkeletonLine(once.lines);

    expect(twice.pickerFor).not.toBe(once.pickerFor);
    expect(twice.lines).toHaveLength(once.lines.length + 1);
  });

  it("elle (alias'sız) satırın üstüne eklemek de aynı sözleşmeyi korur", () => {
    const once = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    const twice = addSkeletonLine(once.lines);
    const added = twice.lines[twice.lines.length - 1];

    expect(added.blank).toBe(true);
    expect(added.aliasId).toBeNull();
    expect(twice.pickerFor).toBe(added.key);
  });
});

describe("resetLineState — öğün değişince satır içi ekranlar kapanır", () => {
  it("pickerFor null'a döner (açık seçim yeni öğüne sızmaz)", () => {
    const afterAdd = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    expect(afterAdd.pickerFor).not.toBeNull();

    const fresh = resetLineState(MEAL, ALIASES);
    expect(fresh.pickerFor).toBeNull();
  });

  it("swapKey de sıfırlanır", () => {
    const fresh = resetLineState(MEAL, ALIASES);
    expect(fresh.swapKey).toBeNull();
  });

  it("satırlar yeni öğünden türetilir (kayıttan gelir, elle eklenenler gider)", () => {
    const { lines } = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    expect(lines).toHaveLength(2); // kayıt kalemi + iskelet

    const fresh = resetLineState(MEAL, ALIASES);
    expect(fresh.lines).toHaveLength(1);
    expect(fresh.lines![0].aliasId).toBe("a1");
  });

  it("kırılımsız öğünde satır null kalır (bölüm çizilmez, mevcut kural)", () => {
    const sourcesuz: MealItem = { id: "m2", label: "Su", computed: { ...ZERO_NUTRITION } };
    expect(resetLineState(sourcesuz, ALIASES).lines).toBeNull();
  });
});

describe("iskelet satırın ölçülebilir tabanı yoktur (elle satır kuralları)", () => {
  it("alias'sız iskelet makro olarak boştur — uydurma besin değeri taşımaz", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);
    const added = lines[lines.length - 1];

    expect(added.nutrition).toEqual(ZERO_NUTRITION);
    expect(added.grams).toBe(0);
    expect(added.preserved).toBe(false);
    expect(added.manualMeasured).toBe(false);
  });
});

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
