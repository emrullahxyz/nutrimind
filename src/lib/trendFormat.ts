/**
 * Rated gün sayısı 0'dan büyükse hedefe ulaşılan gün yüzdesini `%N` biçiminde (ör. `%85`) döner.
 * Rated gün sayısı 0 ise `—` döner.
 */
export function formatHitRatePct(onTargetDays: number, ratedDays: number): string {
  if (ratedDays <= 0) return "—";
  return `%${Math.round((onTargetDays / ratedDays) * 100)}`;
}
