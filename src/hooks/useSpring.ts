import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/animation";

export interface SpringOpts {
  /** Apple "response" — saniye; küçük = daha hızlı yerleşir. */
  response?: number;
  /** Sönümleme oranı: 1.0 kritik (overshoot yok), <1.0 zıplama. */
  damping?: number;
  /** Başlangıç hızı (birim/s) — sürüklenmeden spring'e el aktarımı. */
  initialVelocity?: number;
  /** Yakınsama toleransı. */
  precision?: number;
}

function paramsOf(response: number, damping: number) {
  const omega = (2 * Math.PI) / response;
  return { stiffness: omega * omega, dampingCoeff: 2 * damping * omega };
}

/** Kesilebilir, hız-farkında sayısal spring (rAF, yarı-kapalı Euler).
 *  Hedef değişince mevcut konum + hızdan devam eder (retarget). Apple'ın
 *  `response` + `damping` parametrelerini kullanır; damping 1.0 = kritik.
 *  `prefers-reduced-motion` açıkken anında hedefe atlar. */
export function useSpring(target: number, opts?: SpringOpts): number {
  const { response = 0.4, damping = 1, initialVelocity = 0, precision = 0.001 } = opts ?? {};

  const xRef = useRef(target);
  const vRef = useRef(initialVelocity);
  const [x, setX] = useState(target);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const paramsRef = useRef(paramsOf(response, damping));
  paramsRef.current = paramsOf(response, damping);

  useEffect(() => {
    if (prefersReducedMotion()) {
      xRef.current = target;
      vRef.current = 0;
      setX(target);
      return;
    }
    if (Math.abs(xRef.current - target) < precision && Math.abs(vRef.current) < precision) {
      xRef.current = target;
      vRef.current = 0;
      setX(target);
      return;
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    lastTsRef.current = null;

    const step = (ts: number) => {
      const last = lastTsRef.current;
      const dt = last === null ? 1 / 60 : Math.min((ts - last) / 1000, 0.05);
      lastTsRef.current = ts;

      const { stiffness, dampingCoeff } = paramsRef.current;
      vRef.current += (target - xRef.current) * stiffness * dt;
      vRef.current *= 1 / (1 + dampingCoeff * dt);
      const nx = xRef.current + vRef.current * dt;
      xRef.current = nx;
      setX(nx);

      if (Math.abs(target - nx) < precision && Math.abs(vRef.current) < precision) {
        xRef.current = target;
        vRef.current = 0;
        setX(target);
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, precision]);

  return x;
}
