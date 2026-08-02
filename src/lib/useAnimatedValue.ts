import { useEffect, useRef, useState } from "react";
import { type Easing, type RoundMode, easeOutCubic, valueAtElapsed, prefersReducedMotion } from "./animation";

export interface AnimatedValueOptions {
  durationMs?: number;
  delayMs?: number;
  ease?: Easing;
  round?: RoundMode;
}

export function useAnimatedValue(target: number, opts?: AnimatedValueOptions): number {
  const {
    durationMs = 750,
    delayMs = 0,
    ease = easeOutCubic,
    round = "round",
  } = opts ?? {};

  const displayRef = useRef(target);
  const [display, setDisplay] = useState(target);
  const easeRef = useRef(ease);
  easeRef.current = ease;

  useEffect(() => {
    const from = displayRef.current;
    if (from === target || prefersReducedMotion() || durationMs <= 0) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    let frame = 0;
    let startTs: number | null = null;

    function commit(v: number) {
      displayRef.current = v;
      setDisplay(v);
    }

    function step(ts: number) {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const v = valueAtElapsed({
        from,
        to: target,
        elapsedMs: elapsed,
        durationMs,
        ease: easeRef.current,
        round,
      });
      commit(v);
      if (elapsed < durationMs) {
        frame = requestAnimationFrame(step);
      }
    }

    if (delayMs > 0) {
      const timer = setTimeout(() => {
        frame = requestAnimationFrame(step);
      }, delayMs);
      return () => {
        clearTimeout(timer);
        if (frame) cancelAnimationFrame(frame);
      };
    }

    frame = requestAnimationFrame(step);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target, durationMs, delayMs, round]);

  return display;
}

export function useAnimatedPct(targetPct: number, delayMs = 50): number {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCurrent(targetPct);
      return;
    }
    const timer = setTimeout(() => setCurrent(targetPct), delayMs);
    return () => clearTimeout(timer);
  }, [targetPct, delayMs]);

  return current;
}
