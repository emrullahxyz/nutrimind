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

export interface WeightEntry {
  date: string;
  kg: number;
}

/** Tüm ölçümler, tarihe göre ARTAN sırada. Sıralama `YYYY-MM-DD` dizge
 *  karşılaştırmasıyla yapılır (aynı biçim, aynı uzunluk → sözlük sırası =
 *  kronolojik sıra); `Date` nesnesi hiç üretilmez, saat dilimi kayması olmaz. */
export function sortedEntries(entries: Record<string, number>): WeightEntry[] {
  return Object.entries(entries)
    .map(([date, kg]) => ({ date, kg }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** EN SON (en büyük tarihli) ölçüm — hiç kayıt yoksa null.
 *
 *  "Mevcut kilo" BURADAN okunur: Ayarlar'daki kilo ekranı daha önce profil
 *  formunun (localStorage) değerini gösteriyordu, yani aylar önce girilmiş bir
 *  sayıyı "mevcut" diye sunuyordu. */
export function latestEntry(entries: Record<string, number>): WeightEntry | null {
  const list = sortedEntries(entries);
  return list.length === 0 ? null : list[list.length - 1];
}

/** Sihirbaz/profil kaynaklı bir kilo, takip geçmişine YALNIZCA o gün için kayıt
 *  yoksa yazılır: kullanıcının işlediği gerçek ölçüm, formdaki değerden üstündür.
 *  Geçersiz kg'de (withWeightEntry kuralı) entries değişmeden döner. */
export function seedEntry(
  entries: Record<string, number>,
  date: string,
  kg: number,
): Record<string, number> {
  if (date in entries) return entries;
  return withWeightEntry(entries, date, kg);
}

/** Profil formundan bugüne kilo yazımı.
 *
 *  ⚠️ Yalnızca kullanıcı kilo alanını BU oturumda düzenlediyse yazar
 *  (`weightChanged`). Aksi hâlde sadece adı düzeltmek için "Profili Kaydet"e
 *  basmak, form açıldığında okunan bayat kilo değerini bugünün GERÇEK ölçümünün
 *  üzerine yazıyordu — kilo geçmişinde "saçma veri" olarak görünen yol buydu. */
export function profileWeightEntries(
  entries: Record<string, number>,
  date: string,
  kg: number,
  weightChanged: boolean,
): Record<string, number> {
  if (!weightChanged) return entries;
  return withWeightEntry(entries, date, kg);
}

/** `config.profile` içindeki vücut alanları — savunmacı (parseWeightConfig
 *  tarzı): geçersiz/eksik alan `null`'dır, `0` ya da uydurma varsayılan DEĞİL.
 *  Hedef kilo sihirbazın 2. adımında zorunlu soruluyor; okuyan tek yer burası. */
export function parseBodyStats(config: AppConfig): {
  weightKg: number | null;
  targetWeightKg: number | null;
  heightCm: number | null;
} {
  const profile = typeof config === "object" && config !== null ? config.profile : null;
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
    return { weightKg: null, targetWeightKg: null, heightCm: null };
  }
  const raw = profile as Record<string, unknown>;
  const pozitif = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  return {
    weightKg: pozitif(raw.weightKg),
    targetWeightKg: pozitif(raw.targetWeightKg),
    heightCm: pozitif(raw.heightCm),
  };
}

export interface WeightProgress {
  /** Geçmişteki İLK ölçüm (yolun başlangıcı). */
  start: WeightEntry;
  /** Şu anki (en son) ölçüm. */
  current: WeightEntry;
  targetKg: number;
  /** current − target: negatif = hedefe henüz varılmadı, >= 0 = hedefe gelindi.
   *  Yön bilgisi `direction`'da; bu alan işaretli ham farktır. */
  remainingKg: number;
  /** Yolun ne kadarı tamam: 0…1. Anlamsızsa (başlangıç = hedef, tek ölçümle
   *  hiç ilerleme yok) `null` — sahte bir yüzde çizmek yerine çubuk gizlenir. */
  pct: number | null;
  direction: "loss" | "gain" | "hold";
}

/** Başlangıç ölçümünden hedefe giden yolun ne kadarının alındığı.
 *
 *  TEK formül iki yönde de çalışır: `(current − start) / (target − start)`.
 *  Kilo verirken payda negatiftir ve aşağı inen bir `current` pozitif yüzde
 *  verir; kilo alırken payda pozitiftir ve yükselen `current` yine pozitif verir.
 *  Kırpma `clamp` ile yapılır: hedefin altına/üstüne taşan ölçüm %100'de,
 *  geriye giden ölçüm %0'da durur (çubuk negatif genişlik üretemez).
 *
 *  Dönüş: hiç ölçüm yoksa `null`; tek ölçümde `start === current` (yol henüz
 *  başlamamış, `pct` hesaplanır ama 0 çıkar). */
export function weightProgress(
  entries: Record<string, number>,
  targetKg: number | null,
): WeightProgress | null {
  const list = sortedEntries(entries);
  if (list.length === 0) return null;

  const start = list[0];
  const current = list[list.length - 1];
  const gecerliHedef = targetKg !== null && Number.isFinite(targetKg) && targetKg > 0;
  const span = gecerliHedef ? targetKg - start.kg : 0;

  const direction: WeightProgress["direction"] =
    !gecerliHedef || Math.abs(span) < 0.05 ? "hold" : span < 0 ? "loss" : "gain";

  const pct =
    !gecerliHedef || Math.abs(span) < 0.05
      ? null
      : Math.min(1, Math.max(0, (current.kg - start.kg) / span));

  return {
    start,
    current,
    targetKg: gecerliHedef ? targetKg : 0,
    remainingKg: gecerliHedef ? current.kg - targetKg : 0,
    pct,
    direction,
  };
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
