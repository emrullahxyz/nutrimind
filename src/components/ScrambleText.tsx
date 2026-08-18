import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../lib/animation";
import { scrambleProgress } from "../lib/scramble";

export function ScrambleText({
  text,
  durationMs = 1800,
  fps = 16,
  className = "",
}: {
  text: string;
  durationMs?: number;
  fps?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(text);
      return;
    }

    const start = performance.now();
    const frameInterval = 1000 / fps;
    let lastFrameTime = start;
    let timerId: number;

    const tick = () => {
      const now = performance.now();
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);

      if (now - lastFrameTime >= frameInterval || progress >= 1) {
        setDisplay(scrambleProgress(text, progress));
        lastFrameTime = now;
      }

      if (progress < 1) {
        timerId = window.setTimeout(tick, frameInterval / 2);
      }
    };

    timerId = window.setTimeout(tick, 0);
    return () => clearTimeout(timerId);
  }, [text, durationMs, fps]);

  return <span className={`inline-block tabular-nums ${className}`}>{display}</span>;
}
