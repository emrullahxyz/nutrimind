// ============================================================================
// Nutrimind — backend'den canlı veri (/api/data). SQLite'a bağlı Node servisi.
// ============================================================================
import type {
  Alias,
  AliasUnit,
  AppConfig,
  GoalConfig,
  GoalProfile,
  MealCategory,
  MealItem,
  MealPayload,
  MealSource,
  Nutrition,
  Recipe,
  RecipeIngredient,
} from "../types";
import { singleProfileConfig } from "./goals";
import { NUTRIENT_KEYS, makeNutrition } from "./nutrients";
import type { NutrientKey } from "./nutrients";
import { parseNum } from "./nutrition";

export interface AppData {
  goals: GoalConfig;
  days: Record<string, MealItem[]>;
  aliases: Alias[];
  config: AppConfig;
}

/** Backend'den gelen ham besin nesnesi: alanlar eksik ya da `null` olabilir. */
type RawNutrition = Partial<Record<NutrientKey, number | null>>;

/** Ham JSON'u `Nutrition`'a tamamlar.
 *  Çekirdek 5 alan eksikse 0'a düşer (eski `?? 0` davranışı, `makeNutrition`
 *  tabanı). Mikro alanlarda "bilinmiyor" ≠ "sıfır": eksik ya da `null` mikro
 *  `undefined` KALIR, 0'a çevrilmez. */
export function fill(n: RawNutrition | undefined): Nutrition {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const v = n?.[key];
    if (v === undefined || v === null) continue;
    out[key] = v;
  }
  return makeNutrition(out);
}

interface RawAlias {
  id: string;
  triggers: string[];
  name: string;
  brand?: string | null;
  serving_g?: number;
  nutrition: RawNutrition;
  units?: unknown;
  barcode?: string | null;
  off_id?: string | null;
  recipe?: unknown;
}

/** Boş olmayan metin ya da `undefined`. Barkod/off_id için: backend'den `null`
 *  ya da boş metin gelebiliyor, ikisi de "yok" demek — `Alias`'ta alanın HİÇ
 *  olmaması bunu tek biçimde ifade eder (boş metin barkod diye çizilmesin). */
function optionalText(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Faz 5: Bozuk/eksik `units` verisini doğrular; `units` dizi değilse veya
 *  bir satırın `grams`'ı pozitif sayı değilse o satırı atar. */
export function parseUnits(raw: unknown): AliasUnit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid: AliasUnit[] = [];
  for (const u of raw) {
    if (typeof u !== "object" || u === null) continue;
    const name = typeof (u as { name?: unknown }).name === "string" ? (u as { name: string }).name.trim() : "";
    const gramsRaw = (u as { grams?: unknown }).grams;
    const grams = typeof gramsRaw === "number" ? gramsRaw : parseNum(String(gramsRaw ?? ""));
    if (name.length > 0 && typeof grams === "number" && grams > 0 && Number.isFinite(grams)) {
      valid.push({ name, grams });
    }
  }
  return valid.length > 0 ? valid : undefined;
}

/** Faz 6: Bozuk/eksik `sources` verisini doğrular; `sources` dizi değilse veya
 *  bir satırın `aliasId` metin değilse veya `qty` pozitif sayı değilse o satırı atar. */
export function parseSources(raw: unknown): MealSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid: MealSource[] = [];
  for (const s of raw) {
    if (typeof s !== "object" || s === null) continue;
    const aliasId = typeof (s as { aliasId?: unknown }).aliasId === "string" ? (s as { aliasId: string }).aliasId.trim() : "";
    const qtyRaw = (s as { qty?: unknown }).qty;
    const qty = typeof qtyRaw === "number" ? qtyRaw : parseNum(String(qtyRaw ?? ""));
    const unitRaw = (s as { unit?: unknown }).unit;
    const unit = typeof unitRaw === "string" && unitRaw.trim().length > 0 ? unitRaw.trim() : "g";
    if (aliasId.length > 0 && typeof qty === "number" && qty > 0 && Number.isFinite(qty)) {
      valid.push({ aliasId, qty, unit });
    }
  }
  return valid.length > 0 ? valid : undefined;
}

/** Faz 7: Bozuk/eksik `recipe` verisini doğrular; `recipe` nesne değilse veya
 *  `totalG` <= 0 ise veya `ingredients` geçerli malzeme içermiyorsa undefined döner. */
