import { useEffect, useRef, useState } from "react";

/**
 * Custom React hook that smoothly animates a number from its previous value
 * to the new target value using requestAnimationFrame.
 */
export function useAnimatedNumber(targetValue: number, duration = 400): number {
  const [current, setCurrent] = useState<number>(targetValue);
  const prevTargetRef = useRef<number>(targetValue);

  useEffect(() => {
    const startValue = current;
    const diff = targetValue - startValue;

    if (diff === 0) {
      prevTargetRef.current = targetValue;
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic function for smooth decelerating animation
      const ease = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(startValue + diff * ease);
      setCurrent(nextVal);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        prevTargetRef.current = targetValue;
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [targetValue, duration]);

  return current;
}
