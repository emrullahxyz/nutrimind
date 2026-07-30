// ============================================================================
// Nutrimind — besin kaydı (nutrient registry).
//
// Besinlerin TEK doğruluk kaynağı. Eskiden 5 besin anahtarı kodun ~15 ayrı
// yerinde elle sayılıyordu (tipler, formlar, toplama, ölçekleme, barlar, donut,
// özet satırları); artık hepsi bu dosyayı dolaşıyor. Yeni besin eklemek =
// buraya bir satır eklemek.
//
// İKİ ayrı liste var, karıştırılmamalı:
//   • NUTRIENT_KEYS — `Nutrition` tipinin TÜM anahtarları. Matematik katmanı
//     (fill / scaleNutrition / addNutrition) bunu dolaşır ki arayüze henüz
//     girmemiş bir mikro besin verisi sessizce düşmesin.
//   • NUTRIENTS — arayüze GİRMİŞ besinlerin tanımları (etiket, renk, birim…).
//     Formlar, barlar, donut ve özet satırları bunu dolaşır.
//
// Faz 0'da NUTRIENTS tam olarak mevcut 5 besindir; mikrolar (şeker, doymuş yağ,
// sodyum) tipte ve anahtar listesinde hazır ama Faz 2'de kaydedilecek.
// ============================================================================
import type { Nutrition } from "../types";

/** Çekirdek besinler — `Nutrition` içinde her zaman zorunlu, her zaman sayı. */
export type CoreNutrientKey = "kcal" | "protein" | "carbs" | "fat" | "fiber";

/** Mikro besinler — opsiyonel: girilmemişse "bilinmiyor" (undefined) kalır. */
export type MicroNutrientKey = "sugar" | "satFat" | "sodium";

export type NutrientKey = CoreNutrientKey | MicroNutrientKey;

/** Bir besinin arayüze girmesi için gereken her şey. */
export interface NutrientDef {
  key: NutrientKey;
  /** Form etiketi / bar başlığı: "Karbonhidrat". */
  label: string;
  /** Daralan alanlarda (donut efsanesi) kullanılan kısa etiket; yoksa `label`. */
  compactLabel?: string;
  /** Mono özet satırlarının öneki: "P… · K… · Y… · L…". */
  short: string;
  unit: "kcal" | "g" | "mg";
  group: "energy" | "macro" | "micro";
  /** Hedefe ulaşılacak mı (protein, lif) yoksa aşılmayacak mı (sodyum, şeker). */
  direction: "target" | "limit";
  /** Donut payı ağırlığı — yalnızca kaloriye çevrilebilen makrolarda. */
  kcalPerG?: number;
  /** Doğal gösterim hassasiyeti. */
  decimals: number;
  /** SVG stroke/fill ve gradyan için ham renk (className'de ASLA kullanılmaz). */
  hex: string;
  /** TAM Tailwind sınıf adları. Tailwind JIT yalnızca kaynaktaki DÜZ metinleri
   *  görür: `bg-${...}` gibi birleştirilmiş sınıf ÜRETİLMEZ ve öğe boyasız
   *  kalır. Bu yüzden sınıflar burada eksiksiz yazılır. */
  classes: { text: string; bg: string; track: string };
}

/** Tip birleşimi çalışma zamanında dolaşılamadığı için anahtarlar ayrıca
 *  listelenmek zorunda. Liste `Record<K, true>` üzerinden üretiliyor: tipe yeni
 *  bir anahtar eklenirse derleyici burayı güncellemeye zorlar. */
const keysOf = <K extends string>(set: Record<K, true>): readonly K[] => Object.keys(set) as K[];

/** `Nutrition`'da zorunlu olan 5 anahtar. */
export const CORE_KEYS: readonly CoreNutrientKey[] = keysOf<CoreNutrientKey>({
  kcal: true,
  protein: true,
  carbs: true,
  fat: true,
  fiber: true,
});

const MICRO_KEYS: readonly MicroNutrientKey[] = keysOf<MicroNutrientKey>({
  sugar: true,
  satFat: true,
  sodium: true,
});

/** `Nutrition`'ın tüm anahtarları — matematik katmanı bunu dolaşır. */
export const NUTRIENT_KEYS: readonly NutrientKey[] = [...CORE_KEYS, ...MICRO_KEYS];

