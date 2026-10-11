import type { AppConfig, MealPayload, Nutrition, TemplateItem } from "../types";
import { ZERO_NUTRITION } from "../types";
import { datesDesc, mealsOf, type Days } from "./days";
import { addNutrition } from "./nutrition";
import { NUTRIENT_KEYS } from "./nutrients";
import { parseTemplateItems } from "./api";

// `TemplateItem` artık `types.ts`'te yaşıyor (bkz. oradaki not) — buradan
// yeniden dışa açılır ki mevcut tüketiciler (`ingredientDraft.ts` vb.)
// yollarını değiştirmek zorunda kalmasın.
export type { TemplateItem };

export interface MealTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
}

export interface TemplatesConfig {
  list: MealTemplate[];
}

export const EMPTY_TEMPLATES: TemplatesConfig = { list: [] };

/** Yazma yolu için HAM şablon listesi — `parseTemplatesConfig`'ten GEÇMEZ.
 *
 *  `config.templates`'in `PUT /api/config/templates` ile full-replace edildiği
 *  yerlerin TABANI bu olmalı. Parse edilmiş listeyi taban almak veri kaybıdır:
 *  parser adı boş kalemi (`:70`) ve 0 geçerli kaleme inen şablonu (`:90`)
 *  sessizce listeden çıkarır; kullanıcı görünmeyen o şablonu silemez ama
 *  sonraki şablon kaydı listeyi baştan yazarken onu SUNUCUDAN siler.
 *
 *  Yalnız yapısal doğrulama var (alan yoksa `[]`), içerik elemez — eleme =
 *  kayıp. Görüntüleme `parseTemplatesConfig` üzerinden kalmaya devam eder. */
export function templateList(config: AppConfig): MealTemplate[] {
  const raw = config.templates;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  const list = raw.list;
  if (!Array.isArray(list)) return [];
  return list as MealTemplate[];
}

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

    const validItems = parseTemplateItems(rec.items);

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

/** Şablon kalemlerini TEK öğün kaydına çevirir — `mealToTemplate`'in tersi.
 *
 *  N kalem N öğün olarak DEĞİL tek öğün olarak girer: öğün, malzemelerinin
 *  toplamıdır. `sources` birleştirilir, besin değeri `templateTotal` ile
 *  toplanır, ad kalem adlarının `" + "` birleşimidir (tek öğün tek ad
 *  taşıyabilir — `MealForm`/`DayView` aynı birleşimi kullanır).
 *
 *  `items` KORUNUR: kalem kırılımı (ad + besin + hafıza/gramaj bağlantısı)
 *  olduğu gibi yazılır. Önceden `sources`'ı OLMAYAN kalemin ADI kayıptı —
 *  `MealSource` yalnız `aliasId` tutar, öğünün adı ise tek alandır; kalem
 *  adı `items`'a yazılınca artık korunur (L21). Değer yine toplama karışır,
 *  gramajı her kalemin `items[].grams`'ında yaşar.
 *
 *  meal-flat `grams` YAZILMAZ: şablon çıktısı DAİMA `items` içerdiği için
 *  gram miktarı `items[].grams`'ta tutulur — aynı sayının ikinci kopyası
 *  (`sources`'un türevi olduğu gibi) er geç eskir.
 *
 *  `items` boşsa `null` — boş öğün uydurma kayıttır (L21). */
export function templateItemsToPayload(items: TemplateItem[], templateId: string): MealPayload | null {
  if (items.length === 0) return null;
  const sources = items.flatMap((it) => it.sources ?? []);
  return {
    name: items.map((it) => it.name).join(" + "),
    nutrition: templateTotal(items),
    ...(sources.length > 0 ? { sources } : {}),
    items,
    // Şablon kullanım sayacının kaynağı: gün verisinden türetilen indeks
    // ("en çok kullanılan 3 şablon") bu alandan beslenir. Yazılmazsa sayaç
    // sessizce hep 0 kalır ve sıralama hiç değişmez.
    templateId,
  };
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
