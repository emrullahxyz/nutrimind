import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Flame, Beef, Wheat, Droplet, EllipsisVertical } from "lucide-react";
import { formatNumber } from "../lib/format";
import type { PanelAnchor } from "../lib/anchor";
import type { MealItem } from "../types";
import { usePressSpring } from "../hooks/usePressSpring";
import { longPressRowStyle, useLongPress } from "../hooks/useLongPress";
import { useTranslation } from "react-i18next";

/** tr-TR ondalık biçimli makro sayısı: tamsayı "12", ondalık "12,5" (sonda ",0" yok). */
const macroNum = (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : 1);

interface MealRowProps {
  meal: MealItem;
  index: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  /** Kartın gövdesine dokunma: hızlı besin sheet'i. */
  onEdit: () => void;
  /** "⋮" ya da uzun basma: işlem menüsü. Çapa (satır dikdörtgeni + basış
   *  noktası) menünün nereye demirleneceğini ve basış kapısının hangi
   *  işaretçiyi bekleyeceğini söyler. */
  onOpenMenu: (anchor: PanelAnchor) => void;
  busy: boolean;
}

export function MealRow({
  meal,
  index,
  selectMode,
  isSelected,
  onToggleSelect,
  onEdit,
  onOpenMenu,
  busy,
}: MealRowProps) {
  const { t } = useTranslation();
  const delay = Math.min(index, 6) * 60;

  const rowRef = useRef<HTMLLIElement>(null);

  /** Satırın O ANDAKİ dikdörtgeni: menü açıldığı anda ölçülür, böylece liste
   *  kaydırılmış olsa da doğru yere demirlenir. */
  function anchorFor(pressX: number, pointerId: number | null): PanelAnchor | null {
    const el = rowRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      rect: {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      },
      pressX,
      pointerId,
    };
  }

  const press = usePressSpring({ pressScale: 0.98 });
  // Seçim modunda dokunma = seç; menü açılmaz.
  const longPress = useLongPress({
    onLongPress: (origin) => {
      const anchor = anchorFor(origin.x, origin.pointerId);
      if (anchor) onOpenMenu(anchor);
    },
    enabled: !selectMode,
  });

  // `usePressSpring` (glass basınç animasyonu) ve uzun basma AYNI pointer
  // olaylarını dinliyor — biri diğerini ezmesin diye burada birleştiriliyor.
  const handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerLeave: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onContextMenu: ReturnType<typeof useLongPress>["handlers"]["onContextMenu"];
  } = {
    onPointerDown: (e) => {
      press.handlers.onPointerDown?.(e);
      longPress.handlers.onPointerDown(e);
    },
    onPointerMove: (e) => {
      longPress.handlers.onPointerMove(e);
    },
    onPointerUp: (e) => {
      press.handlers.onPointerUp?.(e);
      longPress.handlers.onPointerUp(e);
    },
    onPointerLeave: (e) => {
      press.handlers.onPointerLeave?.(e);
      longPress.handlers.onPointerLeave(e);
    },
    onPointerCancel: (e) => {
      press.handlers.onPointerCancel?.(e);
      longPress.handlers.onPointerCancel(e);
    },
    onContextMenu: longPress.handlers.onContextMenu,
  };

  let timeStr = "";
  if (meal.loggedAt) {
    try {
      const d = new Date(meal.loggedAt);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      }
    } catch {
      timeStr = "";
    }
  }

  return (
    <li
      ref={rowRef}
      className="anim-fadeup relative overflow-hidden rounded-[24px] bg-calCard p-4 sm:p-5 transition-all hover:bg-cal-hover active:scale-[0.99] cursor-pointer shadow-card glass-card spring-press select-none"
      style={{ animationDelay: `${delay}ms`, ...press.style, ...longPressRowStyle }}
      {...handlers}
      onClick={
        selectMode
          ? onToggleSelect
          : () => {
              // Uzun basma menüyü açtıysa parmak kalkınca gelen sentetik click
              // besin sheet'ini de açmasın (tek basış = tek sonuç).
              if (longPress.consumeClickSuppression()) return;
              onEdit();
            }
      }
    >
      {/* Uzun basma dolgusu: 500 ms boyunca soldan büyür, tam dolduğu anda menü
          açılır (basışın nereye gittiğini ara kareler söyler — Apple §8). */}
      {longPress.holding && <span aria-hidden="true" className="hold-fill" />}

      {selectMode ? (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-white/20 bg-white/10 text-white focus:ring-0 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-base truncate">{meal.label}</h4>
            <div className="flex items-center gap-1.5 text-xs text-ink-secondary font-semibold mt-1">
              <Flame className="w-3.5 h-3.5 text-carb" />
              <span>{meal.computed.kcal} kcal</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Top Row: Name & Time */}
          <div className="flex items-start justify-between gap-3">
            <span className="font-bold text-white text-base sm:text-lg flex-1 min-w-0 line-clamp-2">
              {meal.label}
            </span>
            {timeStr && (
              <span className="mt-1 shrink-0 text-xs font-mono font-medium text-ink-secondary">
                {timeStr}
              </span>
            )}
          </div>

          {/* Middle Row: Calories + Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
              <Flame className="w-4 h-4 text-carb" />
              <span>{meal.computed.kcal} kcal</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  const anchor = anchorFor(r.left + r.width / 2, null);
                  if (anchor) onOpenMenu(anchor);
                }}
                disabled={busy}
                className="w-8 h-8 rounded-full bg-well hover:bg-well-hover text-ink-secondary hover:text-white flex items-center justify-center transition disabled:opacity-40"
                title={t("mealRow.more")}
                aria-label={t("mealRow.more")}
                aria-haspopup="menu"
              >
                <EllipsisVertical className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bottom Row: Macros */}
          <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] sm:text-xs font-extrabold">
              <span className="flex items-center gap-0.5 bg-macro-chip border border-protein/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Beef className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-protein" />
                <span className="whitespace-nowrap text-white">{macroNum(meal.computed.protein)}g</span>
              </span>
              <span className="flex items-center gap-0.5 bg-macro-chip border border-carb/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Wheat className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-carb" />
                <span className="whitespace-nowrap text-white">{macroNum(meal.computed.carbs)}g</span>
              </span>
              <span className="flex items-center gap-0.5 bg-macro-chip border border-fat/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Droplet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fat" />
                <span className="whitespace-nowrap text-white">{macroNum(meal.computed.fat)}g</span>
              </span>
          </div>
        </div>
      )}
    </li>
  );
}
