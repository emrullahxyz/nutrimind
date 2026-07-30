// ============================================================================
// Nutrimind — backend'den canlı veri (/api/data). SQLite'a bağlı Node servisi.
// ============================================================================
import type { Alias, MealItem, MealPayload, Nutrition } from "../types";
import { NUTRIENT_KEYS, makeNutrition } from "./nutrients";
import type { NutrientKey } from "./nutrients";

export interface AppData {
  goals: Nutrition;
  days: Record<string, MealItem[]>;
  aliases: Alias[];
}

/** Backend'den gelen ham besin nesnesi: alanlar eksik ya da `null` olabilir. */
type RawNutrition = Partial<Record<NutrientKey, number | null>>;

/** Ham JSON'u `Nutrition`'a tamamlar.
 *  Çekirdek 5 alan eksikse 0'a düşer (eski `?? 0` davranışı, `makeNutrition`
 *  tabanı). Mikro alanlarda "bilinmiyor" ≠ "sıfır": eksik ya da `null` mikro
 *  `undefined` KALIR, 0'a çevrilmez. */
function fill(n: RawNutrition | undefined): Nutrition {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const v = n?.[key];
    if (v === undefined || v === null) continue;
    out[key] = v;
  }
  return makeNutrition(out);
}

interface RawAlias {
  id: string;
  triggers: string[];
  name: string;
  brand?: string | null;
  serving_g?: number;
  nutrition: RawNutrition;
}

interface RawData {
  goals: RawNutrition;
  days: Record<string, { name: string; nutrition: RawNutrition }[]>;
  aliases?: RawAlias[];
}

/** Backend'den { goals, days, aliases } çeker; öğünleri MealItem'a dönüştürür. */
export async function fetchData(): Promise<AppData> {
  const res = await fetch("/api/data", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const raw = (await res.json()) as RawData;

  const days: Record<string, MealItem[]> = {};
  for (const [date, meals] of Object.entries(raw.days ?? {})) {
    days[date] = (meals ?? []).map((m, i) => ({
      id: `${date}_${i}`,
      label: m.name,
      computed: fill(m.nutrition),
    }));
  }

  const aliases: Alias[] = (raw.aliases ?? []).map((a) => ({
    id: a.id,
    triggers: a.triggers ?? [],
    name: a.name,
    brand: a.brand ?? null,
    serving_g: a.serving_g ?? 100,
    nutrition: fill(a.nutrition),
  }));

  return { goals: fill(raw.goals), days, aliases };
}

// --- Yazma uçları -----------------------------------------------------------

export interface AliasPayload {
  id?: string;
  triggers: string[];
  name: string;
  brand: string | null;
  serving_g: number;
  nutrition: Nutrition;
}

/** Ortak yazma isteği: JSON gönderir, backend'in {error} mesajını yükseltir. */
async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? `API ${res.status}`);
  return json as T;
}

/** Günün TÜM öğünlerini değiştirir (upsert). */
export function saveDay(date: string, meals: MealPayload[]): Promise<{ ok: true }> {
  return mutate("/api/day", "POST", { date, meals });
}

export function deleteDay(date: string): Promise<{ ok: true }> {
  return mutate(`/api/day/${encodeURIComponent(date)}`, "DELETE");
}

export function saveGoals(goals: Nutrition): Promise<{ ok: true }> {
  return mutate("/api/goals", "PUT", goals);
}

/** id verilirse günceller, verilmezse backend yeni id üretir. */
export function saveAlias(alias: AliasPayload): Promise<{ ok: true; id: string }> {
  return mutate("/api/alias", "POST", alias);
}

export function deleteAlias(id: string): Promise<{ ok: true }> {
  return mutate(`/api/alias/${encodeURIComponent(id)}`, "DELETE");
}
