import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkPlus,
  ChevronLeft,
  CopyPlus,
  Pencil,
  SquareCheckBig,
  Trash2,
  X,
} from "lucide-react";
import { TextField } from "./FormBits";
import { mealMenuActions, mealSheetReducer, templateNameSuggestion } from "../lib/mealActions";
import type { MealMenuActionId, MealSheetStep } from "../lib/mealActions";
import { placeAnchoredPanel } from "../lib/anchor";
import type { PanelAnchor, PanelPlacement } from "../lib/anchor";
import { subscribeViewport } from "../lib/safeArea";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useModalHistory } from "../hooks/useModalHistory";
import { usePressGate } from "../hooks/usePressGate";
import type { MealItem } from "../types";
import { useTranslation } from "react-i18next";

const ICONS: Record<MealMenuActionId, typeof BookmarkPlus> = {
  template: BookmarkPlus,
  duplicate: CopyPlus,
  edit: Pencil,
  select: SquareCheckBig,
  delete: Trash2,
};

/** Çıkış animasyonunun süresi — `menu-panel-out`/`menu-scrim-out` ile aynı
 *  olmalı (simetrik yol). 160 ms'ten 120 ms'e indirildi: her aksiyon (sil,
 *  düzenle, şablon kaydet) bu süre kadar beklediği için algılanan gecikme
 *  doğrudan bu sabitle ölçekleniyor; 120 ms simetriyi korurken beklemeyi
 *  kısaltıyor (Apple: response ne kadar kısaysa doğrudanlık hissi o kadar güçlü). */
const EXIT_MS = 120;
/** Öğelerin kademeli girişi (Apple: 150 ms'nin üstüne çıkmaz). */
const ITEM_STAGGER_MS = 30;

/** Bir öğüne uzun basınca (ya da "⋮") satırına demirlenen işlem menüsü.
 *
 *  Paylaşılan `Modal`'ın alt-sheet'i DEĞİL: FAB menüsüyle aynı malzeme dilinde
 *  (yuvarlak, buzlu cam, yüzen) kendi satırından doğan bir panel. Tek panel
 *  içinde adım adım yaşar (`mealSheetReducer`): menü → şablon adı / sil onayı →
 *  menü. Böylece üst üste iki katman ve iki geçmiş girdisi oluşmaz.
 *
 *  Basış sızıntısı: menü açıldığında parmak hâlâ ekranda; kaldırma anındaki
 *  `click` panelin altındaki satıra düşüp aksiyonu kendiliğinden çalıştırıyordu.
 *  `usePressGate` o tıklamayı yutar (bkz. `lib/pressGate.ts`).
 *
 *  Aksiyonların kendisi parent'ta (DayView) çalışır: yazma + toast + hata
 *  yönetimi orada tek yerde kalsın diye. */
