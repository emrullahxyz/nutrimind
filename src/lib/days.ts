// ============================================================================
// Nutrimind — gün verisi yardımcıları (canlı days üzerinde çalışır).
// ============================================================================
import { ZERO_NUTRITION } from "../types";
import type { MealItem, MealPayload, Nutrition } from "../types";
import { addNutrition } from "./nutrition";
import type { NutrientKey } from "./nutrients";

export type Days = Record<string, MealItem[]>;

export function sumMeals(meals: MealItem[]): Nutrition {
  return meals.reduce<Nutrition>((a, m) => addNutrition(a, m.computed), { ...ZERO_NUTRITION });
}

/** Bir besin için kapsama: kaç öğünde veri var / toplam kaç öğün.
 *  Arayüz "5 öğünün 3'ünde veri var" uyarısını buradan üretecek (Faz 2);
 *  toplam tek başına bunu söyleyemez, çünkü eksik öğün 0 sayılıyor. */
export function coverage(meals: MealItem[], key: NutrientKey): { have: number; of: number } {
  let have = 0;
  for (const m of meals) if (m.computed[key] !== undefined) have++;
  return { have, of: meals.length };
}

export function mealsOf(days: Days, date: string): MealItem[] {
  return days[date] ?? [];
}

export function dayTotal(days: Days, date: string): Nutrition {
  return sumMeals(mealsOf(days, date));
}

/** Kayıtlı günler, yeniden eskiye. */
export function datesDesc(days: Days): string[] {
  return Object.keys(days).sort().reverse();
}

/** Görüntüleme öğünlerini backend biçimine çevirir. */
export function toPayload(meals: MealItem[]): MealPayload[] {
  return meals.map((m) => ({
    name: m.label,
    nutrition: m.computed,
    ...(m.sources && m.sources.length > 0 ? { sources: m.sources } : {}),
    ...(m.loggedAt ? { loggedAt: m.loggedAt } : {}),
    ...(m.category ? { category: m.category } : {}),
  }));
}
