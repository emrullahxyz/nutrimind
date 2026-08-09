// ============================================================================
// Nutrimind — saf besin hesapları (alias ölçekleme + tr-TR sayı ayrıştırma).
// ============================================================================
import { ZERO_NUTRITION } from "../types";
import type { AliasUnit, MealSource, Nutrition } from "../types";
import { NUTRIENT_KEYS, makeNutrition } from "./nutrients";
import type { NutrientKey } from "./nutrients";

/** Gram her zaman vardır ve tanımı gereği 1'e eşittir. */
export const GRAM_UNIT: AliasUnit = { name: "g", grams: 1 };

/** Öğün formundaki birim seçeneği listesi: gram + besinin kendi birimleri.
 *
 *  Kullanıcının "g" adıyla tanımladığı birim ELENİR. Aksi halde select'te aynı
 *  adda iki seçenek olur (yinelenen React key) ve seçim yerleşik gramı bulacağı
 *  için kullanıcının tanımı zaten hiçbir zaman uygulanmazdı. */
export function unitOptions(units: AliasUnit[] | undefined): AliasUnit[] {
  return [GRAM_UNIT, ...(units ?? []).filter((u) => u.name.trim().toLowerCase() !== GRAM_UNIT.name)];
}

/** Seçili birimdeki miktarı grama çevirir ("2 adet" × 50 = 100 g). */
export function toGrams(amount: number, unit: AliasUnit): number {
  return amount * unit.grams;
}

/** tr-TR sayı metnini sayıya çevirir. Geçersiz/boş girdide 0.
 *
 *  Uygulama kendi sayılarını tr-TR biçiminde gösterdiği için ("2.600 kcal",
 *  "1.013 kcal") kullanıcı gördüğünü aynen yazabiliyor. Bu yüzden nokta,
 *  bağlama göre binlik ayırıcı olarak da yorumlanır:
 *    "12,5"    -> 12.5    (virgül her zaman ondalık)
 *    "1.013,5" -> 1013.5  (virgül varsa noktalar binlik)
 *    "2.600"   -> 2600    (tek nokta + tam 3 hane = binlik)
 *    "1.234.5" -> 1234.5  (birden çok nokta: sonuncusu ondalık)
 *    "12.5"    -> 12.5    (3 haneli değil = ondalık)
 *    "0.500"   -> 0.5     (baştaki 0 binlik olamaz)
 */
export function parseNum(input: string): number {
  const s = String(input).trim();
  if (!s) return 0;

  let normalized: string;
  if (s.includes(",")) {
    // Virgül ondalık ayırıcıdır; noktalar binlik gruplamadır.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = s.split(".");
    if (parts.length === 1) {
      normalized = s;
    } else if (parts.length > 2) {
      // "1.234.567" gibi: son parça 3 haneliyse tamamı binlik, değilse ondalık.
      const last = parts[parts.length - 1];
      normalized = /^\d{3}$/.test(last)
        ? parts.join("")
        : parts.slice(0, -1).join("") + "." + last;
    } else {
      // Tek nokta: "2.600" binlik; "12.5" ve "0.500" ondalık.
      // parts[0] sıfırla başlıyorsa binlik gruplama olamaz — kimse bini "0.500" yazmaz.
      const isThousands = /^[1-9]\d*$/.test(parts[0]) && /^\d{3}$/.test(parts[1]);
      normalized = isThousands ? parts.join("") : s;
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** 1g altındaki gram girişini 1'e çeker (VisionReview'daki 1g minimumuyla tutarlı).
 *  "0.5g" → 0 kcal öğün üretiyor; bu da tüm yazma yolunda anlamsız bir kayıt.
 *  0 anlamlıdır (çekme değil), boş/geçersiz girdi olduğu gibi döner. */
export function clampMinGrams(raw: string): string {
  const n = parseNum(raw);
  return n > 0 && n < 1 ? "1" : raw;
}

/** 0,1 hassasiyet yeterli — kayan nokta artıklarını da temizler. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** serving_g gram için verilen besin değerlerini istenen grama lineer ölçekler. */
export function scaleNutrition(n: Nutrition, servingG: number, grams: number): Nutrition {
  if (!(servingG > 0)) return { ...ZERO_NUTRITION };
  const f = grams / servingG;
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const v = n[key];
    // Girilmemiş mikro besin ölçeklenmez, YOK kalır: 0 yazmak "0 mg sodyum"
    // gibi uydurma bir bilgi üretirdi.
    if (v === undefined) continue;
    out[key] = round1(v * f);
  }
  return makeNutrition(out);
}

/** Bir besin değerini sabit bir çarpanla (porsiyon çarpanı, ör. 0.25/1/1.5) ölçekler.
 *  `scaleNutrition`'ın aksine bir `servingG` tabanı gerektirmez — mevcut bir
 *  değeri doğrudan katlar. `NutritionSheet`'in "Porsiyon Miktarı" stepper'ı ve
 *  tarama onay ekranlarının porsiyon çarpanı bunu kullanır. Tanımsız mikro
 *  alanlar tanımsız kalır — `scaleNutrition`'daki "bilinmiyor ≠ sıfır" kuralı
 *  burada da geçerli. */
export function scaleNutritionByFactor(
  n: Nutrition,
  multiplier: number,
): Nutrition {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const v = n[key];
    if (v === undefined) continue;
    out[key] = round1(v * multiplier);
  }
  return makeNutrition(out);
}

