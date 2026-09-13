// ============================================================================
// Nutrimind — öğün uzun-bas menüsünün SAF kararları.
//
// Menü görseli (`MealActionSheet`) yalnızca buradaki kararları çizer: hangi
// aksiyon kapalı, hangi adımda hangi içerik, şablon/kopya/tarif ön dolgusu ne
// olacak. Böylece davranış jsdom olmadan (projenin test kültürü) doğrulanabilir.
// ============================================================================
import type { Alias, MealItem, MealPayload, RecipeIngredient } from "../types";
import { newTemplateId } from "./templates";
import type { MealTemplate } from "./templates";
import { scaleNutrition, toGrams, unitOptions } from "./nutrition";

/** Menüdeki aksiyonlar — dizi sırası ekrandaki sıradır. */
export type MealMenuActionId = "template" | "duplicate" | "edit" | "select" | "recipe" | "delete";

export const MEAL_MENU_ACTIONS: readonly MealMenuActionId[] = [
  "template",
  "duplicate",
  "edit",
  "select",
  "recipe",
  "delete",
];

export interface MealMenuContext {
  /** Bir yazma sürüyor — çift tetiklemeyi engellemek için hepsi kapanır. */
  busy: boolean;
  /** Çevrimdışı: yalnızca şablon kaydetme kapanır (aşağıya bak). */
  offline: boolean;
  /** Öğünün kaynakları hafızada hâlâ çözülebiliyor mu (bkz. `canSaveAsRecipe`).
   *  `false` ise tarif aksiyonu HİÇ gösterilmez. */
  recipeReady: boolean;
}

export interface MealMenuAction {
  id: MealMenuActionId;
  disabled: boolean;
}

/** Menüde GÖRÜNECEK aksiyonlar ve hangileri pasif.
 *
 *  `busy` iken HEPSİ kapalı (mutate→refetch sürerken ikinci yazma açılmasın).
 *  Çevrimdışıyken YALNIZCA şablon kaydetme kapanır: `updateConfig` kuyruğa
 *  girmiyor, doğrudan `offline.writeUnavailable` fırlatıyor (bkz. `data.tsx`).
 *  Silme ve çoğaltma gün yazımıdır — kuyruğa girer, çalışmaya devam eder.
 *
 *  Tarif aksiyonu PASİF değil, LİSTEDEN ÇIKAR: malzemesi çözülemeyen bir
 *  öğünde tarif yalnızca "1 porsiyon, gramı sen bul" diye açılıyordu — karşılığı
 *  olmayan bir satır göstermek yerine hiç gösterilmez (Apple §6: her öğe
 *  yerini kazanır). */
export function mealMenuActions(ctx: MealMenuContext): MealMenuAction[] {
  return MEAL_MENU_ACTIONS.filter((id) => id !== "recipe" || ctx.recipeReady).map((id) => ({
    id,
    disabled: ctx.busy || (id === "template" && ctx.offline),
  }));
}

/** Şablon adı diyaloğunun ön dolgusu: öğünün kendi etiketi. */
export function templateNameSuggestion(meal: MealItem): string {
  return meal.label;
}

/** Öğünden şablon üretir — TEK kalem (öğünün toplamı) ve hafıza bağlantısı
 *  (`sources`) korunur. v0.26.2'de kaldırılan `saveAsTemplate` gövdesinin
 *  aynısı; tek fark adın artık kullanıcıdan gelmesi. */
export function mealToTemplate(meal: MealItem, name: string): MealTemplate {
  return {
    id: newTemplateId(),
    name: name.trim() || templateNameSuggestion(meal),
    items: [
      {
        name: meal.label,
        nutrition: meal.computed,
        ...(meal.sources ? { sources: meal.sources } : {}),
      },
    ],
  };
}

/** "Aynısını bugüne ekle" kopyası. `loggedAt`/`category` KORUNUR: dün 12:40'ta
 *  yenmiş öğle yemeği bugün de öğle başlığının altında görünür — saat yeniden
 *  "şimdi" yapılsaydı kopya yanlış kategoriye düşerdi. */
export function duplicatePayload(meal: MealItem): MealPayload {
  return {
    name: meal.label,
    nutrition: meal.computed,
    ...(meal.sources ? { sources: meal.sources } : {}),
    ...(meal.loggedAt ? { loggedAt: meal.loggedAt } : {}),
    ...(meal.category ? { category: meal.category } : {}),
  };
}

