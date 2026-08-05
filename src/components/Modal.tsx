import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Modal'ın KENDİ çağırdığı `history.back()`'in ürettiği `popstate`'i yut.
 *  Bu bayrak olmadan: temizlikteki `back()` asenkron bir `popstate` doğurur, o da
 *  (yeniden mount olmuşsa) yeni dinleyiciye düşer ve modalı kendi kendine kapatır.
 *  Modül düzeyinde, çünkü `popstate` global bir olay ve dinleyici o sırada
 *  unmount olmuş bileşene ait olabilir. */
let pendingProgrammaticBacks = 0;

/** Koyu tema modal kabuğu: masaüstünde ortalı, mobilde alttan sheet.
 *  Esc ya da zemine tıklama kapatır; açıkken arka plan kaydırması kilitlenir. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  fullScreen = false,
  contentRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const isPoppedRef = useRef(false);

  // `onClose`/`title` ref üzerinden okunuyor ki aşağıdaki geçmiş efekti YALNIZCA
  // mount/unmount'ta çalışsın. Bağımlılık dizisinde dursalardı efekt her render'da
  // yeniden kurulur, temizliği `history.back()` çağırır, geciken `popstate` yeni
  // dinleyiciye düşer ve modal KENDİ KENDİNİ kapatırdı. ScanSheet'te tam olarak bu
  // oluyordu (`requestClose` her render'da yeni bir fonksiyon) — kamera açılır
  // açılmaz tarayıcı kapanıyordu. Bu diziyi doldurma.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    // Modal açıldığında tarayıcı geçmişine push et
    window.history.pushState({ isModal: true, title: titleRef.current }, "");

    const handlePopState = () => {
      // Kendi temizliğimizin doğurduğu back() ise: yut, kapatma sayma.
      // Sayaç (boolean değil): üst üste iki temizlik iki back() doğurursa ikisi de
      // yutulmalı, yoksa bayrak takılı kalıp kullanıcının gerçek geri basışını yer.
      if (pendingProgrammaticBacks > 0) {
        pendingProgrammaticBacks -= 1;
        return;
      }
      isPoppedRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      // Kullanıcı X veya buton ile kapattıysa (popstate harici), history stack'i temizlemek için back() yap
      if (!isPoppedRef.current && window.history.state?.isModal) {
        pendingProgrammaticBacks += 1;
        window.history.back();
      }
    };
  }, []);

  const handleUserClose = () => {
    if (!isPoppedRef.current && window.history.state?.isModal) {
      window.history.back();
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleUserClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  // Odak yönetimi: açılışta odağı diyalog içine taşı, kapanışta açılmadan önceki
  // odaklı elemana geri döndür.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const dialogEl = dialogRef.current;
    const firstFocusable = dialogEl?.querySelector<HTMLElement>(focusableSelector);
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      dialogEl?.focus();
    }

    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const modalEl = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/85 backdrop-blur-md p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        // Tıklama mousedown anında da tam olarak backdrop üzerinde başladıysa kapat.
        // Modal içerisinden başlayan fare sürüklemelerinde mousedownTarget modal içi olacağı için kapanmaz.
        if (mouseDownTargetRef.current === e.currentTarget && e.target === e.currentTarget) {
          handleUserClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`anim-fadeup flex w-full flex-col overflow-hidden bg-elevated-2 shadow-float ${
          fullScreen
            ? "h-[100dvh] max-h-[100dvh] rounded-none border-none sm:max-w-xl sm:h-[92vh] sm:max-h-[92vh] sm:rounded-card sm:border sm:border-line"
            : "max-h-[85dvh] rounded-t-card border border-line sm:max-w-lg sm:max-h-[85vh] sm:rounded-card"
        }`}
      >
        <div className="flex-none p-3.5 sm:p-4 flex items-center justify-between gap-3 border-b border-line/40 bg-[#16171e] pad-safe-top">
          <h3 className="text-base font-extrabold text-ink-primary">{title}</h3>
          <button
            type="button"
            onClick={handleUserClose}
            aria-label="Kapat"
            className="rounded-pill border border-line px-3 py-1 text-sm text-ink-secondary transition hover:text-ink-primary"
          >
            ✕
          </button>
        </div>
        <div ref={contentRef} className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5">
          {children}
        </div>
        {footer && (
          <div className="flex-none border-t border-line/40 bg-[#16171e] px-4 py-3 sm:px-5 sm:py-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}