/** `NutritionSheet`'in porsiyon çarpanı (±0,25 adımlı stepper) uygulanırken
 *  `sources[].qty`'yi de AYNI çarpanla ölçekler. Aksi halde çarpan ×2 yapılınca
 *  `computed` iki katına çıkar ama kaynak miktar eski değerde kalır — bu da
 *  `usualQuantity`'nin ("geçmişe dayalı miktar tahmini") temel aldığı veriyi
 *  bozar. `sources` yoksa/boşsa (elle girilmiş, kaynağı olmayan kalem)
 *  `undefined` döner. */
export function scaleMealSources(
  sources: MealSource[] | undefined,
  multiplier: number,
): MealSource[] | undefined {
  if (!sources || sources.length === 0) return undefined;
  return sources.map((s) => ({ ...s, qty: round1(s.qty * multiplier) }));
}

/** İki besin değerini toplar — `sumMeals` ve haftalık toplamların ortak tabanı.
 *
 *  Mikro alanlarda "bilinmiyor" ≠ "sıfır": bir mikro besin sonuçta yalnızca EN AZ
 *  BİR tarafta sayı varsa görünür, o toplamda eksik taraf 0 sayılır. Böylece
 *  "5 öğünün 3'ünde sodyum verisi var" durumu toplamı silmez ama uydurmaz da
 *  (kapsama sayısı için bkz. `coverage`, src/lib/days.ts). */
export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const av = a[key];
    const bv = b[key];
    if (av === undefined && bv === undefined) continue;
    out[key] = (av ?? 0) + (bv ?? 0);
  }
  return makeNutrition(out);
}

/** Malzemelerin besin değerlerini toplayıp toplam yemeğin besinini ve 100 g başına değerini hesaplar (Faz 7). */
export function calculateRecipeTotals(
  ingredients: { nutrition: Nutrition }[],
  totalG: number,
): { totalNutrition: Nutrition; per100g: Nutrition } {
  // ZERO_NUTRITION paylaşılan bir sabit ve dondurulmuş değil — kod tabanındaki
  // her kullanımı kopyalar. Ham referans döndürseydik, çağıran taraf dönen
  // nesneyi değiştirdiğinde uygulamanın TAMAMINDAKİ sıfır bozulurdu.
  let totalNutrition = { ...ZERO_NUTRITION };
  for (const ing of ingredients) {
    totalNutrition = addNutrition(totalNutrition, ing.nutrition);
  }
  const per100g =
    totalG > 0 ? scaleNutrition(totalNutrition, totalG, 100) : { ...ZERO_NUTRITION };
  return { totalNutrition, per100g };
}
