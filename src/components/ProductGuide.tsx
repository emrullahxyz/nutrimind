import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { placeAnchoredPanel } from "../lib/anchor";
import type { AnchorRect, PanelPlacement } from "../lib/anchor";
import { GUIDE_STEPS, GUIDE_STEP_COUNT } from "../lib/guide";
import type { GuideStatus } from "../lib/guide";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useModalHistory } from "../hooks/useModalHistory";
import { useModalExit } from "../hooks/useModalExit";

// ============================================================================
// Nutrimind — ilk kullanım rehberi (PASİF coach-mark turu).
//
// NEDEN COACH-MARK, NEDEN MODAL DEĞİL: rehber uygulamayı gezdirmez. Her adım
// ekranda ZATEN DURAN tek bir hedefi vurgular ve yanına kısa bir kart koyar.
// Böylece öğretilen şey gerçek arayüzün kendisi olur (kullanıcı ikinci bir
// "demo ekranı" öğrenmez) ve rehber hiçbir yazma akışını yarıda bırakmaz.
//
// KATMAN DÜZENİ (tek portal, üç eleman — hepsi z-[9999] sarmalayıcının içinde,
// DOM sırası boyama sırasını belirler):
//   1. ŞEFFAF PERDE: arkadaki kontroller tıklanmasın. Karartma BURADAN değil,
//      aşağıdaki vurgu kutusunun box-shadow'undan gelir; aksi hâlde hedefin
//      kendisi de karanlıkta kalırdı.
//   2. VURGU KUTUSU: hedefin tam üstüne oturur. Dev `box-shadow` yayılımı
//      çerçevenin DIŞINI karartır — tek eleman hem halka hem perde (ScanSheet'in
//      asist çerçevesiyle aynı numara, aynı gerekçe).
//   3. KART: eylemler yalnızca burada. DOM'da EN SON gelir, dolayısıyla
//      perdenin ve vurgunun üstünde boyanır.
//
// ERİŞİLEBİLİRLİK + GERİ TUŞU: ayrı bir reçete YOK. Sırasıyla
// `useBodyScrollLock` (arka plan kilidi), `useModalHistory` (Android geri tuşu,
// geçmiş girdisinin temizliği, programatik-back yutma) ve `useDialogFocus`
// (Tab tuzağı, tek katman Escape sahipliği, kapanışta odak iadesi) kullanılıyor
// — `OnboardingModal`/`MealForm` ile birebir aynı desen (bkz. AGENTS.md K9).
//
// ÇIKIŞ = "ATLANDI", SON ADIMDA "TAMAM" = "TAMAMLANDI": kapanışın HANGİ yolla
// geldiğini `useModalHistory` çağrısı bilmiyor (geri tuşu ile `history.back()`
// aynı `onClose`'a düşer — bkz. `useModalHistory` sözleşmesi). Bu yüzden niyet
// bir ref'te tutulur ve `onClose` onu OKUR; `onClose`'un ref üzerinden
// okunması sayesinde değer her zaman günceldir.
// ============================================================================

/** Vurgu çerçevesinin hedefin dışına taşan nefes payı. */
const HIGHLIGHT_PAD = 6;
/** Kartın ulaşabileceği en büyük genişlik (masaüstü okunabilirliği). */
const CARD_MAX_WIDTH = 340;
/** Ekran kenarına bırakılan en az boşluk. */
const VIEWPORT_PAD = 10;
/** Perde rengi. Tek kaynak: hem yayılım gölgesi hem (hedefsiz) düz perde. */
const SCRIM = "rgba(0, 0, 0, 0.72)";
/** Halka + perde TEK inline gölgede: `ring-*` yardımcıları da box-shadow yazar,
 *  inline stil onları EZERDİ. İlk gölge üstte boyanır, bu yüzden halka önce. */
const HIGHLIGHT_SHADOW = `0 0 0 2px rgb(var(--accent) / 0.95), 0 0 0 9999px ${SCRIM}`;

