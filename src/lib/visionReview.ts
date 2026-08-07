// ============================================================================
// Nutrimind — Etiket/Yemek tarama onay ekranının (VisionReview) saf mantığı.
//
// `ScanSheet`'in barkod onay ekranı zaten iyi çalışan bir desen: tara → onayla
// → hem hafızaya yaz hem (istenirse) bugüne işle. Bu dosya, Gemini'den dönen
// `AIParseItem[]`'i (gram/porsiyon TABANI OLMAYAN, yalnızca ad+makro) aynı
// akışa sokmak için gereken iki saf hesabı taşır — bileşenden ayrı olmalarının
// sebebi test edilebilirlik (bkz. `visionReview.test.ts`).
// ============================================================================
import { ZERO_NUTRITION } from "../types";
import type { Nutrition } from "../types";
import { addNutrition, scaleNutritionByFactor } from "./nutrition";

/** Yemek modunda dahil edilen (kaldırılmamış) kalemlerin NİHAİ besin
 *  değerlerini (porsiyon çarpanı + elle düzenleme uygulanmış hâli) TEK bir
 *  birleşik kalemde toplar — `addNutrition`'ın foldu. "Öğüne ekle" tek bir
 *  `MealPayload` üretir, kalem başına ayrı kayıt YOK (v1'de kalem-bazlı
 *  hafızaya kaydetme yok — kullanıcı onayladı). */
export function combineVisionItems(nutritions: Nutrition[]): Nutrition {
  return nutritions.reduce((acc, n) => addNutrition(acc, n), { ...ZERO_NUTRITION });
}

/** Etiket modunda "…hafızaya" seçilince alias'a yazılacak "1 porsiyon" (sentetik
 *  100 g) tabanını hesaplar. Kullanıcının onayladığı NİHAİ değer (porsiyon
 *  çarpanı + elle düzenleme uygulanmış) her zaman TÜKETİLEN miktarı temsil
 *  eder; alias'a yazılacak taban ise 1 porsiyonluk değer olmalı — aksi halde
 *  ileride bu alias `scaleNutrition(alias.nutrition, 100, ...)` ile tekrar
 *  ölçeklendiğinde tüketilen miktar ikinci kez katlanırdı. Aynı çarpanla
 *  GERİYE bölerek 1x'e normalize ediyoruz (`scaleNutritionByFactor` simetrik
 *  olduğu için ×(1/multiplier) yeterli). */
export function visionAliasUnitNutrition(finalNutrition: Nutrition, multiplier: number): Nutrition {
  if (!(multiplier > 0)) return finalNutrition;
  return scaleNutritionByFactor(finalNutrition, 1 / multiplier);
}

/** Onay ekranının porsiyon stepper'ı — `NutritionSheet`'in ±0,25 adımlı
 *  `handleStep`'iyle AYNI taban kuralı (0,25 altına inemez). */
export function stepVisionMultiplier(current: number, delta: number): number {
  return Math.max(0.25, Number((current + delta).toFixed(2)));
}
