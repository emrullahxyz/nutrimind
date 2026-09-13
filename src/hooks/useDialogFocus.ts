import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  FOCUSABLE_SELECTOR,
  dialogFocusTop,
  nextTrapIndex,
  registerDialogFocus,
  unregisterDialogFocus,
} from "../lib/focusTrap";

// ============================================================================
// Nutrimind — tam-ekran diyalog/sheet odak yönetimi.
//
// Üç bileşende elle kopyalanmış aynı deseni (Modal, ScanSheet, MealActionSheet)
// tek yere toplar ve `aria-modal="true"` ilan edip hiç tuzak kurmayan
// bileşenlere (OnboardingModal) aynı davranışı verir:
//   1. açılışta odak diyaloğa taşınır (klavye/screen-reader yolu içeride başlar),
//   2. Tab/Shift+Tab diyaloğun İÇİNDE kalır (perdenin arkasına sızamaz),
//   3. Escape kapanışı yalnızca EN ÜSTTEKİ diyaloğa gider (iç içe iki katman
//      aynı olayda ikisi birden kapanmaz),
//   4. unmount'ta odak, açılıştan önce odaklı olan öğeye geri verilir
//      (kullanıcı yolunu kaybetmez — Apple §16 wayfinding).
//
// `onEscape` BİLİNÇLİ OLARAK bağımlılık dizisinde DEĞİL: çağıran taraf çoğu
// zaman inline bir fonksiyon geçirir, dizide dursaydı dinleyici her render'da
// yeniden kurulurdu. En güncel hâli ref üzerinden okunur (bkz.
// `useModalHistory`'nin `onClose` notu) — böylece `beginClose` kimliği
// değişse de Escape doğru fonksiyona ulaşır.
// ============================================================================

export interface UseDialogFocusOptions {
  /** Diyaloğun kapsayıcı elemanı (perde DEĞİL, panel/kart). */
  containerRef: RefObject<HTMLElement | null>;
  /** false iken hiçbir şey kurulmaz — koşullu açılan overlay'ler için. */
  active?: boolean;
  /** Escape. Yalnızca bu diyalog yığının tepesindeyken çağrılır. */
  onEscape?: () => void;
  /** Açılışta odak nereye gitsin: `"first"` ilk odaklanabilir öğe (Modal'ın
   *  mevcut davranışı), `"container"` panelin kendisi (başlık/`aria-label`
   *  duyurulur, satır üzerinde odak halkası oluşmaz), `false` hiç dokunma
   *  (bileşen kendi oto-odağını yönetiyorsa). */
  autoFocus?: "first" | "container" | false;
  /** Kapanışta odağı açılıştan önceki öğeye geri ver (varsayılan true). */
  restoreFocus?: boolean;
  /** Kapsayıcı odaklanabilir HÂLE geldi mi? `visibility: hidden` bir öğeye
   *  `focus()` çağrısı SESSİZCE başarısız olur (yerleşimi ölçülene kadar
   *  gizlenen paneller — ör. `MealActionSheet`). Ölçülen hata: odak çağrısı
   *  panel henüz gizliyken yapılıyordu ve bir daha denenmediği için odak
   *  gövdede (BODY) kalıyordu. Bayrak false→true olunca odak tekrar denenir;
   *  yalnızca odak GERÇEKTEN alındıysa "yapıldı" sayılır. Varsayılan true:
   *  açılışta görünür olan overlay'ler hiçbir şey geçmek zorunda değil. */
  ready?: boolean;
}

let dialogTokenSeq = 0;

/** Diyaloğun içindeki GÖRÜNÜR odaklanabilir öğeler. Görünürlük ölçütü
 *  `offsetParent` DEĞİL: `position: fixed` panellerde `offsetParent` null olur
 *  ve panel içindeki her öğe yanlışlıkla "gizli" sayılırdı. */
function focusablesIn(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

export function useDialogFocus({
  containerRef,
  active = true,
  onEscape,
  autoFocus = "first",
  restoreFocus = true,
  ready = true,
}: UseDialogFocusOptions): void {
  const tokenRef = useRef<string>("");
  if (!tokenRef.current) {
    dialogTokenSeq += 1;
    tokenRef.current = `nutri-dialog-${dialogTokenSeq}`;
  }
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  /** Odak bir kez alındı mı? `visibility: hidden` kapsayıcıda `focus()`
   *  sessizce başarısız olduğu için başarı ÖLÇÜLÜR, varsayılmaz. */
  const focusedRef = useRef(false);
  /** Kapanışta odağın döneceği öğe — odak paneli DEĞİŞTİRMEDEN yakalanır.
   *
   *  ÖLÇÜLEN HATA: bu yakalama, odağı taşıyan efektin ARDINDAN gelen ayrı bir
   *  efektte yapıldığı için `document.activeElement` artık panelin kendisiydi;
   *  kapanışta odak gövdeye (BODY) dönüyordu, açan butona değil. Bu yüzden
   *  yakalama ref'te tutulup odak denemesinden ÖNCE yapılır. */
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) {
      focusedRef.current = false;
      previouslyFocusedRef.current = null;
      return;
    }
    if (focusedRef.current || autoFocus === false || !ready) return;
    const container = containerRef.current;
    if (!container) return;
    if (previouslyFocusedRef.current === null) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    }
    if (autoFocus === "first") {
      (focusablesIn(container)[0] ?? container).focus();
    } else {
      container.focus();
    }
    focusedRef.current = container.contains(document.activeElement);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef sabit bir ref nesnesi
  }, [active, ready, autoFocus, containerRef]);

  useEffect(() => {
    if (!active) return;
    const token = tokenRef.current;
    const container = containerRef.current;
    if (previouslyFocusedRef.current === null) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    }

    registerDialogFocus(token);

    const onKeyDown = (e: KeyboardEvent) => {
      // Yalnızca en üstteki diyalog Escape'i sahiplenir: iç içe katmanlarda
      // tek basışta ikisi birden kapanmasın.
      const isTop = dialogFocusTop() === token;
      if (e.key === "Escape") {
        if (isTop) escapeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !isTop) return;
      const items = focusablesIn(container);
      if (items.length === 0) {
        e.preventDefault();
        container?.focus();
        return;
      }
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      const target = nextTrapIndex({ activeIndex, count: items.length, backwards: e.shiftKey });
      if (target === null) return;
      e.preventDefault();
      items[target]?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unregisterDialogFocus(token);
      const previous = previouslyFocusedRef.current;
      if (restoreFocus && previous && document.contains(previous)) {
        previous.focus();
      }
    };
    // containerRef/autoFocus/restoreFocus kimlikleri sabittir (ref nesnesi ve
    // literal); dizide yalnızca `active` değişir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef, autoFocus, restoreFocus]);
}
