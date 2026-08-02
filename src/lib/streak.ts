import { addDaysISO, todayISO } from "./format";
import type { MealItem } from "../types";

/** Bugünden geriye doğru ardışık, en az bir öğün kaydı olan gün sayısı.
 *  Bugün henüz kayıt yoksa bugünü saymadan dünden başlar — gün bitmeden
 *  seri "sıfırlanmış" gibi görünmesin diye. */
export function calculateStreak(days: Record<string, MealItem[]>): number {
  const today = todayISO();
  let count = 0;
  let currentDate = today;

  if (!days[today] || days[today].length === 0) {
    currentDate = addDaysISO(today, -1);
  }

  while (days[currentDate] && days[currentDate].length > 0) {
    count++;
    currentDate = addDaysISO(currentDate, -1);
  }

  return count;
}
