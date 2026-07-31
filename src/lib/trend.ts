// ============================================================================
// Nutrimind — trend serisi: bir besinin takvim zaman serisi + 7 günlük
// hareketli ortalaması.
//
// BU DOSYANIN VARLIK SEBEBİ İKİ DÜRÜSTLÜK KURALI:
//
//   1. Kaydı olmayan gün `null`'dır, 0 DEĞİL. Girilmemiş bir günü "0 kcal"
//      saymak ortalamayı sahte biçimde aşağı çeker ve grafiğe olmayan bir çöküş
//      çizer. Bu yüzden pencere TAKVİM günleri üzerinde dolaşılır ve `days`'te
//      bulunmayan tarih `null` olarak seriye girer.
//
//   2. Hareketli ortalama, kayan 7 günün EN AZ 3'ünde veri varsa hesaplanır;
//      yoksa `null`. Ve yalnızca VERİSİ OLAN günler üzerinden ortalanır —
//      4 günü eksik bir pencerede 7'ye bölmek yine sahte bir düşüş üretirdi.
//      Asıl "trend" bu çizgidir; ham günlük değerler okunamayacak kadar gürültülü.
//
// Not: ortalama penceresi görünür aralığın SOLUNA taşar (bkz. `buildTrend`) —
// 30 günlük görünümün ilk gününün ortalaması kendinden önceki 6 günü de görür.
// ============================================================================
import { dayTotal } from "./days";
import type { Days } from "./days";
import { addDaysISO, formatNumber, todayISO } from "./format";
import type { NutrientDef, NutrientKey } from "./nutrients";
import type { Nutrition } from "../types";

/** Grafik aralığı: son N gün (bugün dahil) ya da tüm kayıt geçmişi. */
export type TrendRange = 7 | 30 | 90 | "all";

export interface TrendPoint {
  date: string;
  /** O günün toplamı; kayıt yoksa (ya da bu besin için veri yoksa) `null`. */
  value: number | null;
  /** Kayan 7 günün ortalaması; yeterli veri yoksa `null`. */
  avg: number | null;
  /** O GÜNÜN kendi hedefi (gün-tipli) — uyum ölçümü ve tooltip buna bakar.
   *  Girilmemiş/0 hedef `null`. */
  goal: number | null;
}

export interface TrendSeries {
  /** Takvim sırasına göre artan, boşluklar dahil. */
  points: TrendPoint[];
  /** Grafiğe çizilen DÜZ hedef çizgisi (haftalık ortalama); girilmemiş/0 ise
   *  `null`. Günlük hedef değil — bkz. `TrendGoal`. */
  goal: number | null;
  yMax: number;
  /** Değeri `null` OLMAYAN nokta sayısı. */
  dataCount: number;
}

/** Faz 8: trend katmanının hedef kaynağı. Hedef artık gün-tipli olduğu için
 *  İKİ AYRI şeye ihtiyaç var ve ikisi bilinçli olarak farklı:
 *
 *   • `of(date)` — o günün GERÇEK hedefi. Uyum (hedef tutturma) buna göre
 *     ölçülür; yoksa her antrenman günü "hedefin altında", her dinlenme günü
 *     "hedefin üstünde" görünürdü.
 *   • `line` — grafiğe çizilen DÜZ referans (haftalık ortalama). Her gün
 *     2.760/2.390 arasında zıplayan testere dişi bir hedef çizgisi, 7 günlük
 *     ortalamanın okunurluğunu — yani grafiğin bütün varlık sebebini — yok
 *     ederdi. */
export interface TrendGoal {
  of: (date: string) => Nutrition;
  line: Nutrition;
}

/** Hareketli ortalama penceresi (gün). */
const AVG_WINDOW = 7;
/** Pencerede bulunması gereken asgari veri günü — altındaysa ortalama yok. */
const AVG_MIN_DATA = 3;
/** Özet kutularının karşılaştırma penceresi (kayıtlı gün sayısı). */
const STAT_WINDOW = 7;
/** `target` besinlerde hedefin bu oranına ulaşmak "tutturuldu" sayılır. */
const TARGET_TOLERANCE = 0.9;

/** Hedef değeri: girilmemiş ya da 0 hedef "hedef yok"tur (0'a göre yüzde
 *  hesaplamak ya da grafiğe 0 hattı çizmek anlamsız). */
function goalFor(goal: Nutrition, key: NutrientKey): number | null {
  const g = goal[key];
  return g === undefined || !(g > 0) ? null : g;
}

/** Bir günün bu besindeki toplamı. Kayıt yok → `null`. Kayıt var ama besin
 *  girilmemiş (mikro besinler `undefined` kalabilir) → yine `null`: bilinmiyor
 *  ile sıfır aynı şey değil. */
function valueAt(days: Days, date: string, key: NutrientKey): number | null {
  if (!(date in days)) return null;
  const v = dayTotal(days, date)[key];
  return v === undefined ? null : v;
}

/** Pencerenin ilk günü. `all` için en eski kayıt (bugünden ileri olamaz);
 *  hiç kayıt yoksa `null` (seri boş döner). */
function windowStart(days: Days, range: TrendRange, end: string): string | null {
  if (range !== "all") return addDaysISO(end, -(range - 1));
  let earliest: string | null = null;
  for (const date of Object.keys(days)) if (earliest === null || date < earliest) earliest = date;
  if (earliest === null) return null;
  return earliest < end ? earliest : end;
}

