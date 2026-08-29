import { Flame, Beef, Wheat, Droplet, Pencil } from "lucide-react";
import { formatNumber } from "../lib/format";
import type { MealItem } from "../types";
import { usePressSpring } from "../hooks/usePressSpring";
import { useTranslation } from "react-i18next";

/** tr-TR ondalık biçimli makro sayısı: tamsayı "12", ondalık "12,5" (sonda ",0" yok). */
const macroNum = (v: number) => formatNumber(v, Number.isInteger(v) ? 0 : 1);

interface MealRowProps {
  meal: MealItem;
  index: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onEditFull: () => void;
  busy: boolean;
}

export function MealRow({
  meal,
  index,
  selectMode,
  isSelected,
  onToggleSelect,
  onEdit,
  onEditFull,
  busy,
}: MealRowProps) {
  const { t } = useTranslation();
  const delay = Math.min(index, 6) * 60;

  const press = usePressSpring({ pressScale: 0.98 });

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
      className="anim-fadeup overflow-hidden rounded-[24px] bg-calCard p-4 sm:p-5 transition-all hover:bg-cal-hover active:scale-[0.99] cursor-pointer shadow-card glass-card spring-press"
      style={{ animationDelay: `${delay}ms`, ...press.style }}
      {...press.handlers}
      onClick={selectMode ? onToggleSelect : onEdit}
    >
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
                  onEditFull();
                }}
                className="w-8 h-8 rounded-full bg-well hover:bg-well-hover text-ink-secondary hover:text-white flex items-center justify-center transition"
                title={t("common.edit")}
                aria-label={t("common.edit")}
              >
                <Pencil className="w-3.5 h-3.5" />
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
