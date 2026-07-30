// ============================================================================
// Nutrimind — günleri ISO haftalara gruplama + haftalık istatistikler.
// ============================================================================
import { dayTotal } from "./days";
import type { Days } from "./days";
import { addNutrition } from "./nutrition";
import { ZERO_NUTRITION } from "../types";
import type { Nutrition } from "../types";

const DAY_MS = 86_400_000;

function parseUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** dateStr'in içinde bulunduğu haftanın Pazartesi'si (YYYY-MM-DD). */
export function weekStart(dateStr: string): string {
  const dt = parseUTC(dateStr);
  const dow = (dt.getUTCDay() + 6) % 7; // Pzt=0 .. Paz=6
  dt.setUTCDate(dt.getUTCDate() - dow);
  return toISO(dt);
}

export interface DayStat {
  date: string;
  total: Nutrition;
  hasData: boolean;
}

export interface Week {
  startDate: string; // Pazartesi
  endDate: string; // Pazar
  days: DayStat[]; // 7 gün, Pzt..Paz
  total: Nutrition;
  activeDays: number;
  avgKcal: number;
}

/** Tüm haftalar, yeniden eskiye. */
export function weeks(days: Days): Week[] {
  const dates = Object.keys(days);
  const starts = Array.from(new Set(dates.map(weekStart))).sort().reverse();
  return starts.map((start) => {
    const startDt = parseUTC(start);
    const week: DayStat[] = [];
    let total = { ...ZERO_NUTRITION };
    let active = 0;
    for (let i = 0; i < 7; i++) {
      const date = toISO(new Date(startDt.getTime() + i * DAY_MS));
      const hasData = date in days;
      const t = hasData ? dayTotal(days, date) : { ...ZERO_NUTRITION };
      if (hasData) {
        total = addNutrition(total, t);
        active++;
      }
      week.push({ date, total: t, hasData });
    }
    return {
      startDate: start,
      endDate: toISO(new Date(startDt.getTime() + 6 * DAY_MS)),
      days: week,
      total,
      activeDays: active,
      avgKcal: active ? total.kcal / active : 0,
    };
  });
}
