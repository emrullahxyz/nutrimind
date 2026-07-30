import { describe, expect, it } from "vitest";
import { addNutrition, parseNum, scaleNutrition } from "./nutrition";
import { coverage, sumMeals } from "./days";
import { CORE_KEYS, MACROS, MICROS, NUTRIENTS, nutrientOf } from "./nutrients";
import type { MealItem, Nutrition } from "../types";

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
});

describe("besin kaydı (registry)", () => {
  it("Faz 0 tam olarak mevcut 5 besinle çalışır — mikro kayıtlı değil", () => {
    expect(NUTRIENTS.map((d) => d.key)).toEqual(["kcal", "protein", "carbs", "fat", "fiber"]);
    expect(MICROS).toEqual([]);
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
    expect(() => nutrientOf("sodium")).toThrow();
  });
});
