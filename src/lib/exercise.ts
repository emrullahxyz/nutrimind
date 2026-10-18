import type { AppConfig, Exercise, ExerciseCategory } from "../types";
import { latestEntryBefore, parseBodyStats, parseWeightConfig } from "./weight";

const VALID_CATEGORIES: Set<ExerciseCategory> = new Set([
  "run",
  "weights",
  "walk",
  "swim",
  "cycle",
  "custom",
]);

/** Single exercise item parser with strict defensive checks */
export function parseExerciseItem(raw: unknown): Exercise | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;

  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!id || !name) return null;

  const categoryStr = typeof rec.category === "string" ? rec.category.trim() : "";
  const category: ExerciseCategory = VALID_CATEGORIES.has(categoryStr as ExerciseCategory)
    ? (categoryStr as ExerciseCategory)
    : "custom";

  const durationMinutes = rec.durationMinutes;
  if (
    typeof durationMinutes !== "number" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }

  const caloriesBurned = rec.caloriesBurned;
  if (
    typeof caloriesBurned !== "number" ||
    !Number.isFinite(caloriesBurned) ||
    caloriesBurned < 0
  ) {
    return null;
  }

  const loggedAt =
    typeof rec.loggedAt === "string" && rec.loggedAt.trim().length > 0
      ? rec.loggedAt.trim()
      : undefined;

  return {
    id,
    name,
    category,
    durationMinutes,
    caloriesBurned,
    ...(loggedAt ? { loggedAt } : {}),
  };
}

// ---------------------------------------------------------------------------
// TEK config anahtarı: `exercise` → `{ entries: { "2026-08-05": Exercise[] } }`
//
// Eskiden gün başına ayrı bir anahtar kullanılıyordu (`exercise_2026-08-05`).
// İKİ sorun vardı:
//   1. `server/index.js`'in CONFIG_KEY_PATTERN'i (`/^[a-z][a-z0-9_]{0,31}$/`)
//      TİRE kabul etmiyor; ISO tarih tire içerdiği için her yazma 400 dönüyordu
//      — yani egzersiz kaydı bugüne kadar HİÇ kalıcı olmadı. (Canlı veritabanında
//      tek bir `exercise_*` satırı yok; bu da bunu doğruluyor.)
//   2. Gün başına anahtar, config blob'unu sonsuza kadar büyütürdü; `GET /api/data`
//      onu her açılışta gönderiyor.
// `weight` özelliği zaten bu `{entries}` desenini kullanıyor — aynısı izlendi.
// Göç gerekmedi: taşınacak veri yoktu.
// ---------------------------------------------------------------------------

/** Backend'in anahtar deseni: `/^[a-z][a-z0-9_]{0,31}$/` — tire YOK. */
export const EXERCISE_CONFIG_KEY = "exercise";

export type ExerciseEntries = Record<string, Exercise[]>;

