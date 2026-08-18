import { useEffect, useRef, useState } from "react";
import { useTheme } from "../lib/theme";
import {
  type Easing,
  type RoundMode,
  easeOutCubic,
  prefersReducedMotion,
  valueAtElapsed,
} from "../lib/animation";

export interface ValueSpringOpts {
  /** Glass spring — yerleşme süresi (s). */
  response?: number;
  /** Glass spring — sönümleme oranı. */
  damping?: number;
  /** Velvet fallback — tween süresi (ms); mevcut davranışı birebir korumak için eşle. */
  tweenDurationMs?: number;
  /** Velvet fallback — tween başlangıç gecikmesi (ms). */
  tweenDelayMs?: number;
  /** Velvet fallback — tween eğrisi. */
  tweenEase?: Easing;
  /** Yuvarlama. */
  round?: RoundMode;
}

/** Grafik değer geçişi: glass'ta kesilebilir spring, velvet'te mevcut tween
 *  (aynı `useAnimatedValue` davranışı). TEK hook — tema değişiminde hook
 *  sırası sabit kalır; davranış içeride `isGlass` ile seçilir. */
export function useValueSpring(target: number, opts?: ValueSpringOpts): number {
  const {
    response = 0.5,
    damping = 1,
    tweenDurationMs = 800,
    tweenDelayMs = 0,
    tweenEase = easeOutCubic,
    round = "round",
  } = opts ?? {};

  const { theme } = useTheme();
  const isGlass = theme === "glass";

  const displayRef = useRef(target);
  const velocityRef = useRef(0);
  const [display, setDisplay] = useState(target);

  const paramsRef = useRef({
    stiffness: Math.pow((2 * Math.PI) / response, 2),
    dampingCoeff: 2 * damping * ((2 * Math.PI) / response),
  });
  paramsRef.current = {
    stiffness: Math.pow((2 * Math.PI) / response, 2),
    dampingCoeff: 2 * damping * ((2 * Math.PI) / response),
  };

  const tweenRef = useRef({ durationMs: tweenDurationMs, ease: tweenEase });
  tweenRef.current = { durationMs: tweenDurationMs, ease: tweenEase };

  useEffect(() => {
    const from = displayRef.current;
    if (from === target || prefersReducedMotion() || tweenDurationMs <= 0) {
      displayRef.current = target;
      velocityRef.current = 0;
      setDisplay(target);
      return;
    }

    let frame = 0;
    let startTs: number | null = null;
    let lastTs: number | null = null;

    const commit = (v: number) => {
      displayRef.current = v;
      setDisplay(v);
    };

    const roundVal = (v: number) => {
      if (round === "floor") return Math.floor(v);
      if (round === "round") return Math.round(v);
      return v;
    };

    const step = (ts: number) => {
      if (isGlass) {
        if (lastTs === null) lastTs = ts;
        const dt = Math.min((ts - lastTs) / 1000, 0.05);
        lastTs = ts;
        const { stiffness, dampingCoeff } = paramsRef.current;
        velocityRef.current += (target - displayRef.current) * stiffness * dt;
        velocityRef.current *= 1 / (1 + dampingCoeff * dt);
        const nx = displayRef.current + velocityRef.current * dt;
        commit(roundVal(nx));
        if (Math.abs(target - nx) < 0.001 && Math.abs(velocityRef.current) < 0.01) {
          commit(target);
        } else {
          frame = requestAnimationFrame(step);
        }
      } else {
        if (startTs === null) startTs = ts;
        const { durationMs, ease } = tweenRef.current;
        const v = valueAtElapsed({
          from,
          to: target,
          elapsedMs: ts - startTs,
          durationMs,
          ease,
          round,
        });
        commit(v);
        if (ts - startTs < durationMs) {
          frame = requestAnimationFrame(step);
        }
      }
    };

    const begin = () => {
      frame = requestAnimationFrame(step);
    };

    if (tweenDelayMs > 0) {
      const timer = setTimeout(begin, tweenDelayMs);
      return () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
      };
    }
    begin();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, round, tweenDurationMs, tweenDelayMs, isGlass]);

  return display;
}
