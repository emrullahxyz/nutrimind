import { describe, expect, it } from "vitest";
import { parseNum, scaleNutrition } from "./nutrition";
import type { Nutrition } from "../types";

const BASE: Nutrition = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };

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
});