/** Tüm günleri savunmacı biçimde ayrıştırır; bozuk kayıtlar sessizce düşer. */
export function parseExerciseEntries(raw: unknown): ExerciseEntries {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const rec = (raw as Record<string, unknown>).entries;
  if (typeof rec !== "object" || rec === null || Array.isArray(rec)) return {};

  const out: ExerciseEntries = {};
  for (const [date, list] of Object.entries(rec as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const parsed = list.map(parseExerciseItem).filter((x): x is Exercise => x !== null);
    if (parsed.length > 0) out[date] = parsed;
  }
  return out;
}

export function exercisesFor(entries: ExerciseEntries, date: string): Exercise[] {
  return entries[date] ?? [];
}

/** Bir günün listesini değiştirir. Boş liste = o günü tamamen düşür
 *  (config blob'unda boş dizi biriktirmemek için). Girdi mutasyona uğramaz. */
export function withExercises(
  entries: ExerciseEntries,
  date: string,
  list: Exercise[],
): ExerciseEntries {
  const next = { ...entries };
  if (list.length === 0) delete next[date];
  else next[date] = list;
  return next;
}

/** Tek günün yakılan kalori toplamı. `DayView` ile `ExerciseModal` AYNI
 *  config anahtarını okumak ZORUNDA: eskiden `DayView` eski
 *  `exercise_${date}` anahtarını okuyordu, `ExerciseModal` ise tek
 *  `exercise` anahtarına yazıyordu — göç yarı kalmıştı ve yakılan kalori
 *  hedefe hiç yansımıyordu (burnedKcal daima 0). */
export function burnedKcalFor(rawConfig: unknown, date: string): number {
  return exercisesFor(parseExerciseEntries(rawConfig), date).reduce(
    (acc, ex) => acc + ex.caloriesBurned,
    0,
  );
}

// ---------------------------------------------------------------------------
// KALORİ HESABI — `caloriesBurned` kullanıcının serbestçe YAZDIĞI sayıydı.
// Canlı veride aynı aktivite aynı süreyle 250/200/200 kcal kaydedilmiş: kalıcı
// ve tekrarlanabilir bir sayı yok, ekran ne yazıldıysa onu gösteriyordu.
//
// Yerine: aktivite `category` + kilo + süre. Üçü de hesapta KAYITTAN okunur,
// kullanıcı ya da hesap yapmıyor — geçmiş kayıtların kalorisi DONUŞTURULMUŞ
// gerçek kalır (yeniden hesaplanmaz).
// ---------------------------------------------------------------------------

/** Egzersiz aktivitelerinin MET değerleri (Compendium of Physical Activities,
 *  orta şiddet). `category` bir `ExerciseCategory` üyesidir — katalog
 *  egzersizi `custom`'a düşerse 4.0 kullanılır (sınıflandırılamayan aktivite). */
const MET_BY_CATEGORY: Record<ExerciseCategory, number> = {
  run: 8.3,
  walk: 3.5,
  weights: 5.0,
  swim: 8.3,
  cycle: 7.5,
  custom: 4.0,
};

export function metFor(category: ExerciseCategory): number {
  return MET_BY_CATEGORY[category] ?? MET_BY_CATEGORY.custom;
}

/** Kalori hesabında kullanılacak kilo.
 *
 *  ÖNCELİK: `date`'ye ait/en yakın ÖLÇÜM → profil kilosu → `null`.
 *  Ölçüm önce gelir çünkü kullanıcı kilosunu ölçüm geçmişinden günceller;
 *  profildeki değer bayat kalabilir.
 *
 *  TARİH-BAĞIMSIZ OLAMAZ (ölçülen hata): modal `date` prop'uyla AÇILIR ve
 *  `DayView` GEÇMİŞ bir gün için de açabiliyor. `latestEntry` (bugünün
 *  son ölçümü) kullanılsaydı 1 Ekim'de 10 Ekim'de kayıt yapılırken 10
 *  Ekim'in kilosu 1 Ekim'in tarihine yazılırdı — geçmişe bugünün
 *  ölçümünü sızdıran hesap. `latestEntryBefore` (`weight.ts`) tam bu iş için
 *  yazılmıştı; `date` verilmediğinde davranış `latestEntry` ile AYNIDIR
 *  (`""` altındaki her tarih için en büyük tarih = en son ölçüm).
 *
 *  Profil kilosu tarih-bağımsız olduğu için düşüş yolunda da aynı kalır:
 *  geçmiş bir günde profil kilosu elde edilebiliyorsa kullanılır, yoksa
 *  `null` döner ve çağıran SORAR (L21: varsayılan kilo uydurulmaz). */
export function exerciseWeight(config: AppConfig, date: string): number | null {
  const entries = parseWeightConfig(config).entries;
  const onDate = date in entries ? entries[date] : null;
  const before = latestEntryBefore(entries, date);
  const measured =
    typeof onDate === "number" && Number.isFinite(onDate) && onDate > 0
      ? onDate
      : before !== null && Number.isFinite(before.kg) && before.kg > 0
        ? before.kg
        : null;
  if (measured !== null) return measured;
  const profile = parseBodyStats(config).weightKg;
  if (typeof profile === "number" && Number.isFinite(profile) && profile > 0) return profile;
  return null;
}

/** kcal = MET × 3,5 × kg / 200 × dakika (ACSM: 3,5 ml/kg/dk oksijen tüketimi).
 *
 *  NEDEN kilo tek başına yeterli: formül cinsiyet ve aktivite seviyesi
 *  gerektirmiyor. Bu projede `config.profile`'a cinsiyet YAZILIYOR ama
 *  Ayarlar'dan DÜZENLENEMİYOR (`SettingsSheet.handleSaveProfile` yalnız
 *  name/age/weightKg/heightCm/targetWeightKg yazıyor) — ona dayanan bir
 *  formül bayat veriyle hesap yapardı. Kilo ise düzenlenebilir.
 *
 *  `met` GEÇİLİRSE O KULLANILIR: kullanıcının katalog girdisi (`CatalogEntry.met`)
 *  kategori tablosundan daha güvenilir bir tahmindir — kullanıcı o işin
 *  MET'sini kendi bildi. Olmadığında (`undefined`) `metFor(category)` devreye
 *  girer; geçersiz/bozuk `met` de TABLODA kalır (L21: uydurma yok). */
export function burnedKcal(
  category: ExerciseCategory,
  weightKg: number,
  minutes: number,
  met?: number,
): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const metValue =
    typeof met === "number" && Number.isFinite(met) && met > 0 ? met : metFor(category);
  const kcal = Math.round(((metValue * 3.5 * weightKg) / 200) * minutes);
  // Aşırı büyük süre/kilo taşırırsa `Infinity` dönebilir; `JSON.stringify(Infinity)`
  // `null` üretir ve sunucu kaydı sessizce reddeder (kullanıcı kaydetti sanır).
  // Sınır 0'a düşer — çağıran katman (ExerciseModal) zaten girdiyi sınırlar.
  return Number.isFinite(kcal) ? kcal : 0;
}

