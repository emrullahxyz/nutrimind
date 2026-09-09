import { describe, expect, it } from "vitest";
import {
  GRAM_UNIT,
  addNutrition,
  clampMinGrams,
  defaultQuantityForAlias,
  defaultUnitForAlias,
  parseNum,
  scaleMealSources,
  scaleNutrition,
  scaleNutritionByFactor,
  toGrams,
  unitOptions,
} from "./nutrition";
import { parseUnits } from "./api";
import { coverage, sumMeals } from "./days";
import { CORE_KEYS, MACROS, MICROS, NUTRIENTS, nutrientOf } from "./nutrients";
import type { NutrientKey } from "./nutrients";
import type { Alias, AliasUnit, MealItem, MealSource, Nutrition } from "../types";

const BASE: Nutrition = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };

/** Test öğünü — `sumMeals`/`coverage` MealItem üzerinde çalışır. */
function meal(id: string, computed: Nutrition): MealItem {
  return { id, label: id, computed };
}

describe("parseNum", () => {
  it("virgüllü tr-TR girdisini sayıya çevirir", () => {
    expect(parseNum("12,5")).toBe(12.5);
  });
  it("noktalı girdiyi de kabul eder", () => {
    expect(parseNum("12.5")).toBe(12.5);
  });
  it("baştaki/sondaki boşlukları yok sayar", () => {
    expect(parseNum("  7 ")).toBe(7);
  });
  it("boş ya da geçersiz girdide 0 döner", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum("abc")).toBe(0);
  });

  // Uygulama sayıları tr-TR biçiminde gösteriyor; kullanıcı gördüğünü yazabilir.
  it("binlik ayırıcılı girdiyi doğru okur", () => {
    expect(parseNum("2.600")).toBe(2600);
    expect(parseNum("1.013")).toBe(1013);
    expect(parseNum("1.234.567")).toBe(1234567);
  });
  it("binlik + ondalık birlikte", () => {
    expect(parseNum("1.013,5")).toBe(1013.5);
    expect(parseNum("2.600,25")).toBe(2600.25);
  });
  it("3 haneli olmayan tek noktayı ondalık sayar", () => {
    expect(parseNum("12.5")).toBe(12.5);
    expect(parseNum("0.75")).toBe(0.75);
    expect(parseNum("66.7")).toBe(66.7);
    expect(parseNum("0.500")).toBe(0.5);
    expect(parseNum("0.250")).toBe(0.25);
    expect(parseNum("0,500")).toBe(0.5); // virgüllü yol zaten doğruydu — regresyon kilidi
  });
  it("negatif değerleri korur", () => {
    expect(parseNum("-12,5")).toBe(-12.5);
  });
});

describe("clampMinGrams — 1g minimumu", () => {
  it("1g altındaki pozitif girişi 1'e çeker", () => {
    expect(clampMinGrams("0.5")).toBe("1");
    expect(clampMinGrams("0.05")).toBe("1");
    expect(clampMinGrams("0,25")).toBe("1");
  });
  it("1g ve üzerini olduğu gibi bırakır", () => {
    expect(clampMinGrams("1")).toBe("1");
    expect(clampMinGrams("150")).toBe("150");
    expect(clampMinGrams("12.5")).toBe("12.5");
  });
  it("0'ı çekmez — anlamlı bir girdidir", () => {
    expect(clampMinGrams("0")).toBe("0");
  });
  it("boş/geçersiz girdiyi olduğu gibi bırakır (clamp mantığı ayrıştırmayla karışmaz)", () => {
    expect(clampMinGrams("")).toBe("");
    expect(clampMinGrams("abc")).toBe("abc");
  });
});

