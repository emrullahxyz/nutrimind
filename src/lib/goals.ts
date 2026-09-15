// ============================================================================
// Nutrimind — gün-tipli hedefler (Faz 8).
//
// Tek global hedef yerine PROFİLLER var: "Antrenman", "Dinlenme"… Bir günün
// hedefi üç kademede çözülür:
//
//     overrides["2026-07-30"]  →  weekday[haftanın günü]  →  defaultProfileId
//
// İKİ TASARIM KURALI:
//
//   1. HİÇBİR ADIM PATLAMAZ. Backend, `weekday`/`overrides` değerlerinin var
//      olan bir profili göstermesini BİLEREK zorunlu tutmuyor (yarım kalmış bir
//      düzenleme kaydetmeyi kilitlemesin diye). Dolayısıyla silinmiş bir profile
//      işaret eden atama normaldir ve istemci onu sessizce varsayılana düşürür.
//   2. GEÇMİŞE VERİ YAZILMAZ. Haftalık şablon saf bir türetmedir, geçmiş günlere
//      de uygulanır; kalıcı olarak saklanan tek şey kullanıcının elle dokunduğu
//      `overrides` kayıtlarıdır.
// ============================================================================
import type { TFunction } from "i18next";
import { weekdayIndex } from "./format";
import { NUTRIENT_KEYS, makeNutrition, nutrientOf } from "./nutrients";
import type { NutrientKey } from "./nutrients";
import { ZERO_NUTRITION } from "../types";
import type { GoalConfig, GoalProfile, Nutrition } from "../types";

export const DEFAULT_PROFILE_ID = "default";
export const TRAINING_PROFILE_ID = "training";
export const REST_PROFILE_ID = "rest";

// DİKKAT: bu üç AD bir VERİ değeridir — profillerle birlikte `config.goals`
// içinde saklanır. Bu yüzden burada dile göre değiştirilmezler; gösterim
// katmanında `profileDisplayName` çevirir.
export const DEFAULT_PROFILE_NAME = "Varsayılan";
export const TRAINING_PROFILE_NAME = "Antrenman";
export const REST_PROFILE_NAME = "Dinlenme";

/** Bir profilin GÖRÜNEN adı.
 *
 *  Gömülü üç profil (varsayılan/antrenman/dinlenme) kullanıcı tarafından
 *  yeniden adlandırılmadıysa arayüzde aktif dilde görünür — böylece İngilizce
 *  arayüzde gün tipi rozeti "Antrenman" yazmaz.
 *
 *  Kullanıcı adı DEĞİŞTİRDİYSE kendi yazdığı ad aynen korunur (veriye dokunulmaz,
 *  backend sözleşmesi değişmez, göç gerekmez). */
export function profileDisplayName(profile: { id: string; name: string }, t: TFunction): string {
  if (profile.id === DEFAULT_PROFILE_ID && profile.name === DEFAULT_PROFILE_NAME)
    return t("goals.profileDefault");
  if (profile.id === TRAINING_PROFILE_ID && profile.name === TRAINING_PROFILE_NAME)
    return t("goals.profileTraining");
  if (profile.id === REST_PROFILE_ID && profile.name === REST_PROFILE_NAME)
    return t("goals.profileRest");
  return profile.name;
}

/** Profil adı ALANININ gösterdiği değer (Ayarlar → Hedefler'deki girdi).
 *
 *  Gömülü üç profilin adı VERİ olarak Türkçe saklanır (`DEFAULT_PROFILE_NAME`),
 *  çünkü backend onları seed eder. Kullanıcı o adı kendisi yazmadıysa alanda
 *  aktif dildeki karşılığı görünür — böylece İngilizce arayüzde "Profile Name"
 *  kutusu "Varsayılan" demez.
 *
 *  `edited` bayrağı ŞARTTIR: dokunulmamış alanı olduğu gibi kaydetmek verideki
 *  dil-nötr sentinel'i çevrilmiş bir ada dönüştürürdü; o addan sonra
 *  `profileDisplayName` eşleşmeyi kaybeder ve ad bir daha dile göre değişmezdi. */
export function profileNameFieldValue(
  profile: { id: string; name: string },
  t: TFunction,
  edited: boolean,
): string {
  return edited ? profile.name : profileDisplayName(profile, t);
}

/** Profil simgesi. Kimlikten türetilir — modele alan eklemek backend
 *  sözleşmesini genişletirdi, oysa simge tamamen görünüm meselesi. */
export function profileIcon(id: string): string {
  if (id === TRAINING_PROFILE_ID) return "🏋️";
  if (id === REST_PROFILE_ID) return "☕";
  return "🍽️";
}

/** Hiçbir profil bulunamazsa dönen son çare — `effectiveGoal`'un her koşulda bir
 *  `Nutrition` döndürebilmesi için. Pratikte `parseGoals` en az bir profil
 *  garanti eder; bu yalnızca tip düzeyindeki deliği kapatır. */
