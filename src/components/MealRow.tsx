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
      className="anim-fadeup overflow-hidden rounded-[24px] bg-[#22202E] p-4 sm:p-5 transition-all hover:bg-[#282637] active:scale-[0.99] cursor-pointer shadow-card"
      style={{ animationDelay: `${delay}ms` }}
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
            <div className="flex items-center gap-1.5 text-xs text-[#A5A2B8] font-semibold mt-1">
              <Flame className="w-3.5 h-3.5 text-[#FFB74D]" />
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
              <span className="text-xs font-mono font-medium text-[#A5A2B8] shrink-0">
                {timeStr}
              </span>
            )}
          </div>

          {/* Middle Row: Calories */}
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white/90">
            <Flame className="w-4 h-4 text-[#FFB74D]" />
            <span>{meal.computed.kcal} kalori</span>
          </div>

          {/* Bottom Row: Macros & Edit Pencil */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-extrabold">
              <span className="flex items-center gap-1 bg-[#38222B] text-[#E57373] px-2.5 py-1 rounded-full">
                <Beef className="w-3.5 h-3.5" />
                <span>{meal.computed.protein}g P</span>
              </span>
              <span className="flex items-center gap-1 bg-[#352B20] text-[#FFB74D] px-2.5 py-1 rounded-full">
                <Wheat className="w-3.5 h-3.5" />
                <span>{meal.computed.carbs}g K</span>
              </span>
              <span className="flex items-center gap-1 bg-[#202936] text-[#64B5F6] px-2.5 py-1 rounded-full">
                <Droplet className="w-3.5 h-3.5" />
                <span>{meal.computed.fat}g Y</span>
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-8 h-8 rounded-full bg-[#2A283A] hover:bg-[#343248] text-[#A5A2B8] hover:text-white flex items-center justify-center transition"
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