describe("scaleNutrition", () => {
  it("iki katı gramda makroyu ikiye katlar", () => {
    expect(scaleNutrition(BASE, 100, 200)).toEqual({
      kcal: 200,
      protein: 20,
      carbs: 40,
      fat: 10,
      fiber: 4,
    });
  });
  it("yarım porsiyonu yarıya böler", () => {
    expect(scaleNutrition(BASE, 100, 50)).toEqual({
      kcal: 50,
      protein: 5,
      carbs: 10,
      fat: 2.5,
      fiber: 1,
    });
  });
  it("sonucu 1 ondalığa yuvarlar", () => {
    expect(scaleNutrition(BASE, 150, 100).kcal).toBe(66.7);
  });
  it("serving_g 0 ise sıfır makro döner (bölme hatası yok)", () => {
    expect(scaleNutrition(BASE, 0, 100)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    });
  });

  // --- Kayıt (registry) tabanlı davranış ---
  it("sonuçta tam olarak çekirdek 5 alan bulunur (mikro uydurmaz)", () => {
    expect(Object.keys(scaleNutrition(BASE, 100, 200)).sort()).toEqual([...CORE_KEYS].sort());
  });
  it("girilmemiş mikro besin YOK kalır, 0'a çevrilmez", () => {
    const out = scaleNutrition(BASE, 100, 200);
    expect(out.sodium).toBeUndefined();
    expect("sodium" in out).toBe(false);
    expect("sugar" in out).toBe(false);
    expect("satFat" in out).toBe(false);
  });
  it("verilmiş mikro besin de ölçeklenir (arayüze girmemiş olsa bile düşmez)", () => {
    const out = scaleNutrition({ ...BASE, sodium: 300 }, 100, 200);
    expect(out.sodium).toBe(600);
  });
});

// ============================================================================
// Bug: NutritionSheet'in porsiyon çarpanı (×2 vb.) `computed`'ı ölçekliyordu
// ama `sources[].qty`'yi eski değerinde bırakıyordu — usualQuantity'nin
// ("geçmişe dayalı miktar tahmini") temel aldığı veri bozuluyordu.
// ============================================================================
describe("scaleMealSources", () => {
  it("her kaydın qty'sini çarpanla ölçekler, aliasId/unit'i değiştirmez", () => {
    const sources: MealSource[] = [{ aliasId: "yumurta", qty: 100, unit: "g" }];
    expect(scaleMealSources(sources, 2)).toEqual([{ aliasId: "yumurta", qty: 200, unit: "g" }]);
  });

  it("birden fazla kaynağı da (sepetten gelen çoklu malzeme) tek tek ölçekler", () => {
    const sources: MealSource[] = [
      { aliasId: "a", qty: 100, unit: "g" },
      { aliasId: "b", qty: 2, unit: "adet" },
    ];
    expect(scaleMealSources(sources, 1.5)).toEqual([
      { aliasId: "a", qty: 150, unit: "g" },
      { aliasId: "b", qty: 3, unit: "adet" },
    ]);
  });

  it("sonucu 1 ondalığa yuvarlar (scaleNutrition ile aynı hassasiyet)", () => {
    const sources: MealSource[] = [{ aliasId: "a", qty: 100, unit: "g" }];
    expect(scaleMealSources(sources, 0.25)?.[0].qty).toBe(25);
    expect(scaleMealSources([{ aliasId: "a", qty: 33, unit: "g" }], 1 / 3)?.[0].qty).toBeCloseTo(11, 1);
  });

  it("sources yoksa (elle girilmiş kalem) undefined döner, uydurmaz", () => {
    expect(scaleMealSources(undefined, 2)).toBeUndefined();
  });

  it("sources boş dizi ise undefined döner", () => {
    expect(scaleMealSources([], 2)).toBeUndefined();
  });
});

describe("scaleNutritionByFactor", () => {
  it("1x çarpanla değeri değiştirmez", () => {
    expect(scaleNutritionByFactor(BASE, 1)).toEqual(BASE);
  });

  it("çarpanla tüm alanları orantılı ölçekler", () => {
    expect(scaleNutritionByFactor(BASE, 2)).toEqual({
      kcal: 200,
      protein: 20,
      carbs: 40,
      fat: 10,
      fiber: 4,
    });
  });

  it("0.25 gibi kesirli çarpanı doğru uygular", () => {
    expect(scaleNutritionByFactor(BASE, 0.25)).toEqual({
      kcal: 25,
      protein: 2.5,
      carbs: 5,
      fat: 1.3,
      fiber: 0.5,
    });
  });

  it("tanımsız mikro alanları tanımsız bırakır (0 yazmaz)", () => {
    const withUndefinedMicros: Nutrition = {
      ...BASE,
      sugar: undefined,
      satFat: undefined,
      sodium: undefined,
    };
    const result = scaleNutritionByFactor(withUndefinedMicros, 2);
    expect(result.sugar).toBeUndefined();
    expect(result.satFat).toBeUndefined();
    expect(result.sodium).toBeUndefined();
  });

  it("tanımlı bir mikro alanı da doğru ölçekler", () => {
    const withSugar: Nutrition = { ...BASE, sugar: 8 };
    expect(scaleNutritionByFactor(withSugar, 1.5).sugar).toBe(12);
  });
});