const FALLBACK_PROFILE: GoalProfile = {
  id: DEFAULT_PROFILE_ID,
  name: DEFAULT_PROFILE_NAME,
  nutrition: ZERO_NUTRITION,
};

/** v1 düz hedefin KAYIPSIZ v2 sarmalayıcısı: sayılar aynen taşınır, tek profil,
 *  boş şablon, boş istisna. */
export function singleProfileConfig(
  nutrition: Nutrition,
  id: string = DEFAULT_PROFILE_ID,
  name: string = DEFAULT_PROFILE_NAME,
): GoalConfig {
  return {
    version: 2,
    profiles: [{ id, name, nutrition }],
    defaultProfileId: id,
    weekday: {},
    overrides: {},
  };
}

export function profileById(config: GoalConfig, id: string | undefined): GoalProfile | undefined {
  if (id === undefined) return undefined;
  return config.profiles.find((p) => p.id === id);
}

/** Varsayılan profil. `defaultProfileId` silinmiş bir profili gösteriyorsa ilk
 *  profile düşer — atama bayat olabilir (bkz. dosya başlığı). */
export function defaultProfile(config: GoalConfig): GoalProfile {
  return profileById(config, config.defaultProfileId) ?? config.profiles[0] ?? FALLBACK_PROFILE;
}

/** Bir günün geçerli profili: istisna → haftalık şablon → varsayılan. */
export function effectiveProfile(config: GoalConfig, date: string): GoalProfile {
  return (
    profileById(config, config.overrides?.[date]) ??
    profileById(config, config.weekday?.[weekdayIndex(date)]) ??
    defaultProfile(config)
  );
}

/** Bir günün geçerli hedefi. Uygulamadaki TÜM hedef okumaları buradan geçer —
 *  geçmiş günler artık bugünün hedefiyle değil kendi hedefiyle karşılaştırılır. */
export function effectiveGoal(config: GoalConfig, date: string): Nutrition {
  return effectiveProfile(config, date).nutrition;
}

/** O gün için elle konmuş bir istisna var mı (şablondan sapma). */
export function hasOverride(config: GoalConfig, date: string): boolean {
  return profileById(config, config.overrides?.[date]) !== undefined;
}

/** Tek günlük istisnayı yazar/siler. `null` = şablona geri dön. */
export function withOverride(
  config: GoalConfig,
  date: string,
  profileId: string | null,
): GoalConfig {
  const overrides = { ...config.overrides };
  if (profileId === null) delete overrides[date];
  else overrides[date] = profileId;
  return { ...config, overrides };
}

/** Sıradaki profilin kimliği (rozetin tek dokunuşla döndürdüğü halka).
 *  Bilinmeyen/bayat kimlik ilk profile düşer. */
export function nextProfileId(config: GoalConfig, currentId: string): string {
  const i = config.profiles.findIndex((p) => p.id === currentId);
  const next = config.profiles[(i + 1) % config.profiles.length];
  return next?.id ?? currentId;
}

/** Haftanın 7 gününün profilleri (0=Pazar). İstisnalar HARİÇ: onlar tek günlük
 *  sapmalar, haftalık şablonun parçası değil. */
function weekProfiles(config: GoalConfig): GoalProfile[] {
  const out: GoalProfile[] = [];
  for (let dow = 0; dow < 7; dow++) {
    out.push(profileById(config, config.weekday?.[dow]) ?? defaultProfile(config));
  }
  return out;
}

/** HAFTALIK ORTALAMA hedef.
 *
 *  İki yerde kullanılıyor ve ikisinde de kasıtlı:
 *   • Trend grafiğinin DÜZ hedef çizgisi — her gün 2.760/2.390 arasında zıplayan
 *     testere dişi bir çizgi grafiği okunmaz hale getirirdi.
 *   • "Önerilen ayarı uygula" hesabının tabanı — böylece öneri kendi üstüne
 *     tekrar uygulandığında haftalık ortalama kaymaz.
 *
 *  Bir mikro besin 7 günün HEPSİNDE girilmemişse ortalaması da yoktur
 *  ("bilinmiyor" ≠ "sıfır"). */
export function weeklyAverageGoal(config: GoalConfig): Nutrition {
  const week = weekProfiles(config).map((p) => p.nutrition);
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    let sum = 0;
    let complete = true;
    for (const n of week) {
      const v = n[key];
      if (v === undefined) {
        complete = false;
        break;
      }
      sum += v;
    }
    if (complete) out[key] = sum / week.length;
  }
  return makeNutrition(out);
}

/** Haftalık şablonda antrenmana ayrılmış gün sayısı. */
export function trainingDayCount(config: GoalConfig): number {
  let n = 0;
  for (let dow = 0; dow < 7; dow++) if (config.weekday?.[dow] === TRAINING_PROFILE_ID) n++;
  return n;
}

// --- Öneri (kullanıcının antrenörü yok; sayıları uygulama üretir) ------------

/** Antrenman ve dinlenme günü arasındaki kalori farkı, tabanın oranı olarak.
 *  Tabanın ~%14'ü, yani her iki yöne ~%7'lik bir yayılma. */
