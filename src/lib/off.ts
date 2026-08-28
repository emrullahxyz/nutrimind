// ============================================================================
// Nutrimind — Open Food Facts istemcisi + eşleme katmanı (Faz 4).
//
// OFF'a TARAYICIDAN DOĞRUDAN GİDİLMEZ. İki nedeni var ve ikisi de aşılamaz:
// OFF uygulamayı tanıtan özel bir `User-Agent` başlığı zorunlu tutuyor (tarayıcı
// `fetch`'i bu başlığı ayarlatmaz) ve hız sınırı IP başına işliyor — aşılırsa
// sunucunun IP'si banlanıyor. Bu yüzden her istek Faz 3a'da yazılan sunucu
// proxy'sinden (`/api/off/…`) geçer; önbellek ve jeton kovası orada.
//
// Bu dosyanın iki işi var:
//   1. Proxy uçlarını tipli çağırmak ve hatalarını (429/502/504) dürüst Türkçe
//      mesajlara çevirmek.
//   2. OFF'un `nutriments` nesnesini bizim `Nutrition`'a çevirmek — besin
//      kaydını (`nutrients.ts`) DOLAŞARAK, hiçbir besin adını elle sayarak değil.
//
// EN ÖNEMLİ KURAL: OFF'un BİLDİRMEDİĞİ mikro besin `undefined` KALIR, 0 olmaz.
// "Sodyum bilinmiyor" ile "sodyum 0 mg" aynı şey değildir; ikincisi ürün
// hakkında yanlış bir iddiadır. Çekirdek 5 alan uygulamanın her yerinde olduğu
// gibi 0'a düşer (tip zorunlu kılıyor), ama hangi alanların gerçekten
// bildirildiği `present`/`missing` ile ayrıca taşınır ki arayüz "bu üründe
// eksik veri var" diyebilsin.
// ============================================================================
import type { Nutrition } from "../types";
import { NUTRIENTS, makeNutrition, nutrientOf } from "./nutrients";
import type { NutrientKey } from "./nutrients";
import { isBrowserOffline } from "./netStatus";

// --- Sabitler ---------------------------------------------------------------

/** OFF'un tuz alanı: sodyum boşsa buradan türetilir. */
const OFF_SALT_KEY = "salt_100g";
/** Kilojoule alanı: kcal hiç bildirilmemişse son çare. */
const OFF_KJ_KEY = "energy-kj_100g";

/** OFF sodyumu GRAM bildirir, biz mg tutuyoruz. */
const SODIUM_G_TO_MG = 1000;
/** Tuz → sodyum: NaCl'nin kütlece ~%40'ı sodyum (yaygın 2,5 katsayısı). */
const SALT_TO_SODIUM = 1 / 2.5;
/** Codex Alimentarius dönüşümü; kJ → kcal. */
const KJ_PER_KCAL = 4.184;

/** Ürün başına besin değeri her zaman 100 g içindir — alias'ın porsiyonu da öyle. */
export const OFF_SERVING_G = 100;

/** Adı olmayan ürünler gerçekten var (bkz. off.fixtures.ts). Uydurmak yerine
 *  bunu gösteriyoruz; kullanıcı forma düşen adı düzeltebiliyor. */
export const OFF_UNNAMED = "İsimsiz ürün";

/** Atıf zorunlu: OFF verisi ODbL 1.0 lisanslı. */
export const OFF_ATTRIBUTION = "Veriler Open Food Facts'ten — ODbL 1.0 lisansı.";

// --- Hata tipi --------------------------------------------------------------

/** Proxy'den dönen hata. `status` HTTP kodudur (0 = ağa hiç çıkılamadı),
 *  `retryAfter` yalnızca 429'da doludur (saniye). */
