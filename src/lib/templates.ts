import type { AppConfig, MealSource, Nutrition } from "../types";
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