export function parseRecipe(raw: unknown): Recipe | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const totalGRaw = (raw as { totalG?: unknown }).totalG;
  const totalG = typeof totalGRaw === "number" ? totalGRaw : parseNum(String(totalGRaw ?? ""));
  if (typeof totalG !== "number" || totalG <= 0 || !Number.isFinite(totalG)) return undefined;

  const ingredientsRaw = (raw as { ingredients?: unknown }).ingredients;
  if (!Array.isArray(ingredientsRaw)) return undefined;

  const valid: RecipeIngredient[] = [];
  for (const ing of ingredientsRaw) {
    if (typeof ing !== "object" || ing === null) continue;
    const aliasId = optionalText((ing as { aliasId?: unknown }).aliasId);
    const name = typeof (ing as { name?: unknown }).name === "string" ? (ing as { name: string }).name.trim() : "";
    const qtyRaw = (ing as { qty?: unknown }).qty;
    const qty = typeof qtyRaw === "number" ? qtyRaw : parseNum(String(qtyRaw ?? ""));
    const unitRaw = (ing as { unit?: unknown }).unit;
    const unit = typeof unitRaw === "string" && unitRaw.trim().length > 0 ? unitRaw.trim() : "g";
    const nutrition = fill((ing as { nutrition?: RawNutrition }).nutrition);

    if (name.length > 0 && typeof qty === "number" && qty > 0 && Number.isFinite(qty)) {
      valid.push({
        ...(aliasId ? { aliasId } : {}),
        name,
        qty,
        unit,
        nutrition,
      });
    }
  }

  return valid.length > 0 ? { ingredients: valid, totalG } : undefined;
}

/** Faz 8: HEDEF ŞEKİL GÖÇÜ — v1 (düz `Nutrition`) → v2 (`GoalConfig`).
 *
 *  Bu fonksiyon uygulamanın en riskli tek noktası: kullanıcının gerçek hedefleri
 *  buradan geçiyor. Üç durum var ve üçü de veri kaybetmeden sonuçlanmak zorunda:
 *
 *   1. Gövde v2 (`version`/`profiles`/`defaultProfileId` alanlarından biri var)
 *      → doğrulanır ve olduğu gibi kullanılır.
 *   2. Gövde düz besin nesnesi (v1 — ÜRETİMDE BUGÜN OLAN DURUM)
 *      → sayılar AYNEN taşınarak tek profilli bir v2'ye sarılır. `fill` mikro
 *        alanların "bilinmiyor" hâlini de korur.
 *   3. Gövde eksik/bozuk → sıfır hedefli tek profile düşülür. Uygulama açılır;
 *      hedefsiz bar/halka zaten sessiz kalacak biçimde yazılmış durumda.
 *
 *  BAYAT ATAMALAR BİLEREK ELENMİYOR: `weekday`/`overrides` değerlerinin var olan
 *  bir profili göstermesi backend'de de zorunlu değil. Silinmiş bir profile
 *  işaret eden atamayı burada düşürmek, sunucu gidiş-dönüşünde kullanıcının
 *  atamasını sessizce silmek olurdu; çözümleme katmanı (`effectiveProfile`)
 *  bayat kimliği zaten varsayılana düşürüyor. */
export function parseGoals(raw: unknown): GoalConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return singleProfileConfig(fill(undefined));
  }
  const o = raw as Record<string, unknown>;

  const looksV2 = "version" in o || "profiles" in o || "defaultProfileId" in o;
  if (!looksV2) return singleProfileConfig(fill(o as RawNutrition));

  const profiles: GoalProfile[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(o.profiles) ? o.profiles : []) {
    if (typeof p !== "object" || p === null) continue;
    const rec = p as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (id === "" || seen.has(id)) continue;
    const rawName = typeof rec.name === "string" ? rec.name.trim() : "";
    profiles.push({
      id,
      name: rawName === "" ? id : rawName,
      nutrition: fill(rec.nutrition as RawNutrition | undefined),
    });
    seen.add(id);
  }
  // "v2 gibi görünen ama tek geçerli profili olmayan" gövde: sarılacak bir sayı
  // da yok (v2'de hedefler profillerin İÇİNDE). Sıfır hedefe düşülür.
  if (profiles.length === 0) return singleProfileConfig(fill(undefined));

  const rawDefault = typeof o.defaultProfileId === "string" ? o.defaultProfileId : "";
  const defaultProfileId = seen.has(rawDefault) ? rawDefault : profiles[0].id;

  const weekday: Record<number, string> = {};
  if (typeof o.weekday === "object" && o.weekday !== null) {
    for (const [k, v] of Object.entries(o.weekday as Record<string, unknown>)) {
      const dow = Number(k);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
      if (typeof v === "string" && v !== "") weekday[dow] = v;
    }
  }

  const overrides: Record<string, string> = {};
  if (typeof o.overrides === "object" && o.overrides !== null) {
    for (const [date, v] of Object.entries(o.overrides as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (typeof v === "string" && v !== "") overrides[date] = v;
    }
  }

  return { version: 2, profiles, defaultProfileId, weekday, overrides };
}

/** Alan yalnızca değeri varsa nesneye girer — `{barcode: undefined}` yazmak
 *  `"barcode" in alias` kontrolünü bozardı. */
function withOptional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

interface RawMeal {
  name: string;
  nutrition: RawNutrition;
  sources?: unknown;
  loggedAt?: unknown;
  category?: unknown;
}

const VALID_MEAL_CATEGORIES = new Set(["breakfast", "lunch", "dinner", "snack"]);

