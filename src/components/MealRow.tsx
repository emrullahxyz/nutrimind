import { useEffect, useRef, useState } from "react";
import { Flame, Beef, Wheat, Droplet, Pencil, BookmarkPlus } from "lucide-react";
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
  onSaveTemplate: () => void;
  busy: boolean;
}

export function MealRow({
  meal,
  index,
  selectMode,
  isSelected,
  onToggleSelect,
  onEdit,
  onSaveTemplate,
  busy,
}: MealRowProps) {
  const { t } = useTranslation();
  const delay = Math.min(index, 6) * 60;
  const [nameExpanded, setNameExpanded] = useState(false);
  const liRef = useRef<HTMLLIElement>(null);

  const press = usePressSpring({ pressScale: 0.98 });

  // İsim açıkken kart dışındaki herhangi bir tıklama ismi eski (kırpılmış) hâle getirir.
  useEffect(() => {
    if (!nameExpanded) return;
    const handler = (e: MouseEvent) => {
      if (liRef.current && !liRef.current.contains(e.target as Node)) {
        setNameExpanded(false);
      }
    };
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [nameExpanded]);

  // Seçim moduna geçince açık isim kapanır.
  useEffect(() => {
    if (selectMode) setNameExpanded(false);
  }, [selectMode]);

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
      ref={liRef}
      className="anim-fadeup overflow-hidden rounded-[24px] bg-calCard p-4 sm:p-5 transition-all hover:bg-cal-hover active:scale-[0.99] cursor-pointer shadow-card glass-card spring-press"
      style={{ animationDelay: `${delay}ms`, ...press.style }}
      {...press.handlers}
      onClick={selectMode ? onToggleSelect : () => { setNameExpanded(false); onEdit(); }}
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
              <span>{meal.computed.kcal} kalori</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Top Row: Name & Time — 1. dokunuş ismi açar, açıkken kartın herhangi bir yeri düzenlemeye girer */}
          <div className="flex items-start justify-between gap-3">
            <span
              onClick={(e) => {
                if (!nameExpanded) {
                  e.stopPropagation();
                  setNameExpanded(true);
                }
              }}
              title={meal.label}
              className={`cursor-pointer transition-colors hover:text-memory font-bold text-white text-base sm:text-lg flex-1 min-w-0 ${
                nameExpanded ? "line-clamp-none" : "line-clamp-2"
              }`}
            >
              {meal.label}
            </span>
            {timeStr && (
              <span className="mt-1 shrink-0 text-xs font-mono font-medium text-ink-secondary">
                {timeStr}
              </span>
            )}
          </div>

          {/* Middle Row: Calories + Actions — butonlar hap satırıyla yer kapışmasın, haplar tam genişlik alsın */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white">
              <Flame className="w-4 h-4 text-carb" />
              <span>{meal.computed.kcal} kalori</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveTemplate();
                }}
                disabled={busy}
                className="w-8 h-8 rounded-full bg-well hover:bg-well-hover text-ink-secondary hover:text-white flex items-center justify-center transition disabled:opacity-40"
                title={t("mealRow.saveTemplate")}
                aria-label={t("mealRow.saveTemplate")}
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="w-8 h-8 rounded-full bg-well hover:bg-well-hover text-ink-secondary hover:text-white flex items-center justify-center transition"
                title={t("common.edit")}
                aria-label={t("common.edit")}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom Row: Macros — tam genişlik, üç hap hep yan yana */}
          <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] sm:text-xs font-extrabold">
              <span className="flex items-center gap-0.5 bg-macro-chip border border-protein/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Beef className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-protein" />
                <span className="whitespace-nowrap text-white">{macroNum(meal.computed.protein)}g</span>
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-protein/60 border border-protein/60 text-[8px] sm:text-[9px] leading-none text-protein-ink">P</span>
              </span>
              <span className="flex items-center gap-0.5 bg-macro-chip border border-carb/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Wheat className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-carb" />
                <span className="whitespace-nowrap text-white">{macroNum(meal.computed.carbs)}g</span>
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-carb/60 border border-carb/60 text-[8px] sm:text-[9px] leading-none text-carb-ink">K</span>
              </span>
              <span className="flex items-center gap-0.5 bg-macro-chip border border-fat/50 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Droplet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fat" />
                <span className="whitespace-nowrap text-white">{macroNum(meal.computed.fat)}g</span>
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-fat/60 border border-fat/60 text-[8px] sm:text-[9px] leading-none text-fat-ink">Y</span>
              </span>
          </div>
        </div>
      )}
    </li>
  );
}
