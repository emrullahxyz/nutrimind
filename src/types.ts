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

export interface MealSource {
  aliasId: string;
  /** Kullanıcının yazdığı miktar (gram DEĞİL — birim cinsinden). */
  qty: number;
  /** Birim adı; gram için "g". */
  unit: string;
}

/** Bir öğün kalemi (gösterim). */
export interface MealItem {
  id: string;
  label: string;
  computed: Nutrition;
  sources?: MealSource[];
}

/** Backend'e gönderilen öğün biçimi (days[date] dizisindeki kayıt). */
export interface MealPayload {
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
}

/** Faz 2: Gemini'nin serbest metinden ayrıştırdığı tek bir öğe. */
export interface AIParseItem {
  name: string;
  nutrition: Nutrition;
  /** 0-1 arası, sunucunun ne kadar emin olduğu. Yoksa Gemini vermemiştir. */
  confidence?: number;
  /** Sunucu tarafında `NUTRIMIND_CONFIDENCE_THRESHOLD` altında hesaplanır. */
  needsReview?: boolean;
}

export interface AIParseResult {
  items: AIParseItem[];
}

export interface AliasUnit {
  /** Kullanıcının gördüğü ad: "adet", "kase", "dilim", "ölçek". */
  name: string;
  /** Bu birimin 1 tanesinin kaç gram olduğu. */
  grams: number;
}

/** Tarifte bir malzeme. */
export interface RecipeIngredient {
  /** Hafızadaki besinden geldiyse id'si; elle girildiyse yok. */
  aliasId?: string;
  /** Görüntülenecek ad (alias silinse bile tarif okunabilir kalsın). */
  name: string;
  qty: number;
  unit: string;
  /** Bu malzemenin TOPLAM besin değeri (miktarına göre ölçeklenmiş hâli). */
  nutrition: Nutrition;
}

export interface Recipe {
  ingredients: RecipeIngredient[];
  /** Pişmiş toplam ağırlık (g). Hesabın paydası. */
  totalG: number;
}

/** Öğrenilmiş alias: kullanıcının ifadeleri -> belirli besin + makro (serving_g gram için). */
export interface Alias {
  id: string;
  triggers: string[];
  name: string;
  brand: string | null;
  serving_g: number;
  nutrition: Nutrition;
  /** Özel birimler — Faz 5. Opsiyonel. */
  units?: AliasUnit[];
  /** Ambalaj barkodu — Faz 4. Yalnızca Open Food Facts'ten gelen besinlerde
   *  dolu; elle girilen besinlerde YOK (boş metin değil, alan hiç olmaz). */
  barcode?: string;
  /** Kaynak kayıttaki ürün kimliği. OFF'ta barkodla aynı sayıdır ama ayrı bir
   *  alan: ileride başka bir katalog (ör. USDA) eklenirse barkodu olmayan bir
   *  kaydın kimliği yine taşınabilsin. */
  off_id?: string;
  /** Tarif detayı — Faz 7. Opsiyonel. */
  recipe?: Recipe;
}

/** Bir gün tipinin hedefleri — "Antrenman", "Dinlenme", "Varsayılan"… */
export interface GoalProfile {
  id: string;
  name: string;
  nutrition: Nutrition;
}

/** Hedef yapılandırması (v2) — Faz 8.
 *
 *  Backend `PUT /api/goals` gövdesini OLDUĞU GİBİ sakladığı için bu yapı hiçbir
 *  backend değişikliği istemiyor; doğrulaması da Faz 3a'da hazırlandı.
 *  Eski (v1) hedef tek bir düz `Nutrition` nesnesiydi; `parseGoals` onu tek
 *  profilli bir v2 yapıya KAYIPSIZ sarar (bkz. `src/lib/api.ts`).
 *
 *  Çözümleme sırası (bkz. `effectiveGoal`): overrides → weekday → default. */
export interface GoalConfig {
  version: 2;
  /** En az bir profil — boş dizi backend tarafından da reddedilir. */
  profiles: GoalProfile[];
  defaultProfileId: string;
  /** 0=Pazar … 6=Cumartesi → profileId. Haftalık şablon; SAF TÜRETME olduğu
   *  için geçmiş günlere de uygulanır, geçmişe veri yazılmaz. */
  weekday: Record<number, string>;
  /** "2026-07-30" → profileId. Tek günlük istisna; yalnızca kullanıcı o güne
   *  dokunduğunda yazılır. */
  overrides: Record<string, string>;
}

/** Sıfır besin: yalnızca çekirdek 5 alan, hepsi 0. Mikro alanlar bilinçli olarak
 *  YOK — "hiç veri girilmedi" ile "0 mg sodyum" aynı şey değil. */
export const ZERO_NUTRITION: Nutrition = zeroCore();

/** Genel yapılandırma deposu (Faz 2a) — anahtar başına serbest JSON nesnesi.
 *  Su/takviye/şablon gibi özellikler kendi anahtarında saklanır (bkz. `server/index.js`
 *  `/api/config/:key`). Ayrılmış anahtarlar (`goals`, `seeded`) burada YER ALMAZ. */
export type AppConfig = Record<string, Record<string, unknown>>;

