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

/** Porsiyon çarpanının alt sınırı. Taban 100g olduğu için 0.01 = 1g — 1g'nin
 *  altı anlamsız (0g = sıfır kalori), negatif de olmaz. Stepper ve gramaj
 *  girişi aynı sınırı kullansın diye tek doğruluk kaynağı. */
export const MIN_VISION_MULTIPLIER = 0.01;

/** Gramaj girişinden çarpanı hesaplar: 1g = 0.01, asla 0/negatif değil, asla
 *  25g'ye (0.25) yapışmaz. `VisionReviewRow`'un blur commit kuralı. */
export function multiplierFromGrams(grams: number): number {
  return Math.max(MIN_VISION_MULTIPLIER, Number((grams / 100).toFixed(2)));
}

/** Onay ekranının porsiyon stepper'ı — `NutritionSheet`'in ±0,25 adımlı
 *  `handleStep`'iyle aynı adım deseninde ama tabanı `MIN_VISION_MULTIPLIER`
 *  (1g): 0.25'in altına inebilir, eksiye/0'a düşmez. */
export function stepVisionMultiplier(current: number, delta: number): number {
  return Math.max(MIN_VISION_MULTIPLIER, Number((current + delta).toFixed(2)));
}