/** `i` ile biten kayan pencerenin ortalaması — yalnızca verisi olan günler
 *  üzerinden, en az `AVG_MIN_DATA` gün varsa. */
function trailingAvg(values: readonly (number | null)[], i: number): number | null {
  let sum = 0;
  let count = 0;
  for (let j = Math.max(0, i - (AVG_WINDOW - 1)); j <= i; j++) {
    const v = values[j];
    if (v === null) continue;
    sum += v;
    count++;
  }
  return count >= AVG_MIN_DATA ? sum / count : null;
}

/** Üst sınır: en yüksek değer ile hedefin büyüğünün %10 üstü. Her şey 0 ise
 *  (ya da hiç veri yoksa) 1'e düşer — 0'a bölme yok, boş eksen çizilebilir. */
function yMaxOf(maxValue: number, goal: number | null): number {
  const top = Math.max(maxValue, goal ?? 0) * 1.1;
  return top > 0 ? top : 1;
}

/** Bir besin için trend serisi kurar. Hedef kaynağı için bkz. `TrendGoal`. */
export function buildTrend(
  days: Days,
  key: NutrientKey,
  range: TrendRange,
  goal: TrendGoal,
): TrendSeries {
  const goalValue = goalFor(goal.line, key);
  const end = todayISO();
  const start = windowStart(days, range, end);

  if (start === null) {
    return { points: [], goal: goalValue, yMax: yMaxOf(0, goalValue), dataCount: 0 };
  }

  // Ortalama penceresi görünür aralığın soluna taşar: seri 6 gün geriden kurulup
  // baştaki 6 nokta atılır. Böylece görünen İLK günün ortalaması da gerçek bir
  // 7 günlük ortalamadır (aralığı daraltmak ortalamayı değiştirmez).
  const lookback = addDaysISO(start, -(AVG_WINDOW - 1));
  const dates: string[] = [];
  for (let d = lookback; d <= end; d = addDaysISO(d, 1)) dates.push(d);

  const values = dates.map((d) => valueAt(days, d, key));

  const points: TrendPoint[] = [];
  let maxValue = 0;
  let dataCount = 0;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] < start) continue; // taşma günleri seriye girmez
    const value = values[i];
    if (value !== null) {
      dataCount++;
      if (value > maxValue) maxValue = value;
    }
    points.push({
      date: dates[i],
      value,
      avg: trailingAvg(values, i),
      goal: goalFor(goal.of(dates[i]), key),
    });
  }

  return { points, goal: goalValue, yMax: yMaxOf(maxValue, goalValue), dataCount };
}

// --- Özet kutuları ----------------------------------------------------------

export interface TrendStats {
  /** Verisi olan son 7 günün ortalaması. */
  recentAvg: number | null;
  /** Ondan önceki (verisi olan) 7 günün ortalaması. */
  prevAvg: number | null;
  /** recentAvg'ın prevAvg'a göre yüzde değişimi; biri yoksa `null`. */
  changePct: number | null;
  /** Hedefte kalınan gün sayısı. */
  onTargetDays: number;
  /** Değerlendirmeye giren gün sayısı (verisi olan günler; hedef yoksa 0). */
  ratedDays: number;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Serinin özeti. Pencereler TAKVİM günü değil KAYITLI gün sayar: aralıkta 4
 *  günlük veri varsa "son 7 gün" o 4 günü kullanır, aksi halde seyrek veride
 *  kutular hep boş kalırdı.
 *
 *  "Hedefte" ölçütü `direction`'a göre değişir:
 *    • `target` (protein, lif…)  → değer hedefin %90'ına ULAŞTIYSA
 *    • `limit`  (sodyum, şeker…) → değer hedefi AŞMADIYSA
 *
 *  Faz 8: karşılaştırma HER GÜNÜN KENDİ hedefine göre yapılır (`point.goal`),
 *  grafiğe çizilen düz ortalama çizgisine göre değil. Aksi halde antrenman
 *  günleri sistematik olarak "hedefin altında", dinlenme günleri "üstünde"
 *  görünür ve oran anlamını yitirirdi. Hedefi olmayan gün hiç sayılmaz. */
export function trendStats(series: TrendSeries, def: NutrientDef): TrendStats {
  const recorded: number[] = [];
  let onTargetDays = 0;
  let ratedDays = 0;

  for (const p of series.points) {
    if (p.value === null) continue;
    recorded.push(p.value);
    if (p.goal === null || !(p.goal > 0)) continue;
    ratedDays++;
    const ok = def.direction === "limit" ? p.value <= p.goal : p.value >= p.goal * TARGET_TOLERANCE;
    if (ok) onTargetDays++;
  }

  const recentAvg = mean(recorded.slice(-STAT_WINDOW));
  const prevAvg = mean(recorded.slice(-2 * STAT_WINDOW, -STAT_WINDOW));
  const changePct =
    recentAvg !== null && prevAvg !== null && prevAvg !== 0
      ? ((recentAvg - prevAvg) / prevAvg) * 100
      : null;

  return { recentAvg, prevAvg, changePct, onTargetDays, ratedDays };
}

/** Bir besin değerinin okunur biçimi: kayıttaki hassasiyet + birim
 *  ("2.400 kcal", "145,0 g", "1.400 mg"). Grafiğin tooltip'i ile sayfanın özet
 *  kutuları aynı biçimi kullansın diye burada, tek yerde. */
export function formatNutrientValue(def: NutrientDef, value: number): string {
  return `${formatNumber(value, def.decimals)} ${def.unit}`;
}