/** Arayüze girmiş besinler. Sıra formdaki ve barlardaki sırayı belirler.
 *  Renk sınıfları ve hex değerleri tailwind.config.js token'larıyla birebir:
 *  domain anahtarı `carbs` ↔ token `carb`, `fiber` ↔ token `memory` (mor, aynı
 *  zamanda "hafıza" marka rengi) uyuşmazlığı tam olarak burada eşlenir. */
export const NUTRIENTS: readonly NutrientDef[] = [
  {
    key: "kcal",
    label: "Kalori",
    // Özet satırlarında kcal `formatKcal` ile yazılır; `short` bütünlük için.
    short: "kcal",
    unit: "kcal",
    group: "energy",
    direction: "target",
    decimals: 0,
    hex: "#34d399",
    classes: { text: "text-accent", bg: "bg-accent", track: "bg-accent/[0.15]" },
  },
  {
    key: "protein",
    label: "Protein",
    short: "P",
    unit: "g",
    group: "macro",
    direction: "target",
    kcalPerG: 4,
    decimals: 1,
    hex: "#34d399",
    classes: { text: "text-protein", bg: "bg-protein", track: "bg-protein/[0.15]" },
  },
  {
    key: "carbs",
    label: "Karbonhidrat",
    compactLabel: "Karb",
    short: "K",
    unit: "g",
    group: "macro",
    direction: "target",
    kcalPerG: 4,
    decimals: 1,
    hex: "#fb923c",
    classes: { text: "text-carb", bg: "bg-carb", track: "bg-carb/[0.15]" },
  },
  {
    key: "fat",
    label: "Yağ",
    short: "Y",
    unit: "g",
    group: "macro",
    direction: "target",
    kcalPerG: 9,
    decimals: 1,
    hex: "#fbbf24",
    classes: { text: "text-fat", bg: "bg-fat", track: "bg-fat/[0.15]" },
  },
  {
    key: "fiber",
    label: "Lif",
    short: "L",
    unit: "g",
    group: "macro",
    direction: "target",
    decimals: 1,
    hex: "#a78bfa",
    classes: { text: "text-memory", bg: "bg-memory", track: "bg-memory/[0.15]" },
  },
];

/** Makro barları/satırları: kalori dışındaki kayıtlı makrolar. */
export const MACROS: readonly NutrientDef[] = NUTRIENTS.filter(
  (n) => n.group !== "micro" && n.key !== "kcal",
);

/** Mikro besinler — Faz 0'da boş, Faz 2'de dolacak. */
export const MICROS: readonly NutrientDef[] = NUTRIENTS.filter((n) => n.group === "micro");

const BY_KEY = new Map<NutrientKey, NutrientDef>(NUTRIENTS.map((n) => [n.key, n]));

/** Kayıtlı besin tanımı. Kayıtta olmayan anahtar (henüz eklenmemiş mikro) çağrı
 *  hatasıdır — sessizce boş tanım dönmek yerine patlar. */
export function nutrientOf(key: NutrientKey): NutrientDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Kayıtlı olmayan besin anahtarı: ${key}`);
  return def;
}

/** Çekirdek alanların hepsi zorunlu olduğu için ayrı bir tip. */
export type CoreNutrition = { [K in CoreNutrientKey]: number };

/** Çekirdek alanları 0'a kuran TAZE nesne.
 *  `{} as CoreNutrition` tek kaçamak: döngü CORE_KEYS'in tamamını dolaştığı için
 *  nesne dönüş anında eksiksizdir, CORE_KEYS'in eksiksizliğini de `keysOf`
 *  garantiliyor. (`Record<string, number>` `Nutrition`'ı karşılamaz.) */
export function zeroCore(): CoreNutrition {
  const out = {} as CoreNutrition;
  for (const key of CORE_KEYS) out[key] = 0;
  return out;
}

/** Kısmi değerlerden `Nutrition` kurar: çekirdek alan verilmediyse 0, mikro alan
 *  verilmediyse HİÇ YAZILMAZ — "bilinmiyor" ≠ "sıfır" (girilmemiş sodyumu
 *  "0 mg" göstermek yanlış bilgi olur).
 *  DİKKAT: `values` içine `undefined` DEĞER konmamalı; spread onu anahtar olarak
 *  yazar ve "alan yok" ile "alan var, değeri undefined" ayrımı bozulur. */
export function makeNutrition(values: Partial<Record<NutrientKey, number>>): Nutrition {
  return { ...zeroCore(), ...values };
}