describe("addNutrition", () => {
  it("çekirdek alanları toplar", () => {
    expect(addNutrition(BASE, BASE)).toEqual({
      kcal: 200,
      protein: 20,
      carbs: 40,
      fat: 10,
      fiber: 4,
    });
  });
  it("iki tarafta da olmayan mikro besin sonuçta hiç görünmez", () => {
    const out = addNutrition(BASE, BASE);
    expect("sodium" in out).toBe(false);
  });
  it("tek tarafta olan mikro besin görünür; eksik taraf 0 sayılır", () => {
    const out = addNutrition({ ...BASE, sodium: 300 }, BASE);
    expect(out.sodium).toBe(300);
  });
  it("her iki taraftaki mikro besin toplanır", () => {
    const out = addNutrition({ ...BASE, sodium: 300 }, { ...BASE, sodium: 120 });
    expect(out.sodium).toBe(420);
  });
});

describe("sumMeals", () => {
  it("öğün yoksa sıfır besin döner", () => {
    expect(sumMeals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });
  it("öğünlerin çekirdek alanlarını toplar", () => {
    expect(sumMeals([meal("a", BASE), meal("b", BASE), meal("c", BASE)])).toEqual({
      kcal: 300,
      protein: 30,
      carbs: 60,
      fat: 15,
      fiber: 6,
    });
  });
  it("mikro besin YALNIZCA en az bir öğünde veri varsa sonuca girer", () => {
    const without = sumMeals([meal("a", BASE), meal("b", BASE)]);
    expect("sodium" in without).toBe(false);

    const withOne = sumMeals([meal("a", BASE), meal("b", { ...BASE, sodium: 500 })]);
    // Veri olmayan öğün o toplamda 0 sayılır — toplam silinmez ama uydurulmaz da.
    expect(withOne.sodium).toBe(500);
  });
});

describe("coverage", () => {
  it("kaç öğünde veri olduğunu sayar", () => {
    const meals = [
      meal("a", { ...BASE, sodium: 100 }),
      meal("b", BASE),
      meal("c", { ...BASE, sodium: 0 }), // 0 geçerli bir VERİ, eksik değil
      meal("d", BASE),
      meal("e", { ...BASE, sodium: 50 }),
    ];
    expect(coverage(meals, "sodium")).toEqual({ have: 3, of: 5 });
  });
  it("çekirdek alanlar her öğünde vardır", () => {
    expect(coverage([meal("a", BASE), meal("b", BASE)], "protein")).toEqual({ have: 2, of: 2 });
  });
  it("öğün yoksa 0/0", () => {
    expect(coverage([], "protein")).toEqual({ have: 0, of: 0 });
  });

  // --- Faz 2: DayView'ın mikro satır kararı bu ikiliye dayanıyor ---
  it("hiçbir öğünde veri yoksa toplam da kapsama da besini üretmez (satır çizilmez)", () => {
    const meals = [meal("a", BASE), meal("b", BASE), meal("c", BASE)];
    expect(sumMeals(meals).sodium).toBeUndefined();
    expect(coverage(meals, "sodium")).toEqual({ have: 0, of: 3 });
  });
  it("kısmi veride toplam gerçek ama eksik — kapsama bunu söyleyebiliyor", () => {
    const meals = [
      meal("a", { ...BASE, sodium: 400 }),
      meal("b", BASE),
      meal("c", { ...BASE, sodium: 250 }),
      meal("d", BASE),
      meal("e", BASE),
    ];
    expect(sumMeals(meals).sodium).toBe(650);
    expect(coverage(meals, "sodium")).toEqual({ have: 2, of: 5 }); // "2/5 öğünde veri"
  });
  it("tam kapsamada uyarı gerekmez (have === of)", () => {
    const meals = [meal("a", { ...BASE, sugar: 10 }), meal("b", { ...BASE, sugar: 5 })];
    const cov = coverage(meals, "sugar");
    expect(cov).toEqual({ have: 2, of: 2 });
    expect(cov.have < cov.of).toBe(false);
  });
});

describe("besin kaydı (registry)", () => {
  it("Faz 2 kaydı: çekirdek 5 + mikro 3, bu sırayla", () => {
    expect(NUTRIENTS.map((d) => d.key)).toEqual([
      "kcal",
      "protein",
      "carbs",
      "fat",
      "fiber",
      "sugar",
      "satFat",
      "sodium",
    ]);
    expect(MICROS.map((d) => d.key)).toEqual(["sugar", "satFat", "sodium"]);
  });
  it("MACROS kaloriyi ve mikroları dışlar, bar sırasını korur", () => {
    expect(MACROS.map((d) => d.key)).toEqual(["protein", "carbs", "fat", "fiber"]);
  });
  it("Tailwind sınıfları DÜZ metin olmak zorunda (JIT birleştirilmiş sınıfı üretmez)", () => {
    for (const def of NUTRIENTS) {
      for (const cls of [def.classes.text, def.classes.bg, def.classes.track]) {
        expect(cls).not.toContain("$");
        expect(cls.length).toBeGreaterThan(0);
      }
    }
  });
  it("nutrientOf kayıtlı tanımı döner, kayıtlı olmayanda patlar", () => {
    expect(nutrientOf("carbs").label).toBe("Karbonhidrat");
    expect(nutrientOf("carbs").classes.text).toBe("text-carb"); // domain `carbs` ↔ token `carb`
    expect(nutrientOf("sodium").label).toBe("Sodyum");
    // Kayıtta olmayan anahtar hâlâ çağrı hatası — kayıt dışı bir anahtar
    // uydurulamaz. (Tip zaten engelliyor; bu çalışma-zamanı kilidi.)
    expect(() => nutrientOf("magnesium" as NutrientKey)).toThrow();
  });

  // --- Faz 2: mikro kayıtlarının değişmezleri ---
  it("mikroların hepsi limit yönlü ve mikro grubunda", () => {
    for (const def of MICROS) {
      expect(def.group).toBe("micro");
      expect(def.direction).toBe("limit"); // limite ULAŞMAK başarı değil
    }
  });
  it("birimler: şeker/doymuş yağ g, sodyum mg", () => {
    expect(nutrientOf("sugar").unit).toBe("g");
    expect(nutrientOf("satFat").unit).toBe("g");
    expect(nutrientOf("sodium").unit).toBe("mg");
    expect(nutrientOf("sodium").decimals).toBe(0); // mg'de ondalık sahte hassasiyet
  });
  it("mikroların OFF anahtarı Faz 4 için kayıtta hazır", () => {
    expect(nutrientOf("sugar").offKey).toBe("sugars_100g");
    expect(nutrientOf("satFat").offKey).toBe("saturated-fat_100g");
    expect(nutrientOf("sodium").offKey).toBe("sodium_100g");
  });
  it("mikrolar tek ortak sessiz tonu paylaşır (etiketle ayrışır, renkle değil)", () => {
    const tones = new Set(MICROS.map((d) => d.classes.bg));
    expect(tones).toEqual(new Set(["bg-micro"]));
    // Makroların rengiyle çakışmıyor: yanındaki makro kadar bağırmasın.
    for (const macro of MACROS) expect(macro.classes.bg).not.toBe("bg-micro");
  });
  it("mikroların kısa etiketleri ayrı ve boş değil", () => {
    const shorts = MICROS.map((d) => d.short);
    expect(shorts).toEqual(["Ş", "DY", "Na"]);
    expect(new Set(NUTRIENTS.map((d) => d.short)).size).toBe(NUTRIENTS.length);
  });
});

describe("parseUnits (Faz 5)", () => {
  it("geçerli birim dizisini doğru doğrular ve döndürür", () => {
    const raw = [
      { name: "adet", grams: 60 },
      { name: "kase", grams: 250 },
    ];
    expect(parseUnits(raw)).toEqual([
      { name: "adet", grams: 60 },
      { name: "kase", grams: 250 },
    ]);
  });

  it("metin olan grams değerlerini parseNum ile dönüştürür", () => {
    const raw = [{ name: "ölçek", grams: "30,5" }];
    expect(parseUnits(raw)).toEqual([{ name: "ölçek", grams: 30.5 }]);
  });

  it("bozuk veya negatif gram değerlerini eler", () => {
    const raw = [
      { name: "geçersiz1", grams: 0 },
      { name: "geçersiz2", grams: -50 },
      { name: "", grams: 100 },
      { name: "geçerli", grams: 40 },
    ];
    expect(parseUnits(raw)).toEqual([{ name: "geçerli", grams: 40 }]);
  });

  it("dizi olamayan veya boş girdilerde undefined döner", () => {
    expect(parseUnits(null)).toBeUndefined();
    expect(parseUnits(undefined)).toBeUndefined();
    expect(parseUnits({})).toBeUndefined();
    expect(parseUnits([])).toBeUndefined();
  });

  it("birim miktarı ile toplam gram hesabı ve besin ölçeklemesi", () => {
    const baseAlias: Alias = {
      id: "yumurta",
      triggers: ["yumurta"],
      name: "Yumurta",
      brand: null,
      serving_g: 100,
      nutrition: { kcal: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0 },
      units: [{ name: "adet", grams: 50 }],
    };

    const unit = baseAlias.units![0];
    const amount = 2; // 2 adet
    const totalGrams = amount * unit.grams; // 100g
    const scaled = scaleNutrition(baseAlias.nutrition, baseAlias.serving_g, totalGrams);

    expect(totalGrams).toBe(100);
    expect(scaled.kcal).toBe(155);
    expect(scaled.protein).toBe(13);
  });
});

describe("defaultUnitForAlias / defaultQuantityForAlias", () => {
  it("varsayılan birim yoksa gramı seçer", () => {
    expect(defaultUnitForAlias({ units: [{ name: "adet", grams: 50 }] })).toEqual(GRAM_UNIT);
  });

  it("geçersiz veya silinmiş varsayılan birimde gramı seçer", () => {
    expect(defaultUnitForAlias({ defaultUnit: "kase", units: [{ name: "adet", grams: 50 }] })).toEqual(GRAM_UNIT);
  });

  it("özel varsayılan birimi ve serving karşılığını hesaplar", () => {
    const alias = { serving_g: 100, units: [{ name: "adet", grams: 50 }], defaultUnit: "adet" };
    expect(defaultUnitForAlias(alias)).toEqual({ name: "adet", grams: 50 });
    expect(defaultQuantityForAlias(alias)).toEqual({ unit: { name: "adet", grams: 50 }, value: 2 });
  });
});

describe("unitOptions / toGrams (Faz 5)", () => {
  it("gram her zaman ilk seçenek ve 1'e eşit", () => {
    expect(unitOptions(undefined)).toEqual([{ name: "g", grams: 1 }]);
    expect(unitOptions([])[0]).toEqual(GRAM_UNIT);
  });

  it("besinin kendi birimleri gramdan sonra gelir", () => {
    const units: AliasUnit[] = [
      { name: "adet", grams: 50 },
      { name: "kase", grams: 250 },
    ];
    expect(unitOptions(units).map((u) => u.name)).toEqual(["g", "adet", "kase"]);
  });

  it("kullanıcının 'g' adlı birimi elenir — yinelenen seçenek üretmez", () => {
    // Yerleşik gram zaten listede; ikinci bir "g" hem yinelenen React key olur
    // hem de seçim her zaman yerleşiği bulacağı için hiç uygulanmazdı.
    const units: AliasUnit[] = [
      { name: "g", grams: 50 },
      { name: "G", grams: 80 },
      { name: " g ", grams: 90 },
      { name: "adet", grams: 50 },
    ];
    const opts = unitOptions(units);
    expect(opts.map((u) => u.name)).toEqual(["g", "adet"]);
    expect(opts.filter((u) => u.name.trim().toLowerCase() === "g")).toHaveLength(1);
    expect(opts[0].grams).toBe(1);
  });

  it("toGrams: miktar × birim gramı", () => {
    expect(toGrams(2, { name: "adet", grams: 50 })).toBe(100);
    expect(toGrams(1, GRAM_UNIT)).toBe(1);
    expect(toGrams(150, GRAM_UNIT)).toBe(150);
  });

  it("toGrams tr-TR ondalıkla birlikte çalışır", () => {
    // Kullanıcı "2,5" yazar; parseNum 2.5 üretir, yarım kase 125 g eder.
    expect(toGrams(parseNum("2,5"), { name: "kase", grams: 250 })).toBe(625);
    expect(toGrams(parseNum("0,5"), { name: "dilim", grams: 30 })).toBe(15);
  });

  it("birim üzerinden ölçekleme doğru makro veriyor", () => {
    // 50 g'lık yumurta, 100 g için tanımlı değerler → 2 adet = 100 g = birebir.
    const perServing: Nutrition = { kcal: 155, protein: 13, carbs: 1, fat: 11, fiber: 0 };
    const grams = toGrams(2, { name: "adet", grams: 50 });
    expect(grams).toBe(100);
    expect(scaleNutrition(perServing, 100, grams)).toEqual(perServing);
  });
});

