// ============================================================================
// Nutrimind — backend'den canlı veri (/api/data). SQLite'a bağlı Node servisi.
// ============================================================================
import type { Alias, MealItem, MealPayload, Nutrition } from "../types";

export interface AppData {
  goals: Nutrition;
  days: Record<string, MealItem[]>;
  aliases: Alias[];
}

function fill(n: Partial<Nutrition> | undefined): Nutrition {
  return {
    kcal: n?.kcal ?? 0,
    protein: n?.protein ?? 0,
    carbs: n?.carbs ?? 0,
    fat: n?.fat ?? 0,
    fiber: n?.fiber ?? 0,
  };
}

interface RawAlias {
  id: string;
  triggers: string[];
  name: string;
  brand?: string | null;
  serving_g?: number;
  nutrition: Partial<Nutrition>;
}

interface RawData {
  goals: Partial<Nutrition>;
  days: Record<string, { name: string; nutrition: Partial<Nutrition> }[]>;
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
