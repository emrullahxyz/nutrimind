// ============================================================================
// Nutrimind — saf besin hesapları (alias ölçekleme + tr-TR sayı ayrıştırma).
// ============================================================================
import { ZERO_NUTRITION } from "../types";
import type { Nutrition } from "../types";

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
      // Tek nokta: "2.600" binlik, "12.5" ondalık.
      normalized = /^\d+$/.test(parts[0]) && /^\d{3}$/.test(parts[1]) ? parts.join("") : s;
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** 0,1 hassasiyet yeterli — kayan nokta artıklarını da temizler. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** serving_g gram için verilen makroyu istenen grama lineer ölçekler. */
export function scaleNutrition(n: Nutrition, servingG: number, grams: number): Nutrition {
  if (!(servingG > 0)) return { ...ZERO_NUTRITION };
  const f = grams / servingG;
  return {
    kcal: round1(n.kcal * f),
    protein: round1(n.protein * f),
    carbs: round1(n.carbs * f),
    fat: round1(n.fat * f),
    fiber: round1(n.fiber * f),
  };
}
