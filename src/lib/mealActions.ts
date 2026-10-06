// ============================================================================
// Nutrimind — öğün uzun-bas menüsünün SAF kararları.
//
// Menü görseli (`MealActionSheet`) yalnızca buradaki kararları çizer: hangi
// aksiyon kapalı, hangi adımda hangi içerik, şablon/kopya ön dolgusu ne
// olacak. Böylece davranış jsdom olmadan (projenin test kültürü) doğrulanabilir.
// ============================================================================
import type { MealItem, MealPayload } from "../types";
import { newTemplateId } from "./templates";
import type { MealTemplate } from "./templates";

/** Menüdeki aksiyonlar — dizi sırası ekrandaki sıradır. */
export type MealMenuActionId = "template" | "duplicate" | "edit" | "select" | "delete";

export const MEAL_MENU_ACTIONS: readonly MealMenuActionId[] = [
  "template",
  "duplicate",
  "edit",
  "select",
  "delete",
];

export interface MealMenuContext {
  /** Bir yazma sürüyor — çift tetiklemeyi engellemek için hepsi kapanır. */
  busy: boolean;
  /** Çevrimdışı: yalnızca şablon kaydetme kapanır (aşağıya bak). */
  offline: boolean;
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
 *  Silme ve çoğaltma gün yazımıdır — kuyruğa girer, çalışmaya devam eder. */
export function mealMenuActions(ctx: MealMenuContext): MealMenuAction[] {
  return MEAL_MENU_ACTIONS.map((id) => ({
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
