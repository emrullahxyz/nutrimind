import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./animation";
import { nextPull, shouldRefresh, startPull } from "./pullToRefresh";

/** Sayfa en üstteyken aşağı çekme jestini dinler, eşiği geçince `onRefresh()`'i
 *  çağırır. Sayfanın kendisi kaydırıldığı için (App.tsx'te iç overflow yok)
 *  `window.scrollY`'a bakar, belirli bir konteynerin scrollTop'una DEĞİL.
 *  `onRefresh` kendi içinde try/catch'lenir — başarısız bir yenileme
 *  uygulamanın global `stale` durumuna düşürülmemeli, sadece burada kısa bir
 *  hata gösterilir. */
function getScrollTop(): number {
  return (
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const armedRef = useRef(false);
  const startYRef = useRef<number | null>(null);
  const distanceRef = useRef(0);
  /** Efektin yeniden kurulmasını önleyen aynalar: `refreshing`/`onRefresh`
   *  değişince dinleyiciler sökülüp yeniden bağlanırsa jest ORTASINDA
   *  kaybolurdu (eski kodun bağımlılık dizisi tam olarak bunu yapıyordu). */
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    // ⚠️ `touchmove` NON-PASSIVE olmak ZORUNDA (çekme sırasında `preventDefault`
    // ile sayfa kaydırmasını iptal ediyoruz) — ama SÜREKLİ bağlı kalması iOS'ta
    // her kaydırma dokunuşunu JS'e bağımlı kılıyor ve takılma olarak hissediliyor.
    // Bu yüzden dinleyici yalnızca gerçekten çekilebilecek bir dokunuş
    // başladığında bağlanır (karar `lib/pullToRefresh.ts`, saf + testli) ve jest
    // bitince sökülür: normal kaydırma yolu bedava kalır.
    let moveAttached = false;

    function attachMove() {
      if (moveAttached) return;
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      moveAttached = true;
    }

    function detachMove() {
      if (!moveAttached) return;
      document.removeEventListener("touchmove", onTouchMove);
      moveAttached = false;
    }

    function onTouchMove(e: TouchEvent) {
      const step = nextPull({
        armed: armedRef.current,
        startY: startYRef.current,
        scrollTop: getScrollTop(),
        currentY: e.touches[0]?.clientY ?? 0,
      });
      armedRef.current = step.armed;
      if (step.preventDefault && e.cancelable) e.preventDefault();
      setPulling(step.pulling);
      setDistance(step.distance);
      distanceRef.current = step.distance;
      if (!step.armed) detachMove();
    }

    function resetGesture() {
      armedRef.current = false;
      startYRef.current = null;
      distanceRef.current = 0;
      setPulling(false);
      setDistance(0);
      detachMove();
    }

    function onTouchStart(e: TouchEvent) {
      const start = startPull(getScrollTop(), e.touches[0]?.clientY ?? 0, refreshingRef.current);
      armedRef.current = start.armed;
      startYRef.current = start.startY;
      if (start.armed) attachMove();
    }

    async function onTouchEnd() {
      if (!armedRef.current) {
        detachMove();
        return;
      }
      const shouldGo = shouldRefresh(distanceRef.current);
      resetGesture();
      if (!shouldGo) return;
      setRefreshing(true);
      setError(false);
      try {
        await onRefreshRef.current();
      } catch {
        setError(true);
      } finally {
        setRefreshing(false);
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", resetGesture);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", resetGesture);
      detachMove();
    };
  }, []);

  return { pulling, distance, refreshing, error, reducedMotion: prefersReducedMotion() };
}
