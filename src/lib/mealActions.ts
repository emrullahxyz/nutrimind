// ============================================================================
// Nutrimind — öğün uzun-bas menüsünün SAF kararları.
//
// Menü görseli (`MealActionSheet`) yalnızca buradaki kararları çizer: hangi
// aksiyon kapalı, hangi adımda hangi içerik, şablon/kopya ön dolgusu ne
// olacak. Böylece davranış jsdom olmadan (projenin test kültürü) doğrulanabilir.
// ============================================================================
import type { MealItem, MealPayload, TemplateItem } from "../types";
import { sumMeals } from "./days";
import { categoryForLoggedAt } from "./mealCategory";
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
    // Kalem kırılımı varsa onu TAŞI (kalem sayısı korunur); yoksa mevcut
    // tek-kalem üretimi (öğünün toplamı + hafıza bağlantısı).
    items:
      meal.items && meal.items.length > 0
        ? meal.items
        : [
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
    ...(meal.items ? { items: meal.items } : {}),
    ...(meal.loggedAt ? { loggedAt: meal.loggedAt } : {}),
    ...(meal.category ? { category: meal.category } : {}),
  };
}

/** Seçilen öğünleri TEK öğüne katlar.
 *
 *  `items` — öğünlerden BİRİ bile kalem kırılımı taşıyorsa, birleşik öğün de
 *  kalem taşır ve `items` SEÇİLEN HER ÖĞÜNÜ kapsar: items'sız öğünün yemeği
 *  kayda (compute'a) girer ama kalem listesinde görünmezse gösterilen ≠
 *  kaydedilen olurdu (L20); ayrıca `mealSources` items varken YALNIZ
 *  `items[].sources` okuduğu için items'sız öğünün alias linki sessizce
 *  düşerdi. items'sız öğün için SENTETİK kalem üretilir (ad = öğün etiketi,
 *  besin = öğün toplamı, kaynak/gramaj bağlantısı varsa taşınır). Böylece
 *  `sources` = `items.flatMap(it.sources)` değişmezi korunur. items yolunda
 *  meal-flat `grams` YAZILMAZ (çift kopya; gram sentetik kalemin `grams`'ında).
 *
 *  Hiçbir öğün kalem taşımıyorsa (eski kayıtlar) MEVCUT davranış aynen kalır:
 *  `sources` KATLANIR (kalem SAYISI düşmez), `grams` TOPLANIR (`sources`'u
 *  OLMAYAN kalemlerin gramajı; sıfıra düşerse alan YAZILMAZ — `0` "gramaj
 *  bilinmiyor" ile "0 gram"ı ayırt etmez).
 *
 *  `templateId` BİLEREK taşınmaz: birleşik öğün iki farklı şablondan gelemez,
 *  hangisinin sayacağı belirsiz olurdu.
 *
 *  `loggedAt`/`category` en erken kaydınki (eskiden beri davranış): birleşik
 *  öğün günün ilk yemeğinin saatine ve kategorisine oturur. */
export function mergePayloads(selected: MealItem[], name: string): MealPayload {
  const nutrition = sumMeals(selected);

  const byLoggedAt = selected
    .filter((m) => m.loggedAt)
    .sort((a, b) => a.loggedAt!.localeCompare(b.loggedAt!));
  const earliestLoggedAt = byLoggedAt[0]?.loggedAt;

  // Öğünlerden biri kalem kırılımı (`items`) taşıyorsa, birleşik öğün de kalem
  // taşımalı ve `items` SEÇİLEN HER ÖĞÜNÜ kapsamalı (yukarıdaki nota bak).
  if (selected.some((m) => m.items && m.items.length > 0)) {
    const items: TemplateItem[] = selected.flatMap((m) =>
      m.items && m.items.length > 0
        ? m.items
        : [{
            name: m.label,
            nutrition: m.computed,
            ...(m.sources && m.sources.length > 0 ? { sources: m.sources } : {}),
            ...(m.grams !== undefined && m.grams > 0 ? { grams: m.grams } : {}),
          }],
    );
    const sources = items.flatMap((it) => it.sources ?? []);
    return {
      name,
      nutrition,
      ...(items.length > 0 ? { items } : {}),
      ...(sources.length > 0 ? { sources } : {}),
      ...(earliestLoggedAt ? { loggedAt: earliestLoggedAt } : {}),
      ...(earliestLoggedAt ? { category: categoryForLoggedAt(earliestLoggedAt) } : {}),
    };
  }

  // Hiçbir öğün kalem taşımıyor (eski kayıtlar): mevcut davranış aynen.
  const sources = selected.flatMap((m) => m.sources ?? []);
  const grams = selected.reduce((sum, m) => sum + (m.grams ?? 0), 0);
  return {
    name,
    nutrition,
    ...(sources.length > 0 ? { sources } : {}),
    ...(grams > 0 ? { grams } : {}),
    ...(earliestLoggedAt ? { loggedAt: earliestLoggedAt } : {}),
    ...(earliestLoggedAt ? { category: categoryForLoggedAt(earliestLoggedAt) } : {}),
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
