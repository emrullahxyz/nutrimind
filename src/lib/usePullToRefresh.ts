import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./animation";

const THRESHOLD = 64;

/** Sayfa en üstteyken aşağı çekme jestini dinler, eşiği geçince `onRefresh()`'i
 *  çağırır. Sayfanın kendisi kaydırıldığı için (App.tsx'te iç overflow yok)
 *  `window.scrollY`'a bakar, belirli bir konteynerin scrollTop'una DEĞİL.
 *  `onRefresh` kendi içinde try/catch'lenir — başarısız bir yenileme
 *  uygulamanın global `stale` durumuna düşürülmemeli, sadece burada kısa bir
 *  hata gösterilir. */
function getScrollTop(): number {
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const distanceRef = useRef(0);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (getScrollTop() > 2 || refreshing) {
        armed.current = false;
        return;
      }
      armed.current = true;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (!armed.current || startY.current === null) return;

      if (getScrollTop() > 2) {
        armed.current = false;
        setPulling(false);
        setDistance(0);
        distanceRef.current = 0;
        return;
      }

      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        armed.current = false;
        setPulling(false);
        setDistance(0);
        distanceRef.current = 0;
        return;
      }

      // Sadece belirgin bir eşikten sonra preventDefault — normal kaydırmayı bozma.
      if (delta > 8) {
        if (e.cancelable) e.preventDefault();
        setPulling(true);
        const dist = Math.min(delta * 0.5, THRESHOLD * 1.5);
        setDistance(dist);
        distanceRef.current = dist;
      }
    }

    async function onTouchEnd() {
      if (!armed.current) return;
      armed.current = false;
      const shouldRefresh = distanceRef.current >= THRESHOLD;
      setPulling(false);
      setDistance(0);
      distanceRef.current = 0;
      startY.current = null;
      if (!shouldRefresh) return;
      setRefreshing(true);
      setError(false);
      try {
        await onRefresh();
      } catch {
        setError(true);
      } finally {
        setRefreshing(false);
      }
    }

    function onTouchCancel() {
      armed.current = false;
      setPulling(false);
      setDistance(0);
      distanceRef.current = 0;
      startY.current = null;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchCancel);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [refreshing, onRefresh]);

  return { pulling, distance, refreshing, error, reducedMotion: prefersReducedMotion() };
}