export class OffError extends Error {
  readonly status: number;
  readonly retryAfter: number | null;
  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "OffError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Durum koduna göre arayüz metni. Sunucunun kendi Türkçe mesajı varsa ve
 *  durum tanınmıyorsa o kullanılır — iki katman aynı dili konuşuyor. */
export function offErrorMessage(status: number, serverMessage?: string | null, retryAfter?: number | null): string {
  switch (status) {
    case 0:
      return "Sunucuya ulaşılamadı — bağlantını kontrol et.";
    case 429:
      // Hız sınırı Open Food Facts'in kotasıdır, kullanıcının hatası değil.
      // Sayı verilmezse "biraz sonra" demek uydurma bir süreden dürüsttür.
      return retryAfter
        ? `Çok hızlı arama yapıldı. Open Food Facts kotası korunuyor — ${retryAfter} sn sonra tekrar dene.`
        : "Çok hızlı arama yapıldı. Open Food Facts kotası korunuyor — biraz sonra tekrar dene.";
    case 502:
      return "Open Food Facts şu an düzgün yanıt vermiyor. Biraz sonra tekrar dene.";
    case 504:
      return "Open Food Facts zaman aşımına uğradı. Biraz sonra tekrar dene.";
    default:
      return serverMessage?.trim() || `Open Food Facts isteği başarısız (HTTP ${status}).`;
  }
}

// --- Proxy çağrıları --------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function offGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: "application/json" }, signal });
  } catch (e) {
    // İptal (AbortError) hata değil, çağıranın kendi kararı — olduğu gibi geçsin.
    if ((e as Error | undefined)?.name === "AbortError") throw e;
    throw new OffError(0, offErrorMessage(0));
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const body = isRecord(json) ? json : {};
    // `Retry-After` başlığı asıl kaynak; proxy aynı sayıyı gövdeye de koyuyor.
    const header = Number(res.headers.get("Retry-After"));
    const fromBody = typeof body.retryAfter === "number" ? body.retryAfter : NaN;
    const retryAfter = Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromBody) ? fromBody : null;
    const serverMessage = typeof body.error === "string" ? body.error : null;
    throw new OffError(res.status, offErrorMessage(res.status, serverMessage, retryAfter), retryAfter);
  }

  return json as T;
}

/** Proxy'nin arama zarfı — `server/index.js` içindeki `offSearch()` ile birebir.
 *  DİKKAT: OFF `hits` döndürür, PROXY bunu `products`'a çevirir. */
export interface OffSearchResponse {
  ok: boolean;
  query: string;
  /** `"index"` = tek kelime, süzgeç OFF dizininde; `"post-filter"` = çok kelime,
   *  Polonya süzgeci proxy'de uygulandı → istenenden AZ sonuç gelebilir. */
  scope: "index" | "post-filter";
  count: number;
  upstreamCount: number | null;
  products: unknown[];
  cached: boolean;
}

/** Proxy'nin ürün zarfı — `offProduct()` ile birebir. */
export interface OffProductResponse {
  ok: boolean;
  found: boolean;
  barcode: string;
  product: unknown;
  cached: boolean;
}

/** Arama sonucu: zarf + eşlenmiş ürünler. */
export interface OffSearchResult {
  query: string;
  scope: "index" | "post-filter";
  upstreamCount: number | null;
  cached: boolean;
  foods: OffFood[];
}

