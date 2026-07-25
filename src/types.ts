// ============================================================================
// Nutrimind — sade domain tipleri.
// ============================================================================

/** Makro besin değerleri (bir öğün ya da bir günün toplamı). */
export interface Nutrition {
  kcal: number;
  protein: number; // g
  carbs: number; // g  (karbonhidrat)
  fat: number; // g  (yağ)
  fiber: number; // g  (lif)
}

/** Bir öğün kalemi (gösterim). */
export interface MealItem {
  id: string;
  label: string;
  computed: Nutrition;
}

/** Backend'e gönderilen öğün biçimi (days[date] dizisindeki kayıt). */
export interface MealPayload {
  name: string;
  nutrition: Nutrition;
}

/** Öğrenilmiş alias: kullanıcının ifadeleri -> belirli besin + makro (serving_g gram için). */
export interface Alias {
  id: string;
  triggers: string[];
  name: string;
  brand: string | null;
  serving_g: number;
  nutrition: Nutrition;
}

export const ZERO_NUTRITION: Nutrition = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
};