export function MealActionSheet({
  meal,
  anchor,
  busy,
  offline,
  isToday,
  onClose,
  onSaveTemplate,
  onDuplicate,
  onEdit,
  onSelect,
  onDelete,
}: {
  meal: MealItem;
  /** Menüyü doğuran satır/basış — panel buraya demirlenir. */
  anchor: PanelAnchor;
  busy: boolean;
  offline: boolean;
  /** "Aynısını bugüne ekle" etiketi: bugüne bakarken "bir tane daha" olur. */
  isToday: boolean;
  onClose: () => void;
  onSaveTemplate: (name: string) => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<MealSheetStep>("menu");
  const [name, setName] = useState(() => templateNameSuggestion(meal));
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const [closing, setClosing] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);

  const { gated } = usePressGate(anchor.pointerId);
  useBodyScrollLock(true);

  // Kapanışta `history.back()` (geçmiş girdisini temizler) üzerinden kapanır.
  const { requestClose } = useModalHistory({ active: true, onClose });

  useEffect(() => {
    reduceMotionRef.current =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
  }, []);

  /** Çıkış animasyonunu oynatıp ARDINDAN işi yapar. Panelin HER kapanış yolu
   *  aynı hareketi izler (Apple §7 simetri): veri yazan aksiyonlar da menüyü
   *  anında yok etmez — önce panel geldiği yoldan geri döner. Reduced-motion'da
   *  bekleme yok (anında çalışır). */
  const closeThen = useCallback((action: () => void) => {
    if (closingRef.current) return;
    if (reduceMotionRef.current) {
      action();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      closingRef.current = false;
      action();
    }, EXIT_MS);
  }, []);

  // Çıkış sürerken unmount olursa (ör. parent state'i dışarıdan sıfırladı)
  // zamanlayıcı arkada kalmasın.
  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  const beginClose = useCallback(() => closeThen(requestClose), [closeThen, requestClose]);

  /** Odak tuzağı + Escape + kapanışta odağı geri verme (paylaşılan hook).
   *  Panel `aria-modal="true"` ilan ediyor; Tab ile perdenin ARDINA kaçmak ve
   *  kapanınca odağın kaybolması bu iddiayla çelişirdi (Apple §16: wayfinding).
   *  Odak panelin KENDİSİNE gider (ilk satıra değil): başlık/`aria-label`
   *  duyurulur ve satır üzerinde istenmeyen bir odak halkası oluşmaz. */
  // `ready`: panel yerleşimi ölçülene kadar `visibility: hidden` duruyor ve
  // gizli bir öğeye `focus()` sessizce başarısız olur — ölçüm bunu doğruladı
  // (odak gövdede kalıyordu). Ölçüm bitince hook odağı tekrar dener.
  useDialogFocus({
    containerRef: panelRef,
    onEscape: beginClose,
    autoFocus: "container",
    ready: placement !== null,
  });

  /** Panelin İSTEDİĞİ yükseklik: başlık + gövdenin doğal içerik yüksekliği.
   *
   *  Panelin kendi kutusunu ölçmek YETMİYOR: kutuya `maxHeight` uygulandığı an
   *  ölçüm kırpılmış değeri verir ve panel bir sonraki adımda yanlış tarafa
   *  yerleşir (ölçüldü: 3 satır görünürken panel ekranın 123 px altına taşıyordu).
   *  Gövdenin `scrollHeight`'i kırpılmadan içeriği bildirir. */
  const measure = useCallback(() => {
    if (!headerRef.current || !bodyRef.current) return;
    const needed = headerRef.current.offsetHeight + bodyRef.current.scrollHeight;
    setPlacement(
      placeAnchoredPanel(
        anchor.rect,
        { width: window.innerWidth, height: window.innerHeight },
        needed,
        anchor.pressX,
      ),
    );
  }, [anchor]);

  // Yerleşim İLK BOYADAN ÖNCE ölçülür: kullanıcı hiçbir zaman yerleşmemiş bir
  // panel görmez (ölçüm bitene kadar `visibility: hidden`).
  useLayoutEffect(() => {
    measure();
  }, [measure, step]);

  // Ölçüm TAZE kalmalı: iOS'ta adres çubuğu/klavye yalnızca `visualViewport`'u
  // oynatır ve `resize` tetiklenmez — o durumda panel bir önceki görünüm
  // alanına göre yerleşip ekranın dışına taşabiliyordu.
  useEffect(() => subscribeViewport(measure), [measure]);

  /* Arka planı TAM kilitle (#5): doküman kilidi (`useBodyScrollLock`) html/body
     overflow'unu kapatır, ama tekerlek/dokunma ile altındaki kaydırma alanı yine
     kımıldayabilir. Burada gerçek (PASİF OLMAYAN) pencere dinleyicileri
     kullanılıyor — React 17+ `touchmove`/`wheel` dinleyicilerini passive
     kaydettiği için `onTouchMove` içindeki `preventDefault` sessizce etkisizdir.
     Panelin KENDİ gövdesi muaf: içerik taşarsa panel içinde kaydırılabilir. */
  useEffect(() => {
    const blockBackgroundScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    window.addEventListener("wheel", blockBackgroundScroll, { passive: false, capture: true });
    window.addEventListener("touchmove", blockBackgroundScroll, {
      passive: false,
      capture: true,
    });
    return () => {
      window.removeEventListener("wheel", blockBackgroundScroll, true);
      window.removeEventListener("touchmove", blockBackgroundScroll, true);
    };
  }, []);

  const actions = mealMenuActions({ busy, offline });
  const mainActions = actions.filter((a) => a.id !== "delete");
  const deleteAction = actions.find((a) => a.id === "delete");

  const LABEL_KEY: Record<MealMenuActionId, string> = {
    template: "mealMenu.template",
    duplicate: isToday ? "mealMenu.duplicateAgain" : "mealMenu.duplicateToday",
    edit: "mealMenu.edit",
    select: "mealMenu.select",
    delete: "mealMenu.delete",
  };

  const stepTitle =
    step === "templateName"
      ? t("mealMenu.templateTitle")
      : step === "confirmDelete"
        ? t("mealMenu.deleteTitle")
        : t("mealMenu.title");

  /** Adım değiştirmeyen aksiyonlar: panel kapanır, işi parent yapar. */
  function runImmediate(id: MealMenuActionId) {
    if (id === "duplicate") onDuplicate();
    else if (id === "edit") onEdit();
    else if (id === "select") onSelect();
  }

  function choose(id: MealMenuActionId) {
    const next = mealSheetReducer(step, { type: "choose", id });
    if (next === step) return; // menü dışında seçim yok sayılır
    if (next === "closed") {
      // Panel önce geldiği yoldan geri döner, SONRA aksiyon çalışır.
      closeThen(() => runImmediate(id));
      return;
    }
    setStep(next);
  }

  /** Menü satırı. BİLEREK bileşen değil düz fonksiyon: her render'da yeni bir
   *  bileşen kimliği, satırları yeniden MOUNT eder ve giriş animasyonu her
   *  state güncellemesinde baştan oynardı. */
  function renderRow(id: MealMenuActionId, delay: number) {
    const action = actions.find((a) => a.id === id);
    if (!action) return null;
    const Icon = ICONS[id];
    const danger = id === "delete";
    return (
      <button
        type="button"
        disabled={action.disabled}
        onClick={() => choose(id)}
        style={{ animationDelay: `${delay}ms` }}
        className={`menu-row menu-item-in flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm font-semibold ${
          danger ? "text-danger" : "text-ink-primary"
        }`}
      >
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
            danger ? "bg-danger/10 text-danger" : "bg-white/[0.07] text-ink-secondary"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">{t(LABEL_KEY[id])}</span>
      </button>
    );
  }

  const panelStyle: CSSProperties = {
    ...(placement
      ? {
          top: placement.top,
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
          transformOrigin: `${placement.originX}px ${placement.originY}px`,
          visibility: "visible" as const,
        }
      : { top: 0, left: 0, width: 280, maxHeight: 320, visibility: "hidden" as const }),
    // Giriş/çıkış panelin hangi taraftan geldiğine göre kayar.
    ["--menu-shift" as string]: placement?.side === "above" ? "-6px" : "6px",
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Perde: FAB reçetesi — `touch-none`, yani perdeye başlayan hiçbir
          dokunuş kaydırma başlatamaz (tarayıcı düzeyinde garanti; yukarıdaki
          blocker'ın dokunma tarafındaki eşi). Dokunma yalnızca kapatır. */}
      <div
        className={`fixed inset-0 touch-none [overscroll-behavior:none] bg-black/60 backdrop-blur-sm ${
          closing ? "menu-scrim-out" : "menu-scrim-in"
        }`}
        onClick={beginClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={stepTitle}
        tabIndex={-1}
        data-gated={gated ? "true" : undefined}
        style={panelStyle}
        className={`fixed flex flex-col overflow-hidden rounded-3xl border border-white/15 bg-fab-panel/98 shadow-float backdrop-blur-2xl ${
          closing ? "menu-panel-out" : "menu-panel-in"
        }`}
      >
        {/* Başlık: hangi öğün + (alt adımlarda) geri oku */}
        <div ref={headerRef} className="flex items-center gap-2 px-3.5 pt-3 pb-2">
          {step !== "menu" && (
            <button
              type="button"
              onClick={() => setStep(mealSheetReducer(step, { type: "back" }))}
              aria-label={t("common.back")}
              className="menu-row -ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-secondary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-ink-primary" title={meal.label}>
              {step === "menu" ? meal.label : stepTitle}
            </p>
            <p className="truncate text-[11px] font-medium text-ink-faint">
              {step === "menu" ? stepTitle : meal.label}
            </p>
          </div>
          <button
            type="button"
            onClick={beginClose}
            aria-label={t("common.close")}
            className="menu-row grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.07] text-ink-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tek gövde: adımlar burada yer değiştirir (panel yerinden oynamaz) ve
            panelin maxHeight'ı yalnızca BURAYI kırpar. */}
        <div
          ref={bodyRef}
          className="flex min-h-0 flex-col overflow-y-auto overscroll-contain px-2 pb-2.5"
        >
        {step === "menu" && (
          <div className="flex flex-col gap-1">
            {mainActions.map((action, i) => (
              <div key={action.id} className="flex flex-col">
                {renderRow(action.id, i * ITEM_STAGGER_MS)}
                {action.id === "template" && offline && (
                  <p className="px-2.5 pb-1 text-[11px] text-ink-faint">
                    {t("mealMenu.offlineTemplate")}
                  </p>
                )}
              </div>
            ))}

            {/* Yıkıcı aksiyon ayrı blokta: ayırıcı + tek başına (Apple §16) */}
            {deleteAction && (
              <>
                <span aria-hidden="true" className="my-1 h-px bg-white/10" />
                {renderRow("delete", mainActions.length * ITEM_STAGGER_MS)}
              </>
            )}
          </div>
        )}

        {step === "templateName" && (
          <div key="templateName" className="menu-step-in flex flex-col gap-3 px-1.5 pt-0.5">
            <p className="text-xs text-ink-tertiary">{t("mealMenu.templateHint")}</p>
            <TextField
              label={t("mealMenu.templateNameLabel")}
              value={name}
              onChange={setName}
              placeholder={t("mealMenu.templateNamePlaceholder")}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep(mealSheetReducer(step, { type: "back" }))}
                className="menu-row rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-secondary"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!name.trim() || busy}
                onClick={() => closeThen(() => onSaveTemplate(name.trim()))}
                className="rounded-full bg-accent px-4 py-2 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        )}

        {step === "confirmDelete" && (
          <div key="confirmDelete" className="menu-step-in flex flex-col gap-3 px-1.5 pt-0.5">
            <p className="text-sm text-ink-secondary">{t("mealMenu.deleteConfirm")}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep(mealSheetReducer(step, { type: "back" }))}
                className="menu-row rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-secondary"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => closeThen(onDelete)}
                className="rounded-full bg-danger px-4 py-2 text-sm font-extrabold text-white transition disabled:opacity-40"
              >
                {t("mealMenu.deleteConfirmYes")}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
