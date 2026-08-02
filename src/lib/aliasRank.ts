// ============================================================================
// Nutrimind — Bağlamsal Besin Sıralaması (Faz 1).
// ============================================================================
import type { Alias, GoalConfig } from "../types";
import { normalizeTr } from "./aliasFilter";
import { datesDesc, mealsOf, type Days } from "./days";
import { weekdayIndex } from "./format";
import { effectiveProfile } from "./goals";

export interface AliasUsageStats {
  count: number;
  lastDate: string;
  byWeekday: number[];
  byProfile: Record<string, number>;
  byMealIndex: number[];
}

export type UsageIndex = Map<string, AliasUsageStats>;

export interface RankContext {
  today: string;
  weekday: number;
  profileId: string;
  mealIndex: number;
}

/**
 * Tüm `days` verisinde TEK geçiş yaparak her alias için kullanım istatistiği toplar.
 */
export function buildUsageIndex(days: Days, goals: GoalConfig): UsageIndex {
  const index: UsageIndex = new Map();
  const dates = datesDesc(days);

  for (const date of dates) {
    const meals = mealsOf(days, date);
    if (!meals || meals.length === 0) continue;

    const weekday = weekdayIndex(date);
    const profileId = effectiveProfile(goals, date).id;

    for (let mealIdx = 0; mealIdx < meals.length; mealIdx++) {
      const meal = meals[mealIdx];
      if (!meal.sources || meal.sources.length === 0) continue;

      for (const source of meal.sources) {
        const aliasId = source.aliasId;
        if (!aliasId) continue;

        let stats = index.get(aliasId);
        if (!stats) {
          stats = {
            count: 0,
            lastDate: date,
            byWeekday: [0, 0, 0, 0, 0, 0, 0],
            byProfile: {},
            byMealIndex: [],
          };
          index.set(aliasId, stats);
        }

        stats.count += 1;

        if (!stats.lastDate || date > stats.lastDate) {
          stats.lastDate = date;
        }

        stats.byWeekday[weekday] = (stats.byWeekday[weekday] ?? 0) + 1;
        stats.byProfile[profileId] = (stats.byProfile[profileId] ?? 0) + 1;
        stats.byMealIndex[mealIdx] = (stats.byMealIndex[mealIdx] ?? 0) + 1;
      }
    }
  }

  return index;
}

/**
 * Sorgu varken eşleşme kalitesi skoru:
 * - name baştan eşleşme → 4
 * - name içinde eşleşme → 3
 * - brand eşleşme → 2
 * - triggers eşleşme → 1
 * Hiçbiri eşleşmezse → 0
 */
export function scoreQueryMatch(alias: Alias, query: string): number {
  const q = normalizeTr(query.trim());
  if (!q) return 0;

  let maxScore = 0;

  const nameNorm = normalizeTr(alias.name);
  if (nameNorm.startsWith(q)) {
    maxScore = Math.max(maxScore, 4);
  } else if (nameNorm.includes(q)) {
    maxScore = Math.max(maxScore, 3);
  }

  if (alias.brand && normalizeTr(alias.brand).includes(q)) {
    maxScore = Math.max(maxScore, 2);
  }

  if (alias.triggers.some((t) => normalizeTr(t).includes(q))) {
    maxScore = Math.max(maxScore, 1);
  }

  return maxScore;
}

/**
 * İndeksteki bir alias için bağlamsal skoru hesaplar.
 */
function computeContextScore(stats: AliasUsageStats | undefined, maxCount: number, ctx: RankContext): number {
  if (!stats || stats.count <= 0) return 0;

  const count = stats.count;

  // 1. Recency: üstel sönüm (decay).
  let recency = 0;
  if (stats.lastDate) {
    const lastTime = new Date(`${stats.lastDate}T00:00:00Z`).getTime();
    const todayTime = new Date(`${ctx.today}T00:00:00Z`).getTime();
    if (!isNaN(lastTime) && !isNaN(todayTime)) {
      const daysDiff = Math.max(0, Math.round((todayTime - lastTime) / 86_400_000));
      recency = Math.exp(-daysDiff / 7);
    }
  }

  // 2. Frequency (normalize)
  const frequency = count / maxCount;

  // 3. Weekday match
  const weekdayMatch = (stats.byWeekday[ctx.weekday] ?? 0) / count;

  // 4. Profile match
  const profileMatch = (stats.byProfile[ctx.profileId] ?? 0) / count;

  // 5. Meal index match
  const mealIndexMatch = (stats.byMealIndex[ctx.mealIndex] ?? 0) / count;

  // Ağırlıklı skor toplamı
  return recency * 3.0 + frequency * 2.0 + weekdayMatch * 1.0 + profileMatch * 1.0 + mealIndexMatch * 1.0;
}

/**
 * Besin listesini bağlamsal olarak ve (varsa) sorgu eşleşme kalitesine göre sıralar.
 * Eşit skorda mevcut dizi sırası korunur (stable sort).
 */
export function rankAliases(
  filtered: Alias[],
  index: UsageIndex,
  ctx: RankContext,
  query?: string,
): Alias[] {
  let maxCount = 1;
  for (const stats of index.values()) {
    if (stats.count > maxCount) {
      maxCount = stats.count;
    }
  }

  const trimmedQuery = query?.trim() ?? "";

  const items = filtered.map((alias, originalIdx) => {
    const queryScore = trimmedQuery ? scoreQueryMatch(alias, trimmedQuery) : 0;
    const contextScore = computeContextScore(index.get(alias.id), maxCount, ctx);
    return { alias, originalIdx, queryScore, contextScore };
  });

  items.sort((a, b) => {
    if (b.queryScore !== a.queryScore) {
      return b.queryScore - a.queryScore;
    }
    if (b.contextScore !== a.contextScore) {
      return b.contextScore - a.contextScore;
    }
    return a.originalIdx - b.originalIdx;
  });

  return items.map((item) => item.alias);
}