const SPLIT_GAP_RATIO = 0.14;

/** Fark tamamen karbonhidrattan gelir: ek enerji antrenman gününün glikojeni
 *  içindir. Oran kayıttan okunur, elle "4" yazılmaz. */
const CARB_KCAL_PER_G = nutrientOf("carbs").kcalPerG ?? 4;

const round10 = (v: number): number => Math.round(v / 10) * 10;

export interface GoalSplit {
  training: Nutrition;
  rest: Nutrition;
}

/** Antrenman/dinlenme ayrımı.
 *
 *  KURAL: haftalık ortalama TABANLA AYNI KALIR. Kullanıcının hedefi haftalık
 *  bir bütçedir; gün tipi onu yeniden dağıtır, büyütmez. Denklem
 *
 *      (T × antrenman + R × dinlenme) / 7 = taban ,  antrenman − dinlenme = fark
 *
 *  şu çözümü verir — dikkat: hiçbir yerde T'ye ya da R'ye BÖLÜNMÜYOR, bu yüzden
 *  0 ve 7 antrenman günü de sorunsuz çalışır:
 *
 *      antrenman = taban + fark × R/7 ,  dinlenme = taban − fark × T/7
 *
 *  Protein, lif ve tüm mikro limitler İKİ GÜNDE DE AYNI: kas protein sentezi
 *  antrenmandan 24–48 saat sonra da sürüyor, dinlenme gününde proteini düşürmek
 *  hem anlamsız hem de diyeti gereksiz karmaşıklaştırır. Yağ da sabit kalır.
 *  Değişen tek şey kalori ve onu taşıyan karbonhidrattır. */
export function suggestSplit(baseline: Nutrition, trainingDays: number): GoalSplit {
  const t = Math.min(7, Math.max(0, Math.round(trainingDays)));
  const r = 7 - t;

  // Taban önce yuvarlanır ki öneri kendi çıktısına yeniden uygulandığında
  // ondalık artıkları birikmesin.
  const baseKcal = round10(Math.max(0, baseline.kcal));
  const baseCarbs = Math.max(0, baseline.carbs);
  const gap = baseKcal * SPLIT_GAP_RATIO;

  /** Kalori farkını karbonhidrata çeviren tek nokta. Karbonhidrat 0'ın altına
   *  inemez (çok düşük karbonhidratlı bir tabanda dinlenme günü eksiye düşerdi);
   *  o uçta kalori sayısı bağlayıcı olan, karbonhidrat ise taban değerdir. */
  const make = (kcal: number): Nutrition => ({
    ...baseline,
    kcal,
    carbs: Math.max(0, Math.round(baseCarbs + (kcal - baseKcal) / CARB_KCAL_PER_G)),
  });

  return {
    training: make(round10(baseKcal + (gap * r) / 7)),
    rest: make(round10(baseKcal - (gap * t) / 7)),
  };
}

/** Antrenman günlerinin haftaya yerleşme sırası (0=Pazar): Pzt, Sal, Per, Cum,
 *  Cmt, Çar, Paz. Yaygın bir salon düzeni; kullanıcı rozetle ya da form içindeki
 *  gün satırıyla istediği gibi değiştirebilir. */
const TRAINING_DAY_ORDER = [1, 2, 4, 5, 6, 3, 0];

/** "Önerilen ayarı uygula": mevcut haftalık ortalamayı TABAN alarak Antrenman +
 *  Dinlenme profillerini kurar ve haftayı dağıtır. Kullanıcının elle koyduğu
 *  günlük istisnalardan yalnızca hâlâ var olan profilleri gösterenler korunur. */
export function applySuggestion(config: GoalConfig, trainingDays: number): GoalConfig {
  const t = Math.min(7, Math.max(0, Math.round(trainingDays)));
  const { training, rest } = suggestSplit(weeklyAverageGoal(config), t);

  const weekday: Record<number, string> = {};
  for (let dow = 0; dow < 7; dow++) weekday[dow] = REST_PROFILE_ID;
  for (const dow of TRAINING_DAY_ORDER.slice(0, t)) weekday[dow] = TRAINING_PROFILE_ID;

  const overrides: Record<string, string> = {};
  for (const [date, id] of Object.entries(config.overrides ?? {})) {
    if (id === TRAINING_PROFILE_ID || id === REST_PROFILE_ID) overrides[date] = id;
  }

  return {
    version: 2,
    profiles: [
      { id: TRAINING_PROFILE_ID, name: TRAINING_PROFILE_NAME, nutrition: training },
      { id: REST_PROFILE_ID, name: REST_PROFILE_NAME, nutrition: rest },
    ],
    // Varsayılan DİNLENME: şablon dışında kalan (ya da bayat atamalı) bir gün
    // kendiliğinden yüksek kalorili güne düşmesin.
    defaultProfileId: REST_PROFILE_ID,
    weekday,
    overrides,
  };
}
