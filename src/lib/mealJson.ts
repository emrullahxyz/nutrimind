import type { AIParseItem, Nutrition } from "../types";

export type MealJsonError = "syntax" | "schema" | "nutrition" | "amount" | "totals";
export type MealJsonResult =
  | { kind: "text" }
  | { kind: "invalid"; error: MealJsonError }
  | { kind: "valid"; items: AIParseItem[]; notice?: "parentTotals" | "perServing" };

const CORE = ["kcal", "protein", "carbs", "fat"] as const;
const KEYS = [...CORE, "fiber", "sugar", "satFat", "sodium"] as const;
const NUTRIENT_ALIASES = {
  calories: "kcal", calories_kcal: "kcal", protein_g: "protein", carbs_g: "carbs",
  fat_g: "fat", fiber_g: "fiber", sugar_g: "sugar", satFat_g: "satFat", sodium_mg: "sodium",
  energy_kcal: "kcal", carbohydrates: "carbs", carbohydrates_g: "carbs",
} as const;
const NUTRIENT_FIELDS = [...KEYS, ...Object.keys(NUTRIENT_ALIASES)];
const NAME_FIELDS = ["name", "meal", "meal_name", "food_name", "title", "label"];
const NUTRITION_FIELDS = ["nutrition", "nutrition_estimate", "nutrition_facts", "nutritional_values", "macros", "total_nutrition", "nutrition_total"];
const LIST_FIELDS = ["items", "meals", "foods"];
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const has = (v: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(v, key);
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

class InvalidJsonMeal extends Error {
  constructor(readonly code: MealJsonError) {
    super(code);
  }
}
function fail(code: MealJsonError): never {
  throw new InvalidJsonMeal(code);
}

/** Values describe the whole item, never per-unit values to multiply by amount.
 * Missing values stay missing until core completeness has been established. */
function readItem(input: unknown) {
  if (!isRecord(input)) fail("schema");
  let raw = input;
  const names = NAME_FIELDS.filter((key) => has(raw, key)).map((key) => raw[key]);
  if (names.some((value) => typeof value !== "string" || !value.trim())) fail("schema");
  const name = typeof names[0] === "string" ? names[0].trim() : "";
  if (names.some((value) => (value as string).trim() !== name)) fail("schema");
  raw = { ...raw, ...(name ? { name } : {}) };
  if (has(raw, "amount") && !nonnegative(raw.amount)) fail("amount");
  if (has(raw, "unit") && (typeof raw.unit !== "string" || !raw.unit.trim())) fail("amount");
  let baseAmount: number | undefined;
  for (const key of ["baseAmount", "portion_g"]) {
    if (!has(raw, key)) continue;
    const value = raw[key];
    if (!nonnegative(value) || value <= 0) fail("amount");
    if (baseAmount !== undefined && baseAmount !== value) fail("amount");
    baseAmount = value;
  }
  if (typeof raw.unit === "string" && raw.unit.trim().toLowerCase() === "g" && typeof raw.amount === "number" && raw.amount > 0) {
    if (baseAmount !== undefined && baseAmount !== raw.amount) fail("amount");
    baseAmount = raw.amount;
  }

  const fields: Partial<Nutrition> = {};
  const containers = NUTRITION_FIELDS.filter((key) => has(raw, key)).map((key) => raw[key]);
  if (containers.some((value) => !isRecord(value))) fail("nutrition");
  for (const source of [raw, ...containers as Record<string, unknown>[]]) {
    for (const key of NUTRIENT_FIELDS) {
      if (!has(source, key)) continue;
      const value = source[key];
      if (!nonnegative(value)) fail("nutrition");
      const target = (NUTRIENT_ALIASES[key as keyof typeof NUTRIENT_ALIASES] ?? key) as keyof Nutrition;
      if (fields[target] !== undefined && fields[target] !== value) fail("nutrition");
      fields[target] = value;
    }
  }
  const item: AIParseItem | undefined = name && CORE.every((key) => fields[key] !== undefined)
    ? { name, nutrition: { ...fields, fiber: fields.fiber ?? 0 } as Nutrition,
        ...(baseAmount !== undefined ? { baseAmount } : {}) }
    : undefined;
  return { raw, fields, item };
}

/** Absolute rounding allowance: 1 kcal, 0.1 g, 1 mg sodium; no relative
 * allowance that could hide large discrepancies in a large meal. */
function checkTotals(fields: Partial<Nutrition>, items: AIParseItem[]) {
  for (const key of KEYS) {
    const total = fields[key];
    if (total === undefined || items.some((it) => it.nutrition[key] === undefined)) continue;
    const sum = items.reduce((value, it) => value + it.nutrition[key]!, 0);
    const tolerance = key === "kcal" || key === "sodium" ? 1 : 0.1;
    if (Math.abs(total - sum) > tolerance + 1e-9) fail("totals");
  }
}

function readMeal(raw: unknown): { items: AIParseItem[]; fallback: boolean; perServing?: true } {
  if (isRecord(raw) && has(raw, "per_serving")) {
    // The recipe yield is metadata: these values already describe ONE serving.
    // Reject mixed bases rather than combining recipe totals with serving values.
    if (!isRecord(raw.per_serving) || [...NUTRIENT_FIELDS, ...NUTRITION_FIELDS, "ingredients", ...LIST_FIELDS, "baseAmount", "portion_g", "amount", "unit"].some((key) => has(raw, key))) fail("schema");
    if (has(raw, "servings") && (!nonnegative(raw.servings) || raw.servings <= 0)) fail("amount");
    if (["per_serving", "ingredients", "items", "servings"].some((key) => has(raw.per_serving as Record<string, unknown>, key))) fail("schema");
    const serving = readItem({ ...raw.per_serving, ...Object.fromEntries(NAME_FIELDS.filter((key) => has(raw, key)).map((key) => [key, raw[key]])) });
    if (!serving.item) fail("nutrition");
    return { items: [serving.item], fallback: false, perServing: true };
  }
  const parent = readItem(raw);
  if (has(parent.raw, "items")) fail("schema");
  if (!has(parent.raw, "ingredients")) {
    if (!parent.item) fail("nutrition");
    return { items: [parent.item], fallback: false };
  }
  if (isRecord(parent.raw.ingredients)) {
    // A quantity/recipe dictionary is descriptive metadata, not macro-bearing rows.
    // Preserve supplied meal totals and never infer cooked weight from raw ingredients.
    if (!parent.item) fail("nutrition");
    return { items: [parent.item], fallback: true };
  }
  if (!Array.isArray(parent.raw.ingredients)) fail("schema");
  // Validate every child before choosing a fallback; invalid supplied values
  // cannot disappear behind usable parent totals.
  const children = parent.raw.ingredients.map(readItem);
  if (children.some((child) => has(child.raw, "ingredients") || has(child.raw, "items") || has(child.raw, "per_serving"))) fail("schema");
  const active = children.filter((child) => child.raw.amount !== 0);
  if (active.some((child) => typeof child.raw.name !== "string" || !child.raw.name.trim())) fail("schema");
  if (active.length > 0 && active.every((child) => child.item !== undefined)) {
    const items = active.map((child) => child.item!);
    checkTotals(parent.fields, items);
    return { items, fallback: false };
  }
  if (!parent.item) fail("nutrition");
  return { items: [parent.item], fallback: active.length > 0 };
}

/** Recognize JSON before any network decision. Malformed JSON-looking input
 * stays local too; prose such as "2 eggs" remains ordinary AI input. */
export function parseMealJson(text: string): MealJsonResult {
  let source = text.trim();
  const fenced = source.startsWith("```");
  if (fenced) {
    const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(source);
    if (!fence) return { kind: "invalid", error: "syntax" };
    source = fence[1].trim();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    const looksJson = fenced || /^[{}\[\]"`]/.test(source)
      || /^(?:null|true|false)\b/.test(source)
      || /^(?:null|true|false|undefined|NaN|[+-]?Infinity)$/i.test(source)
      || /^[+-]?(?:\d|\.\d)[\d.eE+-]*$/.test(source);
    return looksJson ? { kind: "invalid", error: "syntax" } : { kind: "text" };
  }
  try {
    const lists = isRecord(raw) ? LIST_FIELDS.filter((key) => has(raw, key)) : [];
    if (lists.length > 1) fail("schema");
    if (isRecord(raw) && lists.length && [...NUTRIENT_FIELDS, "per_serving", ...NUTRITION_FIELDS, "ingredients", "baseAmount", "portion_g", "amount", "unit"].some((key) => has(raw, key))) fail("schema");
    const entries = isRecord(raw) && lists.length ? raw[lists[0]] : Array.isArray(raw) ? raw : [raw];
    if (!Array.isArray(entries) || entries.length === 0) fail("schema");
    const meals = entries.map(readMeal);
    return { kind: "valid", items: meals.flatMap((meal) => meal.items),
      ...(meals.some((meal) => meal.perServing) ? { notice: "perServing" as const }
        : meals.some((meal) => meal.fallback) ? { notice: "parentTotals" as const } : {}) };
  } catch (error) {
    if (error instanceof InvalidJsonMeal) return { kind: "invalid", error: error.code };
    throw error;
  }
}
