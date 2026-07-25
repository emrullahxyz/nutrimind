// ============================================================================
// Nutrimind — gün verisi yardımcıları (canlı days üzerinde çalışır).
// ============================================================================
import { ZERO_NUTRITION } from "../types";
import type { MealItem, MealPayload, Nutrition } from "../types";

export type Days = Record<string, MealItem[]>;

export function sumMeals(meals: MealItem[]): Nutrition {
  return meals.reduce<Nutrition>(
    (a, m) => ({
      kcal: a.kcal + m.computed.kcal,
      protein: a.protein + m.computed.protein,
      carbs: a.carbs + m.computed.carbs,
      fat: a.fat + m.computed.fat,
      fiber: a.fiber + m.computed.fiber,
    }),
    { ...ZERO_NUTRITION },
  );
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
  return meals.map((m) => ({ name: m.label, nutrition: m.computed }));
}
