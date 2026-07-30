// ============================================================================
// Nutrimind — sade domain tipleri.
// ============================================================================
import { zeroCore } from "./lib/nutrients";

/** Besin değerleri (bir öğün ya da bir günün toplamı).
 *
 *  Çekirdek 5 alan ZORUNLU: her zaman sayı, eksikse 0. Mikro alanlar OPSİYONEL:
 *  `undefined` = "bilinmiyor" ve öyle kalmalı — ev yapımı bir öğüne sodyum
 *  girmediysen "0 mg" göstermek yalan olur. Alanların anlamı ve gösterimi
 *  `src/lib/nutrients.ts` kaydında tanımlıdır. */
export interface Nutrition {
  kcal: number;
  protein: number; // g
  carbs: number; // g  (karbonhidrat)
  fat: number; // g  (yağ)
  fiber: number; // g  (lif)
  sugar?: number; // g  (şeker)          — Faz 2
  satFat?: number; // g  (doymuş yağ)     — Faz 2
  sodium?: number; // mg (sodyum)         — Faz 2
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

/** Sıfır besin: yalnızca çekirdek 5 alan, hepsi 0. Mikro alanlar bilinçli olarak
 *  YOK — "hiç veri girilmedi" ile "0 mg sodyum" aynı şey değil. */
export const ZERO_NUTRITION: Nutrition = zeroCore();