export interface RecipePreset {
  name: string;
  triggers: string[];
  /** Gram toplamı bilinemiyorsa 0 — `RecipeBuilder` kaydı zaten `totalG > 0` ister. */
  totalG: number;
  ingredients: RecipeIngredient[];
}

/** Öğün adından tetikleyici önerisi (küçük harf, en fazla 40 karakter). */
export function triggerFromMealName(name: string): string {
  return name.trim().toLocaleLowerCase("tr").slice(0, 40).trim();
}

/** Tek elle kaleme düşen ön dolgu: öğünün toplamı tek "porsiyon" kalemi olur,
 *  gram toplamı kullanıcıya bırakılır (tarif per-100g hesabının paydası). */
function manualPreset(meal: MealItem): RecipePreset {
  return {
    name: meal.label,
    triggers: [triggerFromMealName(meal.label)].filter(Boolean),
    totalG: 0,
    ingredients: [{ name: meal.label, qty: 1, unit: "porsiyon", nutrition: meal.computed }],
  };
}

/** Öğünü tarif ön dolgusuna çevirir. Kaynakların TAMAMI hafızada hâlâ duruyorsa
 *  gerçek kalemler + gram toplamı üretilir; en az biri çözülemezse (hafıza
 *  kaydı silinmiş, kaynak yok) tek elle kaleme düşülür. */
export function buildRecipePreset(meal: MealItem, aliases: Alias[]): RecipePreset {
  const byId = new Map(aliases.map((a) => [a.id, a]));
  const sources = meal.sources ?? [];
  if (sources.length === 0) return manualPreset(meal);

  const ingredients: RecipeIngredient[] = [];
  let totalG = 0;

  for (const source of sources) {
    const alias = byId.get(source.aliasId);
    if (!alias) return manualPreset(meal);

    const units = unitOptions(alias.units);
    const normalizedSourceUnit = source.unit.trim().toLocaleLowerCase("tr");
    const unit = units.find(
      (candidate) => candidate.name.trim().toLocaleLowerCase("tr") === normalizedSourceUnit,
    );
    // `parseSources` yalnızca birim adının metin olduğunu doğrular; eski veya
    // elle değiştirilmiş kayıtlarda bilinmeyen birim gelebilir. Bunu gram kabul
    // etmek 2 "adet"i sessizce 2 g yapar ve tarifin 100 g hesabını bozar.
    if (!unit) return manualPreset(meal);
    const grams = toGrams(source.qty, unit);

    ingredients.push({
      aliasId: alias.id,
      name: alias.name,
      qty: source.qty,
      unit: unit.name,
      nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
    });
    totalG += grams;
  }

  return {
    name: meal.label,
    triggers: [triggerFromMealName(meal.label)].filter(Boolean),
    totalG: Math.round(totalG),
    ingredients,
  };
}

/** "Tarif olarak kaydet" bu öğe için anlamlı mı?
 *
 *  Yalnızca kaynakların TAMAMI çözüldüğünde (her malzeme hafızada duruyor ve
 *  gramı hesaplanabiliyor) `true`. Kaynaksız elle girilmiş öğünde `totalG`
 *  bilinemez, dolayısıyla 100 g başına değer de hesaplanamaz — aksiyon o
 *  durumda menüde görünmez. */
export function canSaveAsRecipe(meal: MealItem, aliases: Alias[]): boolean {
  return buildRecipePreset(meal, aliases).totalG > 0;
}

// ---------------------------------------------------------------------------
// Sheet adım makinesi — menü → (isim diyaloğu | sil onayı) → menü/closed.
// Tek `Modal` içinde yaşar; ikinci bir modal katmanı AÇILMAZ (geri tuşu
// yığını da bu yüzden tek giriş kalır).
// ---------------------------------------------------------------------------
export type MealSheetStep = "closed" | "menu" | "templateName" | "confirmDelete";

export type MealSheetEvent =
  | { type: "open" }
  | { type: "choose"; id: MealMenuActionId }
  | { type: "back" }
  | { type: "close" };

export function mealSheetReducer(step: MealSheetStep, event: MealSheetEvent): MealSheetStep {
  switch (event.type) {
    case "open":
      return "menu";
    case "close":
      return "closed";
    case "back":
      return step === "menu" ? "closed" : "menu";
    case "choose":
      // Adım içi bir seçim menüye ait değilse yok sayılır (çift tetikleme).
      if (step !== "menu") return step;
      if (event.id === "template") return "templateName";
      if (event.id === "delete") return "confirmDelete";
      return "closed";
  }
}
