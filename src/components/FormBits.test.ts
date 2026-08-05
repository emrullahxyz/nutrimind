// ============================================================================
// Form taslağı ↔ `Nutrition` dönüşümü.
//
// Buradaki asıl kilit: BOŞ MİKRO KUTUSU 0 DEĞİLDİR. `parseNum("")` 0 döndüğü
// için elenmezse boş bırakılan sodyum kutusu "sodyum limiti 0" olarak kaydedilir
// ve hedeflerde sonsuza dek aşılmış bir limit çizilirdi. Çekirdek 5 alanda ise
// boş kutu HÂLÂ 0 demek — eski davranış aynen duruyor.
// ============================================================================
import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, filledMicros, fromDraft, hasUnsavedBasketEntry, toDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { CORE_KEYS } from "../lib/nutrients";
import type { Nutrition } from "../types";

const BASE: Nutrition = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };

/** Tüm alanları boş bir taslak + verilen üstyazımlar. */
function draft(over: NutritionDraft = {}): NutritionDraft {
  return { ...EMPTY_DRAFT, ...over };
}

describe("fromDraft — boş mikro kutusu 'bilinmiyor'dur", () => {
  it("boş mikro kutusu anahtarı HİÇ yazmaz (0 değil)", () => {
    const out = fromDraft(draft({ kcal: "2600", protein: "145" }));
    expect("sodium" in out).toBe(false);
    expect("sugar" in out).toBe(false);
    expect("satFat" in out).toBe(false);
    expect(out.sodium).toBeUndefined();
  });
  it("yalnızca boşluk içeren mikro kutusu da boştur", () => {
    expect("sodium" in fromDraft(draft({ sodium: "   " }))).toBe(false);
  });
  it("çekirdek alanlarda boş HÂLÂ 0 (eski davranış)", () => {
    const out = fromDraft(draft());
    expect(out).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    expect(Object.keys(out).sort()).toEqual([...CORE_KEYS].sort());
  });
  it("girilen mikro değeri korunur", () => {
    const out = fromDraft(draft({ sodium: "1400", sugar: "12,5" }));
    expect(out.sodium).toBe(1400);
    expect(out.sugar).toBe(12.5); // tr-TR virgül
    expect("satFat" in out).toBe(false);
  });
  it("mikroya AÇIKÇA yazılan 0 bir veridir, silinmez", () => {
    const out = fromDraft(draft({ sodium: "0" }));
    expect(out.sodium).toBe(0);
    expect("sodium" in out).toBe(true);
  });
});

describe("toDraft ↔ fromDraft gidiş-dönüşü", () => {
  it("girilmemiş mikro boş kutu olarak açılır ve girilmemiş kalır", () => {
    const d = toDraft(BASE);
    expect(d.sodium).toBe("");
    expect(d.sugar).toBe("");
    const back = fromDraft(d);
    expect("sodium" in back).toBe(false);
    expect(back).toEqual(BASE);
  });
  it("girilmiş mikro gidiş-dönüşte kaybolmaz", () => {
    const withMicro: Nutrition = { ...BASE, sodium: 1400, satFat: 3.5 };
    expect(fromDraft(toDraft(withMicro))).toEqual(withMicro);
  });
  it("mikrosu 0 olan kayıt gidiş-dönüşte 0 kalır (undefined'a düşmez)", () => {
    const zeroed: Nutrition = { ...BASE, sodium: 0 };
    expect(fromDraft(toDraft(zeroed)).sodium).toBe(0);
  });
});

describe("filledMicros — katlanmış bölüm veri saklamasın", () => {
  it("boş taslakta hiçbir mikro dolu değil", () => {
    expect(filledMicros(EMPTY_DRAFT)).toEqual([]);
  });
  it("dolu mikroları kayıt sırasıyla döner", () => {
    const d = draft({ sodium: "1400", sugar: "12" });
    expect(filledMicros(d).map((def) => def.key)).toEqual(["sugar", "sodium"]);
  });
  it("boşluk dolu sayılmaz", () => {
    expect(filledMicros(draft({ sodium: " " }))).toEqual([]);
  });
});

