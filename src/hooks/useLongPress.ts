import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEventHandler, PointerEventHandler } from "react";
import { LONG_PRESS_MS, exceededMoveTolerance, shouldIgnorePressTarget } from "../lib/longPress";
import type { PressPoint } from "../lib/longPress";

/** Uzun basmayı doğuran basış — menünün hem çapası (satır dikdörtgeni caller'da)
 *  hem de basış kapısının (`usePressGate`) girdisi buradan gelir. */
export interface LongPressOrigin {
  pointerId: number | null;
  x: number;
  y: number;
}

export interface LongPressOpts {
  onLongPress: (origin: LongPressOrigin) => void;
  /** Kapalıyken hiç zamanlayıcı kurulmaz (ör. seçim modunda dokunma = seç). */
  enabled?: boolean;
  delayMs?: number;
}

export interface LongPressReturn {
  handlers: {
    onPointerDown: PointerEventHandler;
    onPointerMove: PointerEventHandler;
    onPointerUp: PointerEventHandler;
    onPointerLeave: PointerEventHandler;
    onPointerCancel: PointerEventHandler;
    onContextMenu: MouseEventHandler;
  };
  /** Parmak basılı ve eşik henüz dolmadı: satırdaki dolgu göstergesini açar.
   *  Süre `delayMs` ile aynı olduğu için dolgu %100'e ulaştığı an menü açılır
   *  (Apple §8: ara kareler sonucu işaret etsin). */
  holding: boolean;
  /** Uzun basma menüsü kapanırken / basış kapısı tıklamayı yutarken dışarıdan
   *  da temizlenebilsin. Böylece kapı paneli kapattıktan sonra ilk gerçek
   *  satır tıklamasını yanlışlıkla yutmaz. */
  clearClickSuppression: () => void;
  /** Uzun basma tetiklendikten SONRA gelen sentetik `click`'i yutar — yoksa
   *  aynı basış hem menüyü açar hem kartın `onClick`'ini (besin sheet'i) çalıştırır. */
  consumeClickSuppression: () => boolean;
}

/** Satırda uzun basma: `delayMs` boyunca hareket ETMEYEN basış menüyü açar.
 *
 *  Saf kararlar `src/lib/longPress.ts`'te; burada yalnızca pointer/zamanlayıcı
 *  kablosu var. İptal koşulları: toleransı aşan hareket, parmak kalkması,
 *  `pointercancel` ve sayfa kaydırması. */
