import type { AppConfig, MealSource, Nutrition } from "../types";
import { ZERO_NUTRITION } from "../types";
import { datesDesc, mealsOf, type Days } from "./days";
import { addNutrition } from "./nutrition";
import { NUTRIENT_KEYS } from "./nutrients";
import { fill, parseSources } from "./api";

export interface TemplateItem {
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
  /** `sources`'ı OLMAYAN kalemlerin gramajı (gram).
   *
   *  Gramaj normalde `sources[].qty` içinde saklanır — ama `sources` bir
   *  `aliasId` gerektirir, ve kullanıcının ELLE girdiği ya da AI'ın döndüğü
   *  besin hafızada olmayabilir. O satırlarda miktar alanı görünür ama
   *  kayda giremezdi: kullanıcı 100 g yazıp kaydediyor, şablonu açtığında
   *  "Miktar bilinmiyor" yazıyordu (gösterilen ≠ kaydedilen, L20).
   *
   *  `sources` varsa bu alan YAZILMAZ — kaynak zaten miktarı taşıyor, iki
   *  yerde aynı sayının iki kopyası ise birinin güncellenip diğerinin
   *  eskimesi demektir. */
  grams?: number;
}

export interface MealTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
}

export interface TemplatesConfig {
  list: MealTemplate[];
}

export const EMPTY_TEMPLATES: TemplatesConfig = { list: [] };

/** `config.templates`'i doğrular. Savunmacı — bkz. `src/lib/waterSupplements.ts`'teki
 *  `parseWaterConfig`/`parseSupplementsConfig` deseni. Geçersiz şablon/kalem atlanır,
 *  hiçbiri tüm listeyi düşürmez. */
export function parseTemplatesConfig(config: AppConfig): TemplatesConfig {
  if (typeof config !== "object" || config === null) {
    return EMPTY_TEMPLATES;
  }
  const rawTemplates = config.templates;
  if (typeof rawTemplates !== "object" || rawTemplates === null || Array.isArray(rawTemplates)) {
    return EMPTY_TEMPLATES;
  }

  const rawList = rawTemplates.list;
  if (!Array.isArray(rawList)) {
    return EMPTY_TEMPLATES;
  }

  const list: MealTemplate[] = [];

  for (const item of rawList) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!id || !name) continue;

    if (!Array.isArray(rec.items)) continue;

    const validItems: TemplateItem[] = [];
    for (const rawItem of rec.items) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) continue;
      const itemRec = rawItem as Record<string, unknown>;
      const itemName = typeof itemRec.name === "string" ? itemRec.name.trim() : "";
      if (!itemName) continue;

      const nutrition = fill(itemRec.nutrition as Partial<Record<string, number | null>> | undefined);
      const sources = parseSources(itemRec.sources);
      // Yalnız POZİTİF ve sonlu gramaj: 0 "ölçtüm, sıfır gram" anlamına gelir,
      // kayıttaki belirsizliği çözmez. `sources` varsa alan yok sayılır —
      // miktar zaten orada taşınıyor.
      const rawGrams = itemRec.grams;
      const grams =
        !sources && typeof rawGrams === "number" && Number.isFinite(rawGrams) && rawGrams > 0 ? rawGrams : undefined;

      validItems.push({
        name: itemName,
        nutrition,
        ...(sources ? { sources } : {}),
        ...(grams !== undefined ? { grams } : {}),
      });
    }

    if (validItems.length > 0) {
      list.push({ id, name, items: validItems });
    }
  }

  return { list };
}

/** Yeni şablon kimliği (`t_` öneki) — bkz. `newSupplementId` deseni. */
export function newTemplateId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Şablonun toplam besin değeri — kart üzerinde gösterilmek üzere.
 *  `NutritionSheet`/`TemplatePreview` kendi satır toplamını ayrı hesaplar
 *  (onların satırları canlı taslak); buradaki kayıttaki kalemlerin toplamı. */
export function templateTotal(items: TemplateItem[]): Nutrition {
  let total: Nutrition = { ...ZERO_NUTRITION };
  for (const item of items) total = addNutrition(total, item.nutrition);
  const out: Nutrition = { ...total };
  for (const key of NUTRIENT_KEYS) {
    const v = out[key];
    // undefined ("bilinmiyor") 0'a çevrilmez — L21: uydurma veri.
    if (typeof v === "number") out[key] = Math.round(v * 10) / 10;
  }
  return out;
}

/** Şablon kullanım istatistiği. */
export interface TemplateUsageStats {
  count: number;
  lastDate: string;
}

export type TemplateUsageIndex = Map<string, TemplateUsageStats>;

/** Gün verisinden şablon kullanım indeksi — `aliasRank.buildUsageIndex`'in şablon
 *  karşılığı, tek geçiş. `aliasRank`'ın karma skoru burada YOK: şablon için
 *  hafta günü/profil/öğün sırası anlamsız, kullanıcı yalnızca "en çok kullandığı"
 *  diyor.
 *
 *  Sayaç config'te değil GÜN VERİSİNDEN türetilir: config yazmak offline'ta
 *  kapalı (docs/operations/offline.md) ve sayaç kayıt silinince sıfırlanırdı. */
export function buildTemplateUsageIndex(days: Days): TemplateUsageIndex {
  const index: TemplateUsageIndex = new Map();
  for (const date of datesDesc(days)) {
    for (const meal of mealsOf(days, date) ?? []) {
      const id = meal.templateId;
      if (!id) continue;
      const stats = index.get(id);
      if (!stats) {
        index.set(id, { count: 1, lastDate: date });
        continue;
      }
      stats.count += 1;
      if (date > stats.lastDate) stats.lastDate = date;
    }
  }
  return index;
}

/** Kullanıma göre sıralar: kullanım sayısı ↓, sonra son kullanma tarihi ↓, sonra
 *  LİSTEDEKİ SIra (stable). `rankAliases`'in `originalIdx` tiebreak'iyle aynı
 *  güvence — JS `sort` stable olsa da açık bağ, bir refactor'ın sessizce
 *  sıralamayı bozmasını engeller. Kullanılmamış şablonlar (count 0) listedeki
 *  sıralarını korur: geriye dönük uyum bozulmaz. */
export function rankTemplatesByUsage(
  list: MealTemplate[],
  usage: TemplateUsageIndex,
): MealTemplate[] {
  return list
    .map((template, originalIdx) => {
      const stats = usage.get(template.id);
      return { template, originalIdx, count: stats?.count ?? 0, lastDate: stats?.lastDate ?? "" };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.lastDate !== a.lastDate) return b.lastDate < a.lastDate ? -1 : 1;
      return a.originalIdx - b.originalIdx;
    })
    .map((entry) => entry.template);
}