// ============================================================================
// hasUnsavedBasketEntry — MealForm'un Kaydet koruması (bkz. MealForm.tsx save())
//
// Bug: "Elle" sekmesine ad+kcal yazılıp Kaydet'e basıldığında, sepet zaten
// dolu olduğu için (düzenlenen mevcut öğün ya da önceki "+ Ekle"ler) girdi
// sessizce kayboluyordu — finalNutrition sepeti yazıyor, sekme alanlarını hiç
// okumuyordu. Bu fonksiyon o kaybı Kaydet ANINDA yakalayıp engellemenin saf
// mantığı.
// ============================================================================
describe("hasUnsavedBasketEntry", () => {
  it("sepet boşken hiçbir zaman engellemez (alanlar zaten doğrudan kaydediliyor)", () => {
    expect(
      hasUnsavedBasketEntry({
        basketLength: 0,
        mode: "manual",
        hasManualNutrition: true,
        aliasPendingAdd: true,
        aliasAddable: true,
      }),
    ).toBe(false);
  });

  it("Elle modunda: sepet doluyken listeye eklenmemiş makro varsa engeller", () => {
    expect(
      hasUnsavedBasketEntry({
        basketLength: 1,
        mode: "manual",
        hasManualNutrition: true,
        aliasPendingAdd: false,
        aliasAddable: false,
      }),
    ).toBe(true);
  });

  it("Elle modunda: makro alanları boşsa (hasManualNutrition false) engellemez", () => {
    expect(
      hasUnsavedBasketEntry({
        basketLength: 1,
        mode: "manual",
        hasManualNutrition: false,
        aliasPendingAdd: false,
        aliasAddable: false,
      }),
    ).toBe(false);
  });

  it("Hafızadan modunda: kullanıcı alias/miktarı değiştirip 'Ekle'ye basmazsa engeller", () => {
    expect(
      hasUnsavedBasketEntry({
        basketLength: 1,
        mode: "alias",
        hasManualNutrition: false,
        aliasPendingAdd: true,
        aliasAddable: true,
      }),
    ).toBe(true);
  });

  it("Hafızadan modunda: varsayılan seçim (dokunulmadı) engellemez — düzenleme ekranını açar açmaz Kaydet'i bozmasın", () => {
    // Regresyon kilidi: aliasId/grams her zaman bir varsayılana sahip (ilk
    // sıralı alias + her-zamanki tahmini), yani "seçili + miktar > 0" tek
    // başına HER edit açılışında true olurdu. aliasPendingAdd bunu önlüyor.
    expect(
      hasUnsavedBasketEntry({
        basketLength: 1,
        mode: "alias",
        hasManualNutrition: false,
        aliasPendingAdd: false,
        aliasAddable: true,
      }),
    ).toBe(false);
  });

  it("Hafızadan modunda: 'Ekle'ye basıldıktan sonra (pendingAdd sıfırlanır) tekrar engellemez", () => {
    // addAliasToBasket() eklendikten sonra aliasPendingAdd'i false'a döner;
    // alanlar aynı (az önce eklenen) değerleri taşımaya devam etse bile
    // Kaydet artık normal çalışmalı.
    expect(
      hasUnsavedBasketEntry({
        basketLength: 2,
        mode: "alias",
        hasManualNutrition: false,
        aliasPendingAdd: false,
        aliasAddable: true,
      }),
    ).toBe(false);
  });

  it("AI ile modunda hiçbir zaman engellemez (kapsam dışı — items otomatik sepete düşer)", () => {
    expect(
      hasUnsavedBasketEntry({
        basketLength: 1,
        mode: "ai",
        hasManualNutrition: true,
        aliasPendingAdd: true,
        aliasAddable: true,
      }),
    ).toBe(false);
  });
});
