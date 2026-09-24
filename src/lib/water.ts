// ============================================================================
// Nutrimind — günlük su takibi (v0.30.8). SAF modül: React'e, ağa, i18n'e dokunmaz.
//
// NEDEN TARİH → DİZİ (toplam değil): kullanıcı yanlış kutuya/çipe bastığında
// geri alabilmeli. Toplam tutulsaydı "geri al" ancak son ölçünün miktarını
// hatırlayarak yapılabilirdi; dizi hem kayıpsız geri alma hem de ileride
// günlük dağılım (bardak bazlı grafik) imkânı verir — toplam yine türetilir.
//
// `supplements.ts` / `weight.ts` deseni birebir izlenir: `config.water` bozuk
// gelse bile parse ÇÖKMEZ, yalnızca geçersiz parçalar atılır. Hiçbir yerde
// istisna fırlatılmaz.
//
// i18n: bu modül kullanıcıya görünen METİN üretmez — yalnızca sayı. Litre
// etiketi ve ondalık ayırıcı bileşende `formatNumber` + `t()` ile üretilir
// (bkz. `lib/ring.ts` deseni).
// ============================================================================
import type { AppConfig } from "../types";
import { parseNum } from "./nutrition";

export interface WaterConfig {
  /** Günlük hedef (ml). */
  targetMl: number;
  /** Kart "Bugün" ekranında görünsün mü. */
  enabled: boolean;
  /** "YYYY-MM-DD" → o gün girilen ölçüler (ml), ekleme sırası korunur. */
  log: Record<string, number[]>;
}

export const DEFAULT_WATER_TARGET_ML = 2000;
/** Kart üzerindeki tek dokunuşluk çipler. */
export const WATER_PRESETS_ML = [200, 330, 500] as const;
/** Tek girişte kabul edilen en küçük/en büyük ölçü. Üst sınır yazım hatası
 *  emniyetidir ("2000" yerine "20000" yazan bir kayıt hedefi anlamsız kılar). */
export const WATER_MIN_ENTRY_ML = 10;
export const WATER_MAX_ENTRY_ML = 2000;
/** Gün toplamı üst sınırı — diziyi sınırsız büyütmeye karşı savunma. */
export const WATER_MAX_DAY_ML = 8000;
/** Hedef alanı için kabul edilen aralık (ayar ekranı) — 35 ml/kg önerisinin
 *  sağlıklı kelepçesi: 1200'den az (çok az içen) / 4000'den fazla (aşırı) önerme. */
export const WATER_MIN_TARGET_ML = 1200;
export const WATER_MAX_TARGET_ML = 4000;
/** 35 ml/kg yaygın bir klinik yaklaşımdır; kullanıcı isterse uygular. */
export const WATER_ML_PER_KG = 35;

