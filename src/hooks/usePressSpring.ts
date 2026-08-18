import { useMemo, useState } from "react";
import type { CSSProperties, PointerEventHandler } from "react";
import { useTheme } from "../lib/theme";
import { useSpring } from "./useSpring";

export interface PressSpringOpts {
  /** Basılıyken hedef ölçek (varsayılan 0.97 — animate skill reçetesi). */
  pressScale?: number;
  /** Basma anı tepki süresi (s) — anında küçülme. */
  pressResponse?: number;
  /** Bırakma tepki süresi (s) — yumuşak spring'li geri dönüş. */
  releaseResponse?: number;
}

export interface PressSpringReturn {
  style: CSSProperties | undefined;
  handlers: {
    onPointerDown?: PointerEventHandler;
    onPointerUp?: PointerEventHandler;
    onPointerLeave?: PointerEventHandler;
    onPointerCancel?: PointerEventHandler;
  };
}

/** Glass temasında kart basınç hissi: pointer-down'da hızlı küçülme,
 *  bırakınca spring'li yumuşak dönüş. Velvet'te no-op (byte-identity:
 *  class'lar korunur, inline transform üretilmez, olay dinleyicisi yok). */
export function usePressSpring(opts?: PressSpringOpts): PressSpringReturn {
  const { pressScale = 0.97, pressResponse = 0.12, releaseResponse = 0.35 } = opts ?? {};
  const { theme } = useTheme();
  const enabled = theme === "glass";

  const [pressed, setPressed] = useState(false);
  const scale = useSpring(pressed ? pressScale : 1, {
    response: pressed ? pressResponse : releaseResponse,
    damping: 1,
  });

  const handlers = useMemo<PressSpringReturn["handlers"]>(() => {
    if (!enabled) return {};
    return {
      onPointerDown: () => setPressed(true),
      onPointerUp: () => setPressed(false),
      onPointerLeave: () => setPressed(false),
      onPointerCancel: () => setPressed(false),
    };
  }, [enabled]);

  const style: CSSProperties | undefined = enabled
    ? { transform: `scale(${scale})` }
    : undefined;

  return { style, handlers };
}