// ---------------------------------------------------------------------------
// Kullanıcının egzersiz KATALOĞU — Ayarlar → Egzersiz Kütüphanesi'nden yönetilir.
//
// GÖMÜLÜ 13 EĞZERSİZ BUNUN DIŞINDA VE KODDA YAŞAR: 13 i18n anahtarı + 13
// `met` değeri. Config'e ASLA yazılmaz. Yazan sistem hesabın diliyle birlikte
// adları da saklıyordu ("Ağırlık Antrenmanı" → "Trening siłowy"); katalog
// yalnız SAYI taşıdığı için o sınıf hata yapısal olarak imkânsız.
//
// `name` DÜZ METİNDİR, çeviri değil: kullanıcının yazdığı kelime olduğu gibi
// saklanır ve gösterilir.
// ---------------------------------------------------------------------------
export interface CatalogEntry {
  id: string;
  name: string;
  category: ExerciseCategory;
  met: number;
}

function parseCatalogItem(raw: unknown): CatalogEntry | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!id || !name) return null;
  const categoryStr = typeof rec.category === "string" ? rec.category.trim() : "";
  const category = VALID_CATEGORIES.has(categoryStr as ExerciseCategory)
    ? (categoryStr as ExerciseCategory)
    : "custom";
  const rawMet = rec.met;
  const met = typeof rawMet === "number" && Number.isFinite(rawMet) && rawMet > 0 ? rawMet : null;
  if (met === null) return null;
  return { id, name, category, met };
}

export function parseCatalog(raw: unknown): CatalogEntry[] {
  const rec = (raw as { catalog?: unknown })?.catalog;
  if (!Array.isArray(rec)) return [];
  const out: CatalogEntry[] = [];
  for (const item of rec) {
    const parsed = parseCatalogItem(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** `config.exercise.catalog` yazar — **`entries` (günlük kayıtlar) KORUNUR**.
 *  Katalog yazmak geçmiş egzersiz kayıtlarını silmemelidir; config nesnesi
 *  spread ile kopyalanır, `entries` dokunulmadan taşınır. */
export function withCatalog(config: AppConfig, entries: CatalogEntry[]): AppConfig {
  const prev = config.exercise;
  const base = typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {};
  return { ...config, exercise: { ...base, catalog: entries } };
}

export function newCatalogId(): string {
  return `ec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// GÖMÜLÜ ŞABLONLARIN GİZLENMESİ
//
// Kullanıcı hızlı şablonlardan kullanmadıklarını kaldırabilir ve istediğinde
// geri getirebilir. Gömülü 13 preset KODDA yaşar (bkz. yukarıdaki not); burada
// yalnızca KULLANICININ GİZLEDİĞİ nameKey'lerin listesi tutulur — preset'in
// kendisi asla config'e yazılmaz, yalnız "şu anahtarı gösterme" bilgisi.
//
// Anahtarlar `exercise.preset*` i18n anahtarıdır; hesabın diliyle birlikte
// saklanmaz (dil değişince liste bozulmaz — katalog adlarındaki sınıf hatanın
// aynısını yapısal olarak engeller).
// ---------------------------------------------------------------------------
export function parseHiddenPresets(raw: unknown): string[] {
  const rec = (raw as { hiddenPresets?: unknown })?.hiddenPresets;
  if (!Array.isArray(rec)) return [];
  const out: string[] = [];
  for (const item of rec) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
  }
  return out;
}
