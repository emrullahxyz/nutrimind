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

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snack";

export type ExerciseCategory = "run" | "weights" | "walk" | "swim" | "cycle" | "custom";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  durationMinutes: number;
  caloriesBurned: number;
  loggedAt?: string;
}

/** Bir öğün kalemi (gösterim). */
export interface MealItem {
  id: string;
  label: string;
  computed: Nutrition;
  sources?: MealSource[];
  loggedAt?: string;
  category?: MealCategory;
  /** Hangi şablon uygulanarak yazıldı — şablon kullanım sayacının kaynağı.
   *  Yoksa sayaç 0 sayılır (elle eklenen öğün, eski kayıt). */
  templateId?: string;
  /** Hafızaya bağlı olmayan kalemin gramajı (g). `sources` varsa yazılmaz —
   *  miktar zaten kaynakta. */
  grams?: number;
}

/** Backend'e gönderilen öğün biçimi (days[date] dizisindeki kayıt). */
export interface MealPayload {
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
  loggedAt?: string;
  category?: MealCategory;
  /** Şablondan uygulandıysa kaynak şablonun id'si. Şablon kullanım indeksi
   *  (`lib/templates.ts`) gün verisinden TÜRETİLİR — config'te sayaç tutulmaz,
   *  çünkü config yazmak offline'ta kapalıdır (docs/operations/offline.md).
   *  Bu alan dört uçta da taşınmalıdır: `api.ts` parse, `days.ts` `toPayload`,
   *  `offlineProjection.ts` `applyOperation`. Biri unutursa sayaç sessizce 0. */
  templateId?: string;
  /** Hafızaya bağlı olmayan kalemin gramajı. `sources` YOKSA yazılır —
   *  `sources` varsa miktar zaten `sources[].qty` içindedir ve iki kopyadan
   *  biri eskir. `TemplateItem.grams`'ın karşılığıdır: şablondan uygulanan
   *  alias'sız kalem gramajını bu alan olmadan kaybediyordu. */
  grams?: number;
}

/** Faz 2: AI servisinin (Gemini veya NVIDIA NIM) serbest metin veya fotoğraftan ayrıştırdığı tek bir öğe. */
export interface AIParseItem {
  name: string;
  nutrition: Nutrition;
  /** 0-1 arası, sunucunun ne kadar emin olduğu. Yoksa AI servisi vermemiştir. */
  confidence?: number;
  /** Sunucu tarafında `NUTRIMIND_CONFIDENCE_THRESHOLD` altında hesaplanır. */
  needsReview?: boolean;
  /** Besin değerlerinin dayandığı miktar, gram: etikette "100 g başına"
   *  yazıyorsa 100, "30 g'lik 1 porsiyon" yazıyorsa 30. YALNIZCA etiket
   *  okunduğunda anlamlıdır; metin ve yemek fotoğrafı akışlarında gelmez.
   *  `undefined` = miktar bilinmiyor (0 DEĞİL — 0, "miktarım sıfır" demek
   *  olurdu). `DraftLine` tarafında `grams`/`qty` bu değere oturur, yoksa
   *  satır miktarı bilinmeyen korunmuş kalem olarak durur. */
  baseAmount?: number;
}

export interface AIParseResult {
  items: AIParseItem[];
  healthNote?: string;
}

/**
 * Görsel analizin hangi istemle çalışacağı — sunucudaki prompt seçimiyle birebir
 * eşleşir (`server/ai.js`):
 *   `food_photo`  → tabaktaki yemeği tahmin et, kullanıcının besin hafızasını da gör
 *   `food_label`  → ambalajdaki besin değerleri tablosunu BİREBİR oku (hafıza gönderilmez)
 * Kaynağın kamera mı galeri mi olduğu farketmez; ikisi de aynı iki istemden birine düşer.
 */
export type VisionMode = "food_photo" | "food_label";

/** Oturum açmış kullanıcı. `/api/auth/me`'nin döndürdüğü ALAN KÜMESİNİN aynısı —
 *  bilerek dar: parola karması, oturum kimliği ve `google_sub` istemciye HİÇ
 *  gitmiyor. */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

/** Sunucunun bildirdiği kimlik yetenekleri; giriş ekranı neyi göstereceğine
 *  buna bakarak karar veriyor (kayıt açık mı, Google yapılandırılmış mı). */
export interface AuthCapabilities {
  signupAllowed: boolean;
  googleEnabled: boolean;
  /** "İzinli E-postalar" listesini yönetebilen hesap (sahip). */
  isAdmin: boolean;
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
  /** Yeni öğün girişinde önceden seçilecek birimin adı. Yoksa yerleşik gram birimi kullanılır. */
  defaultUnit?: string;
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

