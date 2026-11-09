import type { AIParseItem, Nutrition } from "../types";

export type MealJsonError = "syntax" | "schema" | "nutrition" | "amount" | "totals";
export type MealJsonResult =
  | { kind: "text" }
  | { kind: "invalid"; error: MealJsonError }
  | { kind: "valid"; items: AIParseItem[]; notice?: "parentTotals" };

const CORE = ["kcal", "protein", "carbs", "fat"] as const;
const KEYS = [...CORE, "fiber", "sugar", "satFat", "sodium"] as const;
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
function readItem(raw: unknown) {
  if (!isRecord(raw)) fail("schema");
  if (has(raw, "name") && (typeof raw.name !== "string" || !raw.name.trim())) fail("schema");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
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
  if (has(raw, "nutrition") && !isRecord(raw.nutrition)) fail("nutrition");
  for (const source of [raw, ...(isRecord(raw.nutrition) ? [raw.nutrition] : [])]) {
    for (const key of [...KEYS, "calories"] as const) {
      if (!has(source, key)) continue;
      const value = source[key];
      if (!nonnegative(value)) fail("nutrition");
      const target = key === "calories" ? "kcal" : key;
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

function readMeal(raw: unknown): { items: AIParseItem[]; fallback: boolean } {
  const parent = readItem(raw);
  if (has(parent.raw, "items")) fail("schema");
  if (!has(parent.raw, "ingredients")) {
    if (!parent.item) fail("nutrition");
    return { items: [parent.item], fallback: false };
  }
  if (!Array.isArray(parent.raw.ingredients)) fail("schema");
  // Validate every child before choosing a fallback; invalid supplied values
  // cannot disappear behind usable parent totals.
  const children = parent.raw.ingredients.map(readItem);
  if (children.some((child) => has(child.raw, "ingredients") || has(child.raw, "items"))) fail("schema");
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
    if (isRecord(raw) && has(raw, "items") && [...KEYS, "calories", "nutrition", "ingredients", "baseAmount", "portion_g", "amount", "unit"].some((key) => has(raw, key))) fail("schema");
    const entries = isRecord(raw) && has(raw, "items") ? raw.items : Array.isArray(raw) ? raw : [raw];
    if (!Array.isArray(entries) || entries.length === 0) fail("schema");
    const meals = entries.map(readMeal);
    return { kind: "valid", items: meals.flatMap((meal) => meal.items),
      ...(meals.some((meal) => meal.fallback) ? { notice: "parentTotals" as const } : {}) };
  } catch (error) {
    if (error instanceof InvalidJsonMeal) return { kind: "invalid", error: error.code };
    throw error;
  }
}