export const EMPTY_WATER: WaterConfig = {
  targetMl: DEFAULT_WATER_TARGET_ML,
  enabled: true,
  log: {},
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ölçü gerçekten kabul edilebilir mi? Sınır dışıysa `null` döner — sessizce
 *  kırpmak yalan olurdu ("3000 ml" yazan kullanıcı 2000 görürdü). */
export function normalizeAmount(raw: number | string): number | null {
  const n = typeof raw === "number" ? raw : parseNum(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < WATER_MIN_ENTRY_ML || rounded > WATER_MAX_ENTRY_ML) return null;
  return rounded;
}

/** `config.water`'ı doğrular. Geçersiz ölçü/tarih tek tek atlanır. */
export function parseWaterConfig(config: AppConfig): WaterConfig {
  if (typeof config !== "object" || config === null) {
    return EMPTY_WATER;
  }
  const rawWater = config.water;
  if (typeof rawWater !== "object" || rawWater === null || Array.isArray(rawWater)) {
    return EMPTY_WATER;
  }
  const rec = rawWater as Record<string, unknown>;

  const rawTarget = rec.targetMl;
  const targetMl =
    typeof rawTarget === "number" && Number.isFinite(rawTarget) && rawTarget >= WATER_MIN_TARGET_ML
      ? Math.round(Math.min(rawTarget, WATER_MAX_TARGET_ML))
      : DEFAULT_WATER_TARGET_ML;

  // `enabled` yalnızca AÇIKÇA false ise kapalıdır: şema yoksa (yani bu sürümden
  // önce kaydedilmiş bir hesapta) kart görünür olmalı — kullanıcının şikâyeti
  // tam olarak "göremiyorum"du.
  const enabled = rec.enabled === false ? false : true;

  const log: Record<string, number[]> = {};
  const rawLog = rec.log;
  if (typeof rawLog === "object" && rawLog !== null && !Array.isArray(rawLog)) {
    for (const [date, val] of Object.entries(rawLog as Record<string, unknown>)) {
      if (!DATE_RE.test(date) || !Array.isArray(val)) continue;
      const amounts: number[] = [];
      for (const entry of val) {
        const ml = typeof entry === "number" ? normalizeAmount(entry) : null;
        if (ml !== null) amounts.push(ml);
      }
      if (amounts.length > 0) log[date] = amounts;
    }
  }

  return { targetMl, enabled, log };
}

/** O gün girilen ölçüler (kopya — çağıran diziyi değiştirmesin). */
export function waterEntries(config: WaterConfig, date: string): number[] {
  return [...(config.log[date] ?? [])];
}

export function waterTotalMl(config: WaterConfig, date: string): number {
  const entries = config.log[date];
  if (!entries) return 0;
  return entries.reduce((sum, ml) => sum + ml, 0);
}

/** Ölçü ekler. Gün toplamı `WATER_MAX_DAY_ML`'i aşacaksa `null` döner —
 *  çağıran kullanıcıya sebebini söyler (sessiz yutma yok). */
export function addWaterEntry(config: WaterConfig, date: string, ml: number): WaterConfig | null {
  const amount = normalizeAmount(ml);
  if (amount === null || !DATE_RE.test(date)) return null;
  if (waterTotalMl(config, date) + amount > WATER_MAX_DAY_ML) return null;
  return {
    ...config,
    log: { ...config.log, [date]: [...(config.log[date] ?? []), amount] },
  };
}

/** Son ölçüyü geri alır. Zaten boşsa değişiklik yapmaz (düğme kapalı olurdu,
 *  yine de saf fonksiyon kendini savunmalı). */
export function removeLastWaterEntry(config: WaterConfig, date: string): WaterConfig {
  const entries = config.log[date];
  if (!entries || entries.length === 0) return config;
  const next = entries.slice(0, -1);
  const log = { ...config.log };
  if (next.length === 0) {
    delete log[date];
  } else {
    log[date] = next;
  }
  return { ...config, log };
}

/** 0..1 arası ilerleme. Hedef 0/geçersizse 0 döner (bölme yok). */
export function waterRatio(totalMl: number, targetMl: number): number {
  if (!Number.isFinite(targetMl) || targetMl <= 0) return 0;
  const ratio = totalMl / targetMl;
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

/** `date` günü `today` ile aynı mı — kart görünürlüğü için. */
export function isToday(date: string, today: string): boolean {
  return date === today;
}

/**
 * Kart gösterilsin mi?
 *  • kapalıysa hiç gösterilmez,
 *  • BUGÜN her zaman gösterilir (keşfedilebilirlik — özellik isteğinin özü),
 *  • GEÇMİŞ günde yalnızca o güne su girilmişse gösterilir (yoksa her geçmiş
 *    gün sıfırlı bir kartla dolup gerçek veriyi gölgelerdi).
 */
export function shouldShowWaterCard(enabled: boolean, totalMl: number, isTodayDay: boolean): boolean {
  if (!enabled) return false;
  return isTodayDay || totalMl > 0;
}

/** Kilonun `WATER_ML_PER_KG` katı, 50 ml adımına yuvarlanır ve ayar aralığına
 *  kelepçelenir. Kilo yoksa (ya da geçersizse) `null` — uydurma öneri verilmez. */
export function suggestTargetMl(weightKg: number | null | undefined): number | null {
  if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const raw = weightKg * WATER_ML_PER_KG;
  const rounded = Math.round(raw / 50) * 50;
  return Math.max(WATER_MIN_TARGET_ML, Math.min(WATER_MAX_TARGET_ML, rounded));
}

/** Hedef alanı için kabul edilebilir mi (500–6000 ml)? */
export function normalizeTargetMl(raw: number | string): number | null {
  const n = typeof raw === "number" ? raw : parseNum(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < WATER_MIN_TARGET_ML || rounded > WATER_MAX_TARGET_ML) return null;
  return rounded;
}

/** Son `days` günün (bugün dahil) kayıtlı günler üzerinden ortalaması — kayıtsız
 *  günler sıfır sayılmaz (bkz. trend.ts'teki aynı ilke). Kayıt yoksa `null`. */
export function waterAverageMl(config: WaterConfig, dates: string[]): number | null {
  const recorded = dates.filter((d) => (config.log[d]?.length ?? 0) > 0);
  if (recorded.length === 0) return null;
  const total = recorded.reduce((sum, d) => sum + waterTotalMl(config, d), 0);
  return Math.round(total / recorded.length);
}
