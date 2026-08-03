import { Flame, Beef, Wheat, Droplet, Pencil } from "lucide-react";
import { formatKcal } from "../lib/format";
import type { MealItem } from "../types";

interface MealRowProps {
  meal: MealItem;
  pct: number;
  index: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onSaveTemplate: () => void;
  onRemove: () => void;
  busy: boolean;
}

export function MealRow({
  meal,
  index,
  selectMode,
  isSelected,
  onToggleSelect,
  onEdit,
}: MealRowProps) {
  const delay = Math.min(index, 6) * 60;
  
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
      className="anim-fadeup overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5 transition-all hover:border-white/20 active:scale-[0.99] cursor-pointer shadow-card"
      style={{ animationDelay: `${delay}ms` }}
      onClick={selectMode ? onToggleSelect : onEdit}
    >
      {selectMode ? (
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-white/20 bg-white/10 text-accent focus:ring-0 cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-white text-base truncate">{meal.label}</h4>
            <div className="flex items-center gap-1.5 text-xs text-white/70 font-semibold mt-1">
              <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
              <span>{formatKcal(meal.computed.kcal)} kalori</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Top Row: Name & Time */}
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="font-bold text-white text-base sm:text-lg truncate max-w-[75%]">
              {meal.label}
            </h4>
            {timeStr && (
              <span className="text-xs font-mono font-medium text-white/40 shrink-0">
                {timeStr}
              </span>
            )}
          </div>

          {/* Middle Row: Calories */}
          <div className="flex items-center gap-1.5 text-sm font-bold text-white/90">
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400/20" />
            <span>{meal.computed.kcal} kalori</span>
          </div>

          {/* Bottom Row: Macros & Edit Pencil */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3 text-xs font-extrabold">
              <span className="flex items-center gap-1 text-[#FF6B8A]">
                <Beef className="w-3.5 h-3.5" />
                <span>{meal.computed.protein}g</span>
              </span>
              <span className="flex items-center gap-1 text-[#FFB84D]">
                <Wheat className="w-3.5 h-3.5" />
                <span>{meal.computed.carbs}g</span>
              </span>
              <span className="flex items-center gap-1 text-[#5B8DEF]">
                <Droplet className="w-3.5 h-3.5" />
                <span>{meal.computed.fat}g</span>
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition"
              title="Düzenle"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
