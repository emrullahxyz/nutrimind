export type Easing = (t: number) => number;
export type RoundMode = "round" | "floor" | "none";

// Cubic ease-out: 1 - (1-t)^3
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

// WeekBars'ın MEVCUT eğrisi — birebir kopyala, değiştirme:
// t < 0.25: lineer 0 → 0.7
// t >= 0.25: kalan %75 üzerinde 1-(1-x)^2.5 ile 0.7 → 1.0
export const easeShowcase: Easing = (t) => {
  if (t < 0.25) return (t / 0.25) * 0.7;
  const remaining = (t - 0.25) / 0.75;
  return 0.7 + (1 - Math.pow(1 - remaining, 2.5)) * 0.3;
};

export function progressAt(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(Math.max(elapsedMs / durationMs, 0), 1);
}

function applyRound(value: number, round: RoundMode): number {
  if (round === "round") return Math.round(value);
  if (round === "floor") return Math.floor(value);
  return value;
}

export function valueAtElapsed(a: {
  from: number;
  to: number;
  elapsedMs: number;
  durationMs: number;
  ease?: Easing;
  round?: RoundMode;
}): number {
  const { from, to, elapsedMs, durationMs, ease = easeOutCubic, round = "round" } = a;
  const p = progressAt(elapsedMs, durationMs);
  if (p >= 1) return applyRound(to, round);
  const eased = ease(p);
  return applyRound(from + (to - from) * eased, round);
}

// DOM-korumalı: node ortamında false döner, throw etmez
export function prefersReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  try {
    return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
