import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../lib/animation";
import { scrambleProgress } from "../lib/scramble";

export function ScrambleText({
  text,
  durationMs = 1200,
  className = "",
}: {
  text: string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(text);
      return;
    }

    const start = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);

      setDisplay(scrambleProgress(text, progress));

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [text, durationMs]);

  return <span className={className}>{display}</span>;
}
