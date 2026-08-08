import { useEffect, useRef } from "react";
import { consumeProgrammaticBack, markProgrammaticBack } from "../lib/backStack";

// ============================================================================
// Tam-ekran modal/sheet açıp kapamanın tarayıcı geri tuşu/kaydırmasıyla
// entegrasyonu — açılışta `pushState`, `popstate`'te kapat, kapanışta kendi
// girdisini `history.back()` ile temizle. Bu MANTIK daha önce 7 ayrı yerde
// (Modal.tsx, ExerciseModal.tsx, BottomNav.tsx'in FAB menüsü, MealForm.tsx,
// AliasForm.tsx, RecipeBuilder.tsx, NutritionSheet.tsx) elle kopyalanmıştı —
// dördü (MealForm/AliasForm/RecipeBuilder/NutritionSheet) kapanışta
// `history.back()` yerine `replaceState` kullanıyordu, bu da geçmiş
// yığınında her açılışta bir "boş" girdi bırakıyordu (asla düzeltilmemiş,
// bilinen bir teknik borçtu). Bu hook tek, kanıtlanmış deseni (Modal.tsx'in
// `history.back()`+`markProgrammaticBack` sürümü) merkezileştiriyor.
//
// `onClose`'u BAĞIMLILIK DİZİSİNE KOYMA: çağıran taraf çoğu zaman inline bir
// fonksiyon geçirir (her render'da yeni referans). Dizide dursaydı efekt her
// render'da yeniden kurulur, temizliği `history.back()` çağırır, gecikmiş
// `popstate` YENİ dinleyiciye düşer ve modal kendi kendini kapatırdı —
// `ScanSheet` → `Modal` zincirinde tam olarak bu oluyordu (bkz. Modal.tsx'in
// eski yorumu). `onClose` bir ref üzerinden okunuyor, dizide yalnızca
// `active` var.
// ============================================================================

export interface UseModalHistoryOptions {
  /** false iken push/dinleme hiç kurulmaz — koşullu açık modaller için (ör.
   *  `isOpen`/`open` state'i olan bileşenler). Her zaman render edildiğinde
   *  mount olan bileşenler (Modal.tsx gibi) `true` sabit geçebilir. */
  active: boolean;
  /** Geri tuşu/kaydırma/X/backdrop/Escape — HEPSİ buraya düşer. */
  onClose: () => void;
}

export interface UseModalHistoryResult {
  /** X/backdrop/Escape gibi kullanıcı-tetikli kapanış yolları BUNU çağırmalı
   *  (doğrudan `onClose`'u DEĞİL) — pushlanmış girdi varsa önce `history.back()`
   *  ile temizler (bu da `handlePopState`'i tetikleyip `onClose`'u zaten
   *  çağırır); yoksa (`popstate` zaten tüketmişse) doğrudan `onClose` çağırır. */
  requestClose: () => void;
}

export function useModalHistory({ active, onClose }: UseModalHistoryOptions): UseModalHistoryResult {
  const isPoppedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    isPoppedRef.current = false;
    window.history.pushState({ isModal: true }, "");

    const handlePopState = (e: PopStateEvent) => {
      // Kendi temizliğimizin doğurduğu back() ise (ya da başka bir overlayin
      // temizliğinden gelen bir back() bize hiç ait değilse): yut, kapatma sayma.
      if (consumeProgrammaticBack(e)) return;
      isPoppedRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!isPoppedRef.current && window.history.state?.isModal) {
        markProgrammaticBack();
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose bilinçli olarak dışarıda, yukarıdaki nota bak
  }, [active]);

  const requestClose = () => {
    if (!isPoppedRef.current && window.history.state?.isModal) {
      window.history.back();
    } else {
      onCloseRef.current();
    }
  };

  return { requestClose };
}
