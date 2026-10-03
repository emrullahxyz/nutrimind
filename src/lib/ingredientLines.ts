// Nutrimind — öğün kalem satırları (saf karar katmanı).
//
// `NutritionSheet` (günlük kayıt) ve şablon önizlemesi bu modülü çizer:
// sources çözülürse kalem listesi, çözülmezse null (toplam ekran aynen kalır).
// Swap gram korur: 150g tavuk → 150g tofu, makro yeniden hesaplanır.
import type { Alias, MealItem, MealSource, Nutrition } from "../types";
import { addNutrition, defaultUnitForAlias, scaleNutrition, toGrams, unitOptions } from "./nutrition";
import { roundNutrition } from "./ingredientDraft";
import { ZERO_NUTRITION } from "../types";

export interface IngredientLine {
  aliasId: string;
  name: string;
  qty: number;
  unit: string;
  grams: number;
  nutrition: Nutrition;
}

/** sources → çözülmüş kalemler. Tek kaynak çözülmezse null (kırılım yok). */
export function resolveMealIngredients(meal: MealItem, aliases: Alias[]): IngredientLine[] | null {
  const sources = meal.sources ?? [];
  if (sources.length === 0) return null;
  const byId = new Map(aliases.map((a) => [a.id, a]));
  const lines: IngredientLine[] = [];
  for (const s of sources) {
    const alias = byId.get(s.aliasId);
    if (!alias) return null;
    const units = unitOptions(alias.units);
    const norm = s.unit.trim().toLocaleLowerCase("tr");
    const unit = units.find((u) => u.name.trim().toLocaleLowerCase("tr") === norm);
    if (!unit) return null;
    const grams = toGrams(s.qty, unit);
    if (!(grams > 0)) return null;
    lines.push({
      aliasId: alias.id,
      name: alias.name,
      qty: s.qty,
      unit: unit.name,
      grams: Math.round(grams * 10) / 10,
      nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
    });
  }
  return lines;
}

/** Swap: gram korunur, miktar hedef alias'ın varsayılan birimine çevrilir. */
export function swapIngredientLine(line: IngredientLine, next: Alias): IngredientLine {
  const unit = defaultUnitForAlias(next);
  const qty =
    unit.grams > 0 ? Math.round((line.grams / unit.grams) * 10) / 10 : line.grams;
  return {
    aliasId: next.id,
    name: next.name,
    qty,
    unit: unit.name,
    grams: line.grams,
    nutrition: scaleNutrition(next.nutrition, next.serving_g, line.grams),
  };
}

/** Kalemlerden toplam besin + kayıt sources'u.
 *  Toplam 1 ondalığa yuvarlanır: `addNutrition` kayan nokta artığı bırakır
 *  (4 kalem → 42.800000000000004) ve bu `NutritionSheet`in girdi alanında
 *  olduğu gibi görünürdü — L20'nin kardeşi, gösterim veriyi tırnaklıyor.
 *  Yuvarlamanın kendisi `ingredientDraft.roundNutrition`'da yaşar — iki kopyası
 *  zamanla ayrışır. */
export function linesToMealParts(lines: IngredientLine[]): { nutrition: Nutrition; sources: MealSource[] } {
  let nutrition = { ...ZERO_NUTRITION };
  for (const l of lines) nutrition = addNutrition(nutrition, l.nutrition);
  return {
    nutrition: roundNutrition(nutrition),
    sources: lines.map((l) => ({ aliasId: l.aliasId, qty: l.qty, unit: l.unit })),
  };
}
