import { formatNumber } from "./format";

export interface RingState {
  hasTarget: boolean;
  pct: number;
  isOver: boolean;
  isMet: boolean;
  diff: number;
  headline: string;
  caption: string;
  remainingText: string;
  ratioText: string;
  a11yLabel: string;
}

export function ringState(consumed: number, target: number): RingState {
  const hasTarget = target > 0;
  const diff = target - consumed;
  const isOver = hasTarget && diff < -0.05;
  const isMet = hasTarget && Math.abs(diff) <= 0.05;
  const pct = hasTarget ? Math.min(100, Math.max(0, (consumed / target) * 100)) : 0;

  let headline: string;
  let caption: string;
  let remainingText: string;
  let ratioText: string;

  if (!hasTarget) {
    headline = formatNumber(consumed);
    caption = "kcal \u00b7 hedef yok";
    remainingText = `${formatNumber(consumed)} kcal`;
    ratioText = "";
  } else if (isMet) {
    headline = formatNumber(consumed);
    caption = "Hedefe ula\u015f\u0131ld\u0131";
    remainingText = "Hedefe ula\u015f\u0131ld\u0131";
    ratioText = `${formatNumber(consumed)} / ${formatNumber(target)}`;
  } else if (isOver) {
    headline = `+${formatNumber(Math.abs(diff))}`;
    caption = "kcal a\u015f\u0131ld\u0131";
    remainingText = `+${formatNumber(Math.abs(diff))} kcal a\u015f\u0131ld\u0131`;
    ratioText = `${formatNumber(consumed)} / ${formatNumber(target)}`;
  } else {
    headline = formatNumber(diff);
    caption = "kcal kald\u0131";
    remainingText = `${formatNumber(diff)} kcal kald\u0131`;
    ratioText = `${formatNumber(consumed)} / ${formatNumber(target)}`;
  }

  const a11yLabel = hasTarget
    ? `Kalori: ${formatNumber(consumed)} / ${formatNumber(target)} kcal. ${remainingText}.`
    : `Kalori: ${formatNumber(consumed)} kcal. Hedef belirlenmemi\u015f.`;

  return { hasTarget, pct, isOver, isMet, diff, headline, caption, remainingText, ratioText, a11yLabel };
}

export function ringGradient(isOver: boolean, pct: number): string {
  const clampedPct = Math.min(100, Math.max(0, pct));
  if (clampedPct === 0) {
    return "conic-gradient(var(--ring-track) 0%, var(--ring-track) 100%)";
  }
  const mid = clampedPct * 0.55;
  if (isOver) {
    return `conic-gradient(var(--ring-over-deep) 0%, var(--ring-over) ${mid}%, var(--ring-over) ${clampedPct}%, var(--ring-track) ${clampedPct}%, var(--ring-track) 100%)`;
  }
  return `conic-gradient(var(--ring-deep) 0%, var(--ring-mid) ${mid}%, var(--ring-bright) ${clampedPct}%, var(--ring-track) ${clampedPct}%, var(--ring-track) 100%)`;
}
