import type { TrendStats } from "./trend";

/**
 * Rated gün sayısı 0'dan büyükse hedefe ulaşılan gün yüzdesini `%N` biçiminde (ör. `%85`) döner.
 * Rated gün sayısı 0 ise `—` döner.
 */
export function formatHitRatePct(onTargetDays: number, ratedDays: number): string {
  if (ratedDays <= 0) return "—";
  return `%${Math.round((onTargetDays / ratedDays) * 100)}`;
}

/**
 * TrendStats nesnesinden (onTargetDays ve ratedDays) hedef tutturma oranını biçimlendirir.
 */
export function formatTargetHitRate(stats: Pick<TrendStats, "onTargetDays" | "ratedDays">): string {
  return formatHitRatePct(stats.onTargetDays, stats.ratedDays);
}