/** Hedefin O ANDAKİ dikdörtgeni. Bulunamaz/gizliyse `null`.
 *
 *  Ölçüt `offsetParent` DEĞİL (fixed bir öğede her zaman null olurdu); sıfır
 *  boyutlu dikdörtgen "görünmüyor" sayılır — `useDialogFocus`'taki aynı ayrım. */
function targetRect(target: string): AnchorRect | null {
  const el = document.querySelector(`[data-guide-target="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
}

/** Hedef bulunamadığında kart ekranın ortasına düşer — rehber ASLA boş kalmaz.
 *  (Hedefi vurgulamak mümkün olmasa da metin okunur; tur yarıda kesilmez.) */
function centeredPlacement(cardHeight: number): PanelPlacement {
  const vw = typeof window === "undefined" ? 360 : window.innerWidth;
  const vh = typeof window === "undefined" ? 640 : window.innerHeight;
  const width = Math.min(CARD_MAX_WIDTH, Math.max(1, vw - VIEWPORT_PAD * 2));
  const maxHeight = Math.min(420, Math.max(120, vh - VIEWPORT_PAD * 2));
  const height = Math.min(cardHeight > 0 ? cardHeight : 220, maxHeight);
  return {
    side: "below",
    top: Math.max(VIEWPORT_PAD, (vh - height) / 2),
    left: Math.max(VIEWPORT_PAD, (vw - width) / 2),
    width,
    maxHeight,
    originX: width / 2,
    originY: 0,
  };
}

export function ProductGuide({ onFinish }: { onFinish: (status: GuideStatus) => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<GuideStatus>("skipped");

  const step = GUIDE_STEPS[index];
  const isLast = index === GUIDE_STEP_COUNT - 1;

  useBodyScrollLock(true);

  // Kapanışın tek kapısı: geri tuşu/kaydırma, X, Escape, "Atla", dış tıklama ve
  // son adımdaki "Tamam" — hepsi buradan geçer ve niyet `statusRef`'ten okunur.
  const { requestClose } = useModalHistory({
    active: true,
    onClose: () => onFinish(statusRef.current),
  });
  const { closing, beginClose } = useModalExit(requestClose);

  // `ready`: kart yerleşimi ölçülene kadar `visibility: hidden`; gizli bir öğeye
  // `focus()` sessizce başarısız olur (bkz. MealActionSheet'te ölçülen aynı hata).
  useDialogFocus({
    containerRef: cardRef,
    active: !closing,
    onEscape: beginClose,
    autoFocus: "container",
    ready: placement !== null,
  });

  /** Görünüm alanı okuma/ölçüm tek yerde: hedefi bul, kartı hedefe demirle
   *  (mevcut `placeAnchoredPanel` matematiği — panel asla ekran dışına taşmaz,
   *  alt gezinme çubuğunun arkasında kalmaz). */
  const measure = useCallback(() => {
    if (typeof window === "undefined") return;
    const found = targetRect(step.target);
    const card = cardRef.current;
    const height = card ? card.offsetHeight : 0;
    setRect(found);
    if (!found) {
      setPlacement(centeredPlacement(height));
      return;
    }
    setPlacement(
      placeAnchoredPanel(
        found,
        { width: window.innerWidth, height: window.innerHeight },
        height,
        found.left + found.width / 2,
      ),
    );
  }, [step.target]);

  // Adım değişiminde İLK BOYADAN ÖNCE ölçülür: kullanıcı hiçbir zaman eski
  // adımın yerleşiminde duran bir kart görmez. Sabit konumlu hedeflerde
  // (alt gezinme) kaydırma atlanır — orada `scrollIntoView` anlamsız.
  useLayoutEffect(() => {
    if (!step.fixed) {
      const el = document.querySelector<HTMLElement>(`[data-guide-target="${step.target}"]`);
      try {
        el?.scrollIntoView({ block: "center" });
      } catch {
        // Eski WebView'lar seçenek nesnesini desteklemeyebilir; rehber yine açılmalı.
      }
    }
    measure();
  }, [measure, step]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  /* Arka planı TAM kilitle: `useBodyScrollLock` html/body overflow'unu kapatır,
     ama tekerlek/dokunma ile alttaki kaydırma alanı yine kımıldayabilir. React
     17+ `touchmove`/`wheel` dinleyicilerini passive kaydettiği için `onTouchMove`
     içindeki `preventDefault` sessizce etkisizdir — gerçek (pasif olmayan)
     pencere dinleyicisi şart (bkz. MealActionSheet'teki aynı not). */
  useEffect(() => {
    const blockBackgroundScroll = (e: Event) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    window.addEventListener("wheel", blockBackgroundScroll, { passive: false, capture: true });
    window.addEventListener("touchmove", blockBackgroundScroll, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", blockBackgroundScroll, true);
      window.removeEventListener("touchmove", blockBackgroundScroll, true);
    };
  }, []);

  function next() {
    if (isLast) {
      statusRef.current = "completed";
      beginClose();
      return;
    }
    setIndex((i) => i + 1);
  }

  const cardStyle: CSSProperties = placement
    ? {
        top: placement.top,
        left: placement.left,
        width: placement.width,
        maxHeight: placement.maxHeight,
        visibility: "visible",
      }
    : {
        top: 0,
        left: 0,
        width: Math.min(
          CARD_MAX_WIDTH,
          Math.max(1, (typeof window === "undefined" ? 360 : window.innerWidth) - VIEWPORT_PAD * 2),
        ),
        visibility: "hidden",
      };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* 1. Şeffaf perde: arkadaki hiçbir kontrol tıklanmaz. Dokunma yalnızca
          rehberi atlar — rehber pasif bir katman. */}
      <div
        className="fixed inset-0 touch-none [overscroll-behavior:none]"
        onClick={beginClose}
        aria-hidden="true"
      />

      {/* 2. Vurgu: hedefin üstünde, karanlığın dışında kalan tek alan. */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-[20px]"
          style={{
            left: rect.left - HIGHLIGHT_PAD,
            top: rect.top - HIGHLIGHT_PAD,
            width: rect.width + HIGHLIGHT_PAD * 2,
            height: rect.height + HIGHLIGHT_PAD * 2,
            boxShadow: HIGHLIGHT_SHADOW,
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0"
          style={{ background: SCRIM }}
        />
      )}

      {/* 3. Kart — DOM'da en son, dolayısıyla perdenin üstünde. */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("guide.title")}
        tabIndex={-1}
        data-guide-card="true"
        style={cardStyle}
        className={`fixed flex flex-col gap-3 overflow-hidden rounded-card border border-white/15 bg-fab-panel/98 p-4 shadow-float backdrop-blur-2xl ${
          closing ? "menu-panel-out" : "menu-panel-in"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-mono text-ink-faint">
              {t("guide.progress", { current: index + 1, total: GUIDE_STEP_COUNT })}
            </p>
            <h2 className="mt-1 text-base font-extrabold leading-tight text-ink-primary">
              {t(step.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={beginClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.07] text-ink-secondary transition hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-ink-secondary">{t(step.bodyKey)}</p>

        {/* İlerleme çubuğu: kaç adım kaldığını tek bakışta söyler. */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((index + 1) / GUIDE_STEP_COUNT) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={beginClose}
            className="rounded-pill px-3 py-2 text-xs font-semibold text-ink-tertiary transition hover:text-ink-primary"
          >
            {t("guide.skip")}
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-pill bg-accent px-4 py-2 text-xs font-extrabold text-accent-ink transition hover:opacity-90 active:scale-95"
          >
            {isLast ? t("guide.done") : t("guide.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