function parseLoggedAt(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

function parseMealCategory(raw: unknown): MealCategory | undefined {
  return typeof raw === "string" && VALID_MEAL_CATEGORIES.has(raw) ? (raw as MealCategory) : undefined;
}

interface RawData {
  /** v1 düz besin nesnesi YA DA v2 profil yapısı — bkz. `parseGoals`. */
  goals: unknown;
  days: Record<string, RawMeal[]>;
  aliases?: RawAlias[];
  config?: Record<string, unknown>;
}

/** Backend'den { goals, days, aliases } çeker; öğünleri MealItem'a dönüştürür. */
export async function fetchData(): Promise<AppData> {
  const res = await fetch("/api/data", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const raw = (await res.json()) as RawData;

  const days: Record<string, MealItem[]> = {};
  for (const [date, meals] of Object.entries(raw.days ?? {})) {
    days[date] = (meals ?? []).map((m, i) => {
      const parsedSources = parseSources(m.sources);
      const loggedAt = parseLoggedAt(m.loggedAt);
      const category = parseMealCategory(m.category);
      return {
        id: `${date}_${i}`,
        label: m.name,
        computed: fill(m.nutrition),
        ...(parsedSources ? { sources: parsedSources } : {}),
        ...(loggedAt ? { loggedAt } : {}),
        ...(category ? { category } : {}),
      };
    });
  }

  const aliases: Alias[] = (raw.aliases ?? []).map((a) => ({
    id: a.id,
    triggers: a.triggers ?? [],
    name: a.name,
    brand: a.brand ?? null,
    serving_g: a.serving_g ?? 100,
    nutrition: fill(a.nutrition),
    ...withOptional("units", parseUnits(a.units)),
    ...withOptional("barcode", optionalText(a.barcode)),
    ...withOptional("off_id", optionalText(a.off_id)),
    ...withOptional("recipe", parseRecipe(a.recipe)),
  }));

  return { goals: parseGoals(raw.goals), days, aliases, config: parseConfig(raw.config) };
}

// --- Yazma uçları -----------------------------------------------------------

export interface AliasPayload {
  id?: string;
  triggers: string[];
  name: string;
  brand: string | null;
  serving_g: number;
  nutrition: Nutrition;
  units?: AliasUnit[];
  /** Faz 4 alanları. GÖNDERİLMEZSE backend öncekini KORUR (`server/index.js`
   *  içindeki `carry()`), yani elle düzenlenen bir besinin barkodu silinmez.
   *  `JSON.stringify` `undefined` alanları düşürdüğü için "alanı yazma" ile
   *  "alanı hiç göndermeme" burada aynı şeydir — bu bilinçli.
   *  Alanı GERÇEKTEN temizlemek için açıkça `null` gönderilmelidir. */
  barcode?: string | null;
  off_id?: string | null;
  recipe?: Recipe;
}

/** Ortak yazma isteği: JSON gönderir, backend'in {error} mesajını yükseltir. */
async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? `API ${res.status}`);
  return json as T;
}

/** Günün TÜM öğünlerini değiştirir (upsert). */
export function saveDay(date: string, meals: MealPayload[]): Promise<{ ok: true }> {
  return mutate("/api/day", "POST", { date, meals });
}

export function deleteDay(date: string): Promise<{ ok: true }> {
  return mutate(`/api/day/${encodeURIComponent(date)}`, "DELETE");
}

/** Hedefleri v2 gövdesiyle yazar. Backend Faz 3a'dan beri bu şekli doğruluyor:
 *  `profiles` boş olmamalı, her profilin `id`/`name`'i boş olmayan metin,
 *  `nutrition`'ı besin benzeri; `defaultProfileId` var olan bir profili
 *  göstermeli (bkz. server/index.js `goalsError`). */
export function saveGoals(goals: GoalConfig): Promise<{ ok: true }> {
  return mutate("/api/goals", "PUT", goals);
}

/** id verilirse günceller, verilmezse backend yeni id üretir. */
export function saveAlias(alias: AliasPayload): Promise<{ ok: true; id: string }> {
  return mutate("/api/alias", "POST", alias);
}

export function deleteAlias(id: string): Promise<{ ok: true }> {
  return mutate(`/api/alias/${encodeURIComponent(id)}`, "DELETE");
}

/** Faz 2a: `/api/data`'nın `config` alanını doğrular. Anahtar başına değer düz nesne
 *  değilse o anahtar atlanır — bozuk bir config satırı tüm uygulamayı düşürmemeli. */
function parseConfig(raw: unknown): AppConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: AppConfig = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = v as Record<string, unknown>;
    }
  }
  return out;
}

/** Genel config anahtarı yazar (Faz 2a). `goals`/`seeded` sunucu tarafında reddedilir. */
export function saveConfig(key: string, value: Record<string, unknown>): Promise<{ ok: true; key: string }> {
  return mutate(`/api/config/${encodeURIComponent(key)}`, "PUT", value);
}
