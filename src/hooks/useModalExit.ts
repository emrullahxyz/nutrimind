import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "../lib/theme";

/**
 * Glass temasında overlay kapanışında kısa bir çıkış animasyonu oynatır
 * (girişle simetrik), velvet ya da reduced-motion'da anında `close()` çağırır
 * — Modal.tsx `beginClose` deseninin legacy overlay'ler için birebir kopyası.
 *
 * `useModalHistory` ÇAĞIRMAZ: hook yalnızca kendisine verilen `close`'u sarar.
 * Belgelenen asimetri: donanım geri tuşu / Escape `beginClose`'u atlar ve
 * doğrudan `close()`'a gider (Modal.tsx ile aynı davranış).
 */
export function useModalExit(close: () => void): {
  closing: boolean;
  beginClose: () => void;
} {
  const { theme } = useTheme();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
  }, []);

  const beginClose = useCallback(() => {
    if (closingRef.current) return;
    if (theme !== "glass" || reduceMotionRef.current) {
      close();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => {
      closingRef.current = false;
      close();
    }, 180);
  }, [theme, close]);

  return { closing, beginClose };
}
