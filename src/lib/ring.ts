import { formatNumber } from "./format";

/** Çevrilebilir metin sözleşmesi: anahtar + hazır parametreler.
 *
 *  `ring.ts` SAF kalır — i18n'i tanımaz, aktif dili bilmez. Sayılar burada
 *  locale-duyarlı `formatNumber` ile biçimlendirilip METİN olarak taşınır, böylece
 *  çeviri anında binlik ayırıcı kaybolmaz. Çağıran bileşen
 *  `t(msg.key, msg.params)` yazar (bkz. `CalorieRing`). */
export interface RingMessage {
  key: string;
  params: Record<string, string>;
}

export interface RingState {
  hasTarget: boolean;
  pct: number;
  isOver: boolean;
  isMet: boolean;
  diff: number;
  headline: string;
  ratioText: string;
  caption: RingMessage;
  remaining: RingMessage;
  a11y: RingMessage;
}

export function ringState(consumed: number, target: number): RingState {
  const hasTarget = target > 0;
  const diff = target - consumed;
  const isOver = hasTarget && diff < -0.05;
  const isMet = hasTarget && Math.abs(diff) <= 0.05;
  const pct = hasTarget ? Math.min(100, Math.max(0, (consumed / target) * 100)) : 0;

  let headline: string;
  let caption: RingMessage;
  let remaining: RingMessage;
  let ratioText: string;

  if (!hasTarget) {
    headline = formatNumber(consumed);
    caption = { key: "ring.captionNoTarget", params: {} };
    remaining = { key: "ring.remainingNoTarget", params: { amount: formatNumber(consumed) } };
    ratioText = "";
  } else if (isMet) {
    headline = formatNumber(consumed);
    caption = { key: "ring.captionMet", params: {} };
    remaining = { key: "ring.remainingMet", params: {} };
    ratioText = `${formatNumber(consumed)} / ${formatNumber(target)}`;
  } else if (isOver) {
    headline = `+${formatNumber(Math.abs(diff))}`;
    caption = { key: "ring.captionOver", params: {} };
    remaining = { key: "ring.remainingOver", params: { amount: formatNumber(Math.abs(diff)) } };
    ratioText = `${formatNumber(consumed)} / ${formatNumber(target)}`;
  } else {
    headline = formatNumber(diff);
    caption = { key: "ring.captionLeft", params: {} };
    remaining = { key: "ring.remainingLeft", params: { amount: formatNumber(diff) } };
    ratioText = `${formatNumber(consumed)} / ${formatNumber(target)}`;
  }

  // Ekran okuyucu cümlesi. Kalan/özet ifadesi AYRI bir cümle olarak
  // kopyalanmaz: bileşen `remaining` metnini `status` parametresi olarak geçirir
  // (bkz. `CalorieRing`), böylece tek doğruluk kaynağı korunur.
  const a11y: RingMessage = hasTarget
    ? {
        key: "ring.a11y",
        params: { consumed: formatNumber(consumed), target: formatNumber(target) },
      }
    : { key: "ring.a11yNoTarget", params: { consumed: formatNumber(consumed) } };

  return { hasTarget, pct, isOver, isMet, diff, headline, ratioText, caption, remaining, a11y };
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
