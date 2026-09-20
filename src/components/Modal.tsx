import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useModalHistory } from "../hooks/useModalHistory";
import { useTheme } from "../lib/theme";
import { useTranslation } from "react-i18next";

/** Koyu tema modal kabuğu: masaüstünde ortalı, mobilde alttan sheet.
 *  Esc ya da zemine tıklama kapatır; açıkken arka plan kaydırması kilitlenir. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  fullScreen = false,
  bleed = false,
  contentRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
  /** İçerik alanının kendi dolgusunu ve kaydırmasını kaldırır — içeriğin kenardan
   *  kenara dolduğu ekranlar için (kamera). `fullScreen` ile birlikte kullanılır. */
  bleed?: boolean;
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const { t } = useTranslation();

  // Geri tuşu/kaydırma/X/backdrop/Escape entegrasyonu artık ortak hook'ta —
  // bkz. `useModalHistory` için dosya başındaki not (yedi ayrı yerde elle
  // kopyalanmış aynı deseni tek yere topluyor). `Modal` her zaman yalnızca
  // açıkken mount edildiği için `active: true` sabit.
  const { requestClose: handleUserClose } = useModalHistory({ active: true, onClose });
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

  // Çıkış: yalnızca glass'ta kapanış kısa bir fade+scale oynatır (girişle simetrik),
  // velvet'te anında unmount korunur (byte-identity). Reduced-motion'da gecikme yok.
  // `closingRef` çıkış sürerken ikinci bir kapanma isteğini yutar (çift onClose).
  const beginClose = useCallback(() => {
    if (closingRef.current) return;
    if (theme !== "glass" || reduceMotionRef.current) {
      handleUserClose();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => {
      closingRef.current = false;
      handleUserClose();
    }, 180);
  }, [theme, handleUserClose]);

  // Body scroll kilidi artık paylaşılan, referans-sayaçlı mekanizmadan
  // geliyor (bkz. `useBodyScrollLock`) — Modal her zaman yalnızca açıkken
  // mount edildiği için koşulsuz `true` güvenli. ScanSheet gibi bileşenler
  // KENDİLERİ de aynı hook'u çağırıyor; sayaç bu iç içe kilitlenmeyi doğru
  // yönetir (bkz. dosya başındaki not / `useBodyScrollLock.ts`).
  useBodyScrollLock(true);

  // Odak + Escape artık paylaşılan hook'ta: açılışta odağı diyalog içine taşır,
  // Tab/Shift+Tab'ı diyalog içinde hapseder (perdenin arkasına sızamaz),
  // Escape'i YALNIZCA en üstteki diyaloga işler (iç içe iki katman tek basışta
  // birlikte kapanmaz) ve kapanışta odağı açılıştan önceki elemana geri verir.
  // Burada elle kopyalanan iki ayrı efekt (Escape + focus trap) tekildir.
  useDialogFocus({ containerRef: dialogRef, onEscape: beginClose });

  const modalEl = (
    <div
      className={`anim-scrim fixed inset-0 z-[9999] flex items-end justify-center bg-black/85 backdrop-blur-md p-0 sm:items-center sm:p-4 ${
        closing ? "scrim-out" : ""
      }`}
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        // Tıklama mousedown anında da tam olarak backdrop üzerinde başladıysa kapat.
        // Modal içerisinden başlayan fare sürüklemelerinde mousedownTarget modal içi olacağı için kapanmaz.
        if (mouseDownTargetRef.current === e.currentTarget && e.target === e.currentTarget) {
          beginClose();
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
        className={`anim-fadeup glass-sheet-in glass-card flex w-full flex-col overflow-hidden bg-elevated-2 shadow-float ${
          fullScreen
            ? "h-[100dvh] max-h-[100dvh] rounded-none border-none sm:max-w-xl sm:h-[92vh] sm:max-h-[92vh] sm:rounded-card sm:border sm:border-line"
            : "max-h-[85dvh] rounded-t-card border border-line sm:max-w-lg sm:max-h-[85vh] sm:rounded-card"
        } ${closing ? "modal-out" : ""}`}
      >
        <div
          // ⚠️ Üst boşluk sınıfı KOŞULLU: bleed başlık yüzen bir hap (`py-3`,
          // `mt-2`), normal başlık tam genişlikte bir şerit (`p-3.5`). İkisi de
          // `--sat` kadar aşağı inmek ZORUNDA — eskiden burada `pad-safe-top`
          // yazıyordu ve o sınıf HİÇBİR YERDE TANIMLI DEĞİLDİ (sessizce hiçbir
          // şey yapmıyordu): iPhone'da status bar'ın altında kalan kapatma
          // düğmesi tıklanamıyordu. Bkz. src/lib/safeArea.test.ts (kapı).
          className={`flex-none flex items-center justify-between gap-3 ${
            theme === "glass" && bleed
              ? "pad-safe-t-sm mx-2 mt-2 rounded-2xl border border-white/10 bg-black/50 px-3.5 py-3 backdrop-blur-xl sm:mx-3 sm:mt-3"
              : "pad-safe-t border-b border-line-faint bg-bar p-3.5 sm:p-4"
          }`}
        >
          <h3 className="modal-title text-base font-extrabold text-ink-primary">{title}</h3>
          <button
            type="button"
            onClick={beginClose}
            aria-label={t("common.close")}
            className={
              theme === "glass"
                ? "flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-ink-secondary transition hover:bg-white/[0.12] hover:text-ink-primary active:scale-95"
                : "rounded-pill border border-line px-3 py-1 text-sm text-ink-secondary transition hover:text-ink-primary"
            }
          >
            {theme === "glass" ? <X className="h-4 w-4" /> : "✕"}
          </button>
        </div>
        <div
          ref={contentRef}
          className={`flex-1 min-h-0 ${bleed ? "overflow-hidden" : "overflow-y-auto p-4 sm:p-5"}`}
        >
          {children}
        </div>
        {footer && (
          <div className="glass-footer pad-safe-b-sm flex-none border-t border-line-faint bg-bar px-4 py-3 sm:px-5 sm:py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalEl, document.body);
}