export function useLongPress({
  onLongPress,
  enabled = true,
  delayMs = LONG_PRESS_MS,
}: LongPressOpts): LongPressReturn {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<PressPoint | null>(null);
  const pointerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const suppressionResetRef = useRef<number | null>(null);
  const releaseListenerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const callbackRef = useRef(onLongPress);

  // Dolgu göstergesi yalnızca aktif basış sırasında ekranda; her basışta
  // yeniden mount edildiği için CSS animasyonu baştan başlar.
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);
  const setHold = useCallback((value: boolean) => {
    if (holdingRef.current === value) return;
    holdingRef.current = value;
    setHolding(value);
  }, []);

  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (releaseListenerRef.current !== null) {
      window.removeEventListener("pointerup", releaseListenerRef.current, true);
      window.removeEventListener("pointercancel", releaseListenerRef.current, true);
      releaseListenerRef.current = null;
    }
    startRef.current = null;
    pointerRef.current = null;
    setHold(false);
  }, [setHold]);

  /** Native `click`, pointerup'dan hemen sonra gelir. Suppression'ı pointerup
   *  anında değil, bu event sırası tamamlandıktan sonra temizlemek gerekir;
   *  aksi halde menüyü Escape/X ile kapattıktan sonraki ilk normal satır
   *  tıklaması eski uzun-basın hayaleti yüzünden yutulurdu. */
  const scheduleSuppressionReset = useCallback(() => {
    if (!firedRef.current) return;
    if (suppressionResetRef.current !== null) {
      window.clearTimeout(suppressionResetRef.current);
    }
    // Normalde usePressGate bu callback'i click'i yuttuğu anda artık gerek
    // kalmadan bırakır; bu zamanlayıcı yalnızca tarayıcının click üretmediği
    // fallback yoludur. Pointerup → click aynı görevde sıralandığı için 0 ms
    // yeterlidir ve klavye tıklamasını eski jest artığı yüzünden yutmaz.
    suppressionResetRef.current = window.setTimeout(() => {
      suppressionResetRef.current = null;
      firedRef.current = false;
    }, 0);
  }, []);

  const clearClickSuppression = useCallback(() => {
    if (suppressionResetRef.current !== null) {
      window.clearTimeout(suppressionResetRef.current);
      suppressionResetRef.current = null;
    }
    firedRef.current = false;
  }, []);

  // Pointer capture bazı WebView/tarayıcı kombinasyonlarında pointerup'ı satıra
  // yeniden yönlendirmeyebilir. Basış başladığında pencereye tek-seferlik bir
  // release dinleyicisi takılır; böylece perdeye düşen pointerup bile kapıyı ve
  // suppression'ı doğru sırada ilerletir.
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  const finishPointer = useCallback(() => {
    cancel();
    scheduleSuppressionReset();
  }, [cancel, scheduleSuppressionReset]);

  useEffect(() => {
    return () => {
      if (suppressionResetRef.current !== null) {
        window.clearTimeout(suppressionResetRef.current);
      }
    };
  }, []);

  // Unmount'ta bekleyen zamanlayıcı kalmasın (unmount sonrası tetiklenen menü
  // = "hayalet" state güncellemesi).
  useEffect(() => cancel, [cancel]);

  // Kaydırma iptali `pointermove`'a bırakılamaz: pasif kaydırmada tarayıcı
  // pointer olaylarını kesebiliyor, `scroll` ise her yerde gelir.
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("scroll", cancel, { passive: true });
    return () => window.removeEventListener("scroll", cancel);
  }, [enabled, cancel]);

  const handlers = useMemo(() => {
    const onPointerDown: PointerEventHandler = (e) => {
      if (!enabled) return;
      // Yalnızca birincil basış (parmak / sol tık). Sağ tık `onContextMenu`'ye.
      if (e.button !== 0) return;
      // Satırdaki "⋮" butonunun kendi tıklaması var — orada menü tekrar açılmasın.
      if (shouldIgnorePressTarget(e.target)) return;

      // Çoklu dokunmada eski basışın zamanlayıcısı yeni basışa sızmasın.
      if (startRef.current) cancel();
      clearClickSuppression();
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      pointerRef.current = e.pointerId;
      // Pointer capture olmadan imleç/parmak satırdan ayrıldığında `pointermove`
      // ve `pointerup` başka hedeflere gider; zamanlayıcı da yanlışlıkla menüyü
      // açar. Capture, jesti başlangıç satırına bağlı tutar.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Eski tarayıcılar / test doubles capture desteklemeyebilir; pencere
        // release dinleyicisi yine de basışı güvenle sonlandırır.
      }
      const releaseListener = (event: PointerEvent) => {
        if (event.pointerId === e.pointerId) finishPointer();
      };
      releaseListenerRef.current = releaseListener;
      window.addEventListener("pointerup", releaseListener, true);
      window.addEventListener("pointercancel", releaseListener, true);
      setHold(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        const origin = startRef.current ?? { x: e.clientX, y: e.clientY };
        // Menü açılırken dolgu geri çekilir: basışın bittiğini gösterir.
        setHold(false);
        callbackRef.current({ pointerId: e.pointerId, x: origin.x, y: origin.y });
      }, delayMs);
    };

    const onPointerMove: PointerEventHandler = (e) => {
      if (!startRef.current) return;
      if (exceededMoveTolerance(startRef.current, { x: e.clientX, y: e.clientY })) cancel();
    };

    const onPointerLeave: PointerEventHandler = () => {
      // Pointer capture kayıp/uyumsuzsa pointermove gelmeden önce de satırdan
      // çıkılmış olabilir; uzun basma bir satıra ait jest olarak iptal edilir.
      if (startRef.current) finishPointer();
    };

    const onContextMenu: MouseEventHandler = (e) => {
      if (!enabled) return;
      // Mobilde yerleşik uzun-bas menüsü (metin seçimi/kopyala) açılmasın;
      // masaüstünde sağ tık da aynı menüyü açsın.
      e.preventDefault();
      // Android tarayıcıları uzun basmada `contextmenu`ü de gönderiyor; menü bu
      // basış için zaten açıldıysa ikinci kez açma (kapı `pointerId`siz kalır ve
      // sızıntı geri gelirdi).
      if (firedRef.current) return;
      const activePointer = startRef.current ? pointerRef.current : null;
      firedRef.current = true;
      cancel();
      callbackRef.current({ pointerId: activePointer, x: e.clientX, y: e.clientY });
      scheduleSuppressionReset();
    };

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerLeave,
      onPointerCancel: finishPointer,
      onContextMenu,
    };
  }, [enabled, delayMs, cancel, setHold, finishPointer]);

  const consumeClickSuppression = useCallback(() => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  }, []);

  return {
    handlers,
    holding,
    clearClickSuppression,
    consumeClickSuppression,
  };
}

/** Uzun basma açıkken satırda metin seçimini/native çağrı balonunu kapatır
 *  (iOS Safari `-webkit-touch-callout`, Android uzun-bas seçimi). */
export const longPressRowStyle: CSSProperties = {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
};