export async function searchOff(query: string, limit = 20, signal?: AbortSignal): Promise<OffSearchResult> {
  if (isBrowserOffline()) throw new OffError(0, offErrorMessage(0));
  const url = `/api/off/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const raw = await offGet<OffSearchResponse>(url, signal);
  const products = Array.isArray(raw?.products) ? raw.products : [];
  return {
    query: typeof raw?.query === "string" ? raw.query : query,
    scope: raw?.scope === "post-filter" ? "post-filter" : "index",
    upstreamCount: typeof raw?.upstreamCount === "number" ? raw.upstreamCount : null,
    cached: raw?.cached === true,
    // Kodsuz kayıt eşlenemez (barkod alias'ın kimliği) — sessizce elenir.
    foods: products.map((p) => toOffFood(p)).filter((f): f is OffFood => f !== null),
  };
}

/** Barkodla tek ürün. Ürün OFF'ta yoksa `null` döner — bu bir HATA DEĞİL. */
export async function fetchOffProduct(barcode: string, signal?: AbortSignal): Promise<OffFood | null> {
  if (isBrowserOffline()) throw new OffError(0, offErrorMessage(0));
  const raw = await offGet<OffProductResponse>(`/api/off/product/${encodeURIComponent(barcode)}`, signal);
  if (!raw?.found || !raw.product) return null;
  return toOffFood(raw.product);
}

/** Barkod, proxy'nin kabul ettiği biçimde mi? Sunucudaki kontrolün aynısı —
 *  geçersiz barkod için boşuna istek atıp kotadan jeton yakmayalım. */
export function isValidBarcode(raw: string): boolean {
  return /^[0-9]{4,20}$/.test(raw.trim());
}

// --- Eşleme katmanı ---------------------------------------------------------

/** Sodyum nereden geldi? Arayüz "tuzdan hesaplandı" diyebilsin diye taşınıyor. */
export type SodiumSource = "sodium" | "salt" | null;

export interface OffNutritionMapping {
  nutrition: Nutrition;
  /** OFF'un GERÇEKTEN bildirdiği besinler. */
  present: NutrientKey[];
  /** Kayıtta olup OFF'ta bulunmayanlar. Mikrolar `undefined` kaldı; çekirdek
   *  alanlar tip gereği 0'a düştü ama burada listelendikleri için arayüz "bu
   *  0 gerçek bir ölçüm değil" diyebilir. */
  missing: NutrientKey[];
  sodiumSource: SodiumSource;
  /** kcal doğrudan gelmedi, kJ'den çevrildi. */
  kcalFromKj: boolean;
}

/** OFF sayıları çoğunlukla `number`, ama bazı kayıtlarda METİN geliyor.
 *  Sayıya çevrilemeyen / sonsuz / negatif değer "bildirilmemiş" sayılır:
 *  negatif bir besin değeri anlamsızdır ve 0'dan daha yanıltıcıdır. */
function offNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

/** 0,1 hassasiyet — `scaleNutrition` ile aynı; kayan nokta artığını da temizler
 *  (0,039 × 1000 = 39,000000000000004). */
const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * OFF `nutriments` → `Nutrition`. Besin kaydını DOLAŞIR: `offKey` taşıyan her
 * besin denenir, elle besin adı sayılmaz.
 *
 * İki dönüşüm kuralı kayıt üzerinden ifade edilemez, bu yüzden burada:
 *   • Sodyum: OFF gram bildirir → ×1000 mg. Alan boşsa `salt_100g / 2,5 × 1000`.
 *   • Kalori: `energy-kcal_100g` yoksa `energy-kj_100g / 4,184`. (`energy_100g`
 *     BİLEREK kullanılmıyor: birimi ürüne göre kJ ya da kcal olabiliyor, yani
 *     4 kat hatalı bir kalori üretme riski taşıyor.)
 */
export function mapOffNutriments(raw: unknown): OffNutritionMapping {
  const nutriments = isRecord(raw) ? raw : {};
  const values: Partial<Record<NutrientKey, number>> = {};
  const present: NutrientKey[] = [];
  const missing: NutrientKey[] = [];
  let sodiumSource: SodiumSource = null;
  let kcalFromKj = false;

  for (const def of NUTRIENTS) {
    // Kayıtta `offKey` yoksa OFF bu besini hiç bildirmiyor demektir.
    let value = def.offKey ? offNum(nutriments[def.offKey]) : null;

    if (def.key === "sodium") {
      if (value !== null) {
        value *= SODIUM_G_TO_MG;
        sodiumSource = "sodium";
      } else {
        const salt = offNum(nutriments[OFF_SALT_KEY]);
        if (salt !== null) {
          value = salt * SALT_TO_SODIUM * SODIUM_G_TO_MG;
          sodiumSource = "salt";
        }
      }
    } else if (def.key === "kcal" && value === null) {
      const kj = offNum(nutriments[OFF_KJ_KEY]);
      if (kj !== null) {
        value = kj / KJ_PER_KCAL;
        kcalFromKj = true;
      }
    }

    if (value === null) {
      // BURASI ÇEKİRDEK KURAL: değer YAZILMAZ. `makeNutrition` çekirdek alanları
      // 0'a kurar, mikro alanlarsa hiç oluşmaz — yani "bilinmiyor" olarak kalır.
      missing.push(def.key);
      continue;
    }
    values[def.key] = round1(value);
    present.push(def.key);
  }

  return { nutrition: makeNutrition(values), present, missing, sodiumSource, kcalFromKj };
}

/** Arayüze hazır OFF ürünü. Besin değerleri 100 g içindir. */
export interface OffFood {
  /** Barkod. Alias'ta hem `barcode` hem `off_id` olarak saklanır. */
  code: string;
  name: string;
  brand: string | null;
  /** Ambalaj miktarı ("150 g") — porsiyon ipucu, hesaba GİRMEZ. */
  quantity: string | null;
  /** OFF'un porsiyon metni ("1 portion (150 g)") — yine yalnızca ipucu. */
  servingSize: string | null;
  imageUrl: string | null;
  nutrition: Nutrition;
  present: NutrientKey[];
  missing: NutrientKey[];
  sodiumSource: SodiumSource;
  kcalFromKj: boolean;
}

/** Boş olmayan metin ya da null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Marka. Ürün ucu virgülle birleştirilmiş METİN ("Piatnica,OSM"), arama ucu
 *  DİZİ (["Piątnica","OSM Piątnica"]) döndürüyor — ikisi de gerçek yükle
 *  doğrulandı. Alias tek bir marka taşıdığı için BİRİNCİSİ alınır. */
function firstBrand(v: unknown): string | null {
  if (Array.isArray(v)) return str(v[0]);
  const s = str(v);
  return s ? str(s.split(",")[0]) : null;
}

/**
 * Ham OFF ürününü arayüz nesnesine çevirir. `code` yoksa `null` döner: barkodsuz
 * bir kayıt ne aranabilir ne de alias'a bağlanabilir.
 *
 * Ad sırası: Lehçe ad → genel ad → `OFF_UNNAMED`. Kullanıcı Polonya'da yaşıyor;
 * rafta gördüğü isim Lehçe olan.
 */
export function toOffFood(raw: unknown): OffFood | null {
  if (!isRecord(raw)) return null;
  const code = str(raw.code);
  if (!code) return null;

  const mapped = mapOffNutriments(raw.nutriments);
  return {
    code,
    name: str(raw.product_name_pl) ?? str(raw.product_name) ?? OFF_UNNAMED,
    brand: firstBrand(raw.brands),
    quantity: str(raw.quantity),
    servingSize: str(raw.serving_size),
    imageUrl: str(raw.image_small_url),
    nutrition: mapped.nutrition,
    present: mapped.present,
    missing: mapped.missing,
    sodiumSource: mapped.sodiumSource,
    kcalFromKj: mapped.kcalFromKj,
  };
}

/** Eksik besinlerin okunur adları — arayüzdeki "eksik veri" rozeti için. */
export function missingLabels(food: OffFood): string[] {
  return food.missing.map((key) => nutrientOf(key).label);
}

// --- Barkod tarayıcı yetenek testi ------------------------------------------
//
// Native `BarcodeDetector` Android/Chrome'da var, iOS Safari'de YOK. Yeni
// bağımlılık eklenmiyor (karar Faz 4 brifinginde): desteklenmeyen tarayıcıda
// kamera düğmesi GİZLENİR, elle barkod yazma alanı HER ZAMAN açık kalır — yani
// özellik hiçbir cihazda tamamen ölmüyor.

export interface DetectedBarcode {
  rawValue: string;
  format: string;
}
export interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
export interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Gıda ambalajlarında kullanılan biçimler. Desteklenmeyen bir biçim istemek
 *  Chrome'da hata fırlattığı için `getSupportedFormats()` ile kesiştiriliyor. */
export const FOOD_BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

/** Tarayıcıdaki `BarcodeDetector` kurucusu — yoksa null. */
export function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const g = globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof g.BarcodeDetector === "function" ? g.BarcodeDetector : null;
}

/**
 * Kamerayla tarama bu tarayıcıda mümkün mü? ÜÇ koşul da şart:
 *   1. `BarcodeDetector` var (iOS Safari'de yok),
 *   2. `getUserMedia` var,
 *   3. güvenli bağlam (HTTPS ya da localhost) — değilse `getUserMedia` zaten
 *      reddeder, düğmeyi göstermek boş umut olur.
 */
export function cameraScanSupported(): boolean {
  if (!barcodeDetectorCtor()) return false;
  const g = globalThis as unknown as {
    navigator?: { mediaDevices?: { getUserMedia?: unknown } };
    isSecureContext?: boolean;
  };
  if (typeof g.navigator?.mediaDevices?.getUserMedia !== "function") return false;
  return g.isSecureContext === true;
}
