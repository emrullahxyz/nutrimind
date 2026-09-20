import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createDoubleTapGate } from "../lib/doubleTap";
import type { DoubleTapOptions } from "../lib/doubleTap";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface UseDoubleTapResult {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  /** Masaüstü/Preview: gerçek fare çift tıklaması da aynı işi yapar (kamera
   *  yönünü masaüstünde de deneyebilmek için). */
  onDoubleClick: () => void;
}

/**
 * Çift dokunuş jestini `onDoubleTap`'e çevirir. Karar `lib/doubleTap.ts`te
 * (saf + testli); burada yalnızca olay kablosu var — projenin ayrım kuralı:
 * DOM'a bağlanmayan karar katmanı test edilebilir kalır (bkz. longPress.ts).
 *
 * İki olay kaynağı (pointer + dblclick) AYNI anda ateşlenebilir: masaüstünde
 * ikinci fare tıklaması hem `pointerup`ı hem `dblclick`i üretir. İkisini de
 * çalıştırmak geçişi iki kez yapıp kullanıcıyı başladığı yere döndürürdü —
 * bu yüzden gerçek bir jestten sonra gelen `dblclick` yutulur.
 */
export function useDoubleTap(
  onDoubleTap: () => void,
  options: DoubleTapOptions = {},
): UseDoubleTapResult {
  const cbRef = useRef(onDoubleTap);
  useEffect(() => {
    cbRef.current = onDoubleTap;
  }, [onDoubleTap]);

  const { maxGapMs, maxHoldMs, maxMovePx } = options;
  const gate = useMemo(
    () => createDoubleTapGate({ maxGapMs, maxHoldMs, maxMovePx }),
    [maxGapMs, maxHoldMs, maxMovePx],
  );

  /** Aynı yüzey kuralı: iki dokunuş AYNI elemana gelmeli (deklanşör ayrı bir
   *  elemandır ve bu yüzeye hiç ulaşmaz — ör. kamerada çekim düğmesi). */
  const keyOf = (e: ReactPointerEvent<HTMLElement>) =>
    (e.currentTarget as HTMLElement | null)?.dataset?.tapKey ?? "viewfinder";

  const lastFiredAt = useRef(0);

  const fire = useCallback(() => {
    lastFiredAt.current = now();
    cbRef.current();
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      gate.down(e.clientX, e.clientY, now(), keyOf(e));
    },
    [gate],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (gate.up(e.clientX, e.clientY, now(), keyOf(e))) fire();
    },
    [gate, fire],
  );

  const onPointerCancel = useCallback(() => gate.cancel(), [gate]);

  const onDoubleClick = useCallback(() => {
    // Pointer jesteri az önce ateşlendiyse bu olay onun kopyasıdır.
    if (now() - lastFiredAt.current < 500) return;
    fire();
  }, [fire]);

  return { onPointerDown, onPointerUp, onPointerCancel, onDoubleClick };
}
