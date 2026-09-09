import type { AppData, AliasPayload } from "./api";
import type { MealPayload } from "../types";
import type { OfflineOperation } from "./offlineCache";

function aliasFromPayload(id: string, alias: AliasPayload): AppData["aliases"][number] {
  return {
    id,
    triggers: alias.triggers,
    name: alias.name,
    brand: alias.brand,
    serving_g: alias.serving_g,
    nutrition: alias.nutrition,
    ...(alias.units ? { units: alias.units } : {}),
    ...(alias.defaultUnit ? { defaultUnit: alias.defaultUnit } : {}),
    ...(alias.barcode ? { barcode: alias.barcode } : {}),
    ...(alias.off_id ? { off_id: alias.off_id } : {}),
    ...(alias.recipe ? { recipe: alias.recipe } : {}),
  };
}

export function applyOperation(data: AppData, operation: OfflineOperation): AppData {
  switch (operation.kind) {
    case "save-day":
      return {
        ...data,
        days: {
          ...data.days,
          [operation.date]: operation.meals.map((meal, index) => ({
            id: `${operation.date}_${index}`,
            label: meal.name,
            computed: meal.nutrition,
            ...(meal.sources ? { sources: meal.sources } : {}),
            ...(meal.loggedAt ? { loggedAt: meal.loggedAt } : {}),
            ...(meal.category ? { category: meal.category } : {}),
          })),
        },
      };
    case "delete-day": {
      const days = { ...data.days };
      delete days[operation.date];
      return { ...data, days };
    }
    case "save-alias": {
      const alias = aliasFromPayload(
        operation.localId ?? operation.alias.id ?? operation.id,
        operation.alias,
      );
      const index = data.aliases.findIndex((item) => item.id === alias.id);
      const aliases = [...data.aliases];
      if (index >= 0) aliases[index] = alias;
      else aliases.push(alias);
      return { ...data, aliases };
    }
    case "delete-alias":
      return { ...data, aliases: data.aliases.filter((alias) => alias.id !== operation.aliasId) };
  }
}

export function projectOperations(data: AppData, operations: OfflineOperation[]): AppData {
  // conflict operasyonları da projeksiyona GİRER: kullanıcı cihaz sürümünü
  // (yaptığı değişikliği) görmeye devam eder, çözüm sırasında karar verebilir.
  return operations
    .filter(
      (operation) =>
        operation.status === "pending" ||
        operation.status === "failed" ||
        operation.status === "conflict",
    )
    .reduce(applyOperation, data);
}

/** Derin eşitlik — nesnelerde anahtar SIRASI önemsizdir; dizilerde ise sıra
 *  ANLAMLI kabul edilir (öğün/alias listeleri sırayla karşılaştırılır: meal
 *  id'si `date_index` olduğundan sunucu sırayı korur, sıra değişimi farktır). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && /network|fetch|offline|timeout/i.test(error.message))
  );
}
