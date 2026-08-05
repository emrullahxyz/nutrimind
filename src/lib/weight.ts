import type { AppConfig } from "../types";
import type { TrendRange } from "./trend";
import { addDaysISO, todayISO } from "./format";

export interface WeightConfig {
  entries: Record<string, number>; // "YYYY-MM-DD" -> kg
}

export const EMPTY_WEIGHT: WeightConfig = { entries: {} };

/** `config.weight`'i doğrular — supplements.ts'in savunmacı tarzı: geçersiz
 *  (tarih formatı /^\d{4}-\d{2}-\d{2}$/ değil, ya da finite sayı > 0 değil)
 *  girişler tek tek atlanır, bütün parse çökmez. */
export function parseWeightConfig(config: AppConfig): WeightConfig {
  if (typeof config !== "object" || config === null) {
    return EMPTY_WEIGHT;
  }
  const rawWeight = config.weight;
  if (typeof rawWeight !== "object" || rawWeight === null || Array.isArray(rawWeight)) {
    return EMPTY_WEIGHT;
  }
  const rawEntries = rawWeight.entries;
  if (typeof rawEntries !== "object" || rawEntries === null || Array.isArray(rawEntries)) {
    return EMPTY_WEIGHT;
  }

  const entries: Record<string, number> = {};
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  for (const [date, val] of Object.entries(rawEntries as Record<string, unknown>)) {
    if (!dateRegex.test(date)) continue;
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      entries[date] = val;
    }
  }

  return { entries };
}

/** `entries`'e `date` için `kg`'yi ekler/günceller. `WeightCard`'ın (satır ~30)
 *  yazma deseninin ortak, test edilebilir çekirdeği — `SettingsSheet`'in profil
 *  kilosu da AYNI bu deseni kullanmalı (`config.weight_${tarih}` gibi ayrı bir
 *  anahtara yazmak kilo takibinden kopuk, yetim bir kayıt üretiyordu).
 *  Geçersiz (`kg` sonlu değil ya da <= 0) girişte `entries` değişmeden döner. */
export function withWeightEntry(
  entries: Record<string, number>,
  date: string,
  kg: number,
): Record<string, number> {
  if (!Number.isFinite(kg) || kg <= 0) return entries;
  return { ...entries, [date]: kg };
}

/** `date`'ten KESİN ÖNCE en son girilmiş tarih/kg — yoksa null. */
export function latestEntryBefore(
  entries: Record<string, number>,
  date: string,
): { date: string; kg: number } | null {
  const dates = Object.keys(entries).filter((d) => d < date);
  if (dates.length === 0) return null;

  let maxDate = dates[0];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] > maxDate) {
      maxDate = dates[i];
    }
  }

  return { date: maxDate, kg: entries[maxDate] };
}

/** entries[date] - latestEntryBefore(...)'un kg'si; ikisinden biri yoksa null. */
export function weightDelta(entries: Record<string, number>, date: string): number | null {
  if (!(date in entries) || typeof entries[date] !== "number") {
    return null;
  }
  const prev = latestEntryBefore(entries, date);
  if (prev === null) {
    return null;
  }
  return entries[date] - prev.kg;
}

export interface WeightTrendPoint {
  date: string;
  kg: number | null; // eksik gün = null, ASLA 0 veya interpolasyon
}

/** `range` (7|30|90|"all") kadar geriye, `entries`'te KAYITLI EN ESKİ tarihten
 *  bugüne kadar takvim günlerinde gezip WeightTrendPoint[] üretir. "all" için
 *  en eski entries anahtarından başla (hiç kayıt yoksa boş dizi döndür). Bu
 *  fonksiyon `src/lib/trend.ts`'teki `windowStart`/`buildTrend`'in YAPISINI
 *  taklit eder ama trend.ts'e DOKUNMA — mantığı burada bağımsız yeniden yaz
 *  (`import { addDaysISO, todayISO } from "./format";` kullanarak).
 */
export function buildWeightSeries(
  entries: Record<string, number>,
  range: TrendRange,
): WeightTrendPoint[] {
  const end = todayISO();
  let start: string | null = null;

  if (range !== "all") {
    start = addDaysISO(end, -(range - 1));
  } else {
    const dates = Object.keys(entries);
    if (dates.length === 0) {
      return [];
    }
    let earliest = dates[0];
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < earliest) {
        earliest = dates[i];
      }
    }
    start = earliest < end ? earliest : end;
  }

  const points: WeightTrendPoint[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    const kg = d in entries && typeof entries[d] === "number" ? entries[d] : null;
    points.push({ date: d, kg });
  }

  return points;
}
