import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Flame, Beef, Wheat, Droplet, Trash2, Check, Sparkles } from "lucide-react";
import type { MealItem, Nutrition } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  meal: MealItem | null;
  onSave?: (updatedMeal: MealItem) => void;
  onDelete?: (mealId: string) => void;
}

const UNITS = ["g", "porsiyon", "adet", "dilim", "ölçek"];

export function NutritionSheet({ isOpen, onClose, meal, onSave, onDelete }: Props) {
  const isPoppedRef = useRef(false);

  const [label, setLabel] = useState(meal?.label ?? "");
  const [multiplier, setMultiplier] = useState(1);
  const [unit, setUnit] = useState("g");
  const [showDetails, setShowDetails] = useState(true);

  // Sync state when meal prop changes
  useEffect(() => {
    if (meal) {
      setLabel(meal.label);
      setMultiplier(1);
    }
  }, [meal]);

  useEffect(() => {
    if (!isOpen || !meal) return;
    window.history.pushState({ isModal: true, title: "Besin Detayı" }, "");

    const handlePopState = () => {
      isPoppedRef.current = true;
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!isPoppedRef.current && window.history.state?.isModal) {
        window.history.back();
      }
    };
  }, [isOpen, meal, onClose]);

  const handleUserClose = () => {
    if (!isPoppedRef.current && window.history.state?.isModal) {
      window.history.back();
    } else {
      onClose();
    }
  };

  if (!isOpen || !meal) return null;

  // Scaled nutrition based on multiplier stepper
  const scaledNutrition: Nutrition = {
    kcal: Math.round((meal.computed?.kcal ?? 0) * multiplier),
    protein: Number(((meal.computed?.protein ?? 0) * multiplier).toFixed(1)),
    carbs: Number(((meal.computed?.carbs ?? 0) * multiplier).toFixed(1)),
    fat: Number(((meal.computed?.fat ?? 0) * multiplier).toFixed(1)),
    fiber: Number(((meal.computed?.fiber ?? 0) * multiplier).toFixed(1)),
    sugar: meal.computed?.sugar !== undefined ? Number(((meal.computed.sugar) * multiplier).toFixed(1)) : undefined,
    satFat: meal.computed?.satFat !== undefined ? Number(((meal.computed.satFat) * multiplier).toFixed(1)) : undefined,
    sodium: meal.computed?.sodium !== undefined ? Math.round((meal.computed.sodium) * multiplier) : undefined,
  };

  const handleStep = (delta: number) => {
    setMultiplier((prev) => Math.max(0.25, Number((prev + delta).toFixed(2))));
  };

  const handleApplySave = () => {
    if (!onSave) return;
    const updated: MealItem = {
      ...meal,
      label,
      computed: scaledNutrition,
    };
    onSave(updated);
    onClose();
  };

  const totalKcal = scaledNutrition.kcal || 1;
  const proteinPct = Math.min(100, Math.round((scaledNutrition.protein * 4 / totalKcal) * 100));
  const carbsPct = Math.min(100, Math.round((scaledNutrition.carbs * 4 / totalKcal) * 100));
  const fatPct = Math.min(100, Math.round((scaledNutrition.fat * 9 / totalKcal) * 100));

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#13121b] text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 border-b border-white/10 flex-none bg-[#13121b]">
        <button
          type="button"
          onClick={handleUserClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
          aria-label="Geri"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center min-w-0 flex-1 px-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="bg-transparent text-center font-bold text-lg sm:text-xl text-white focus:outline-none focus:border-b focus:border-white/30 truncate max-w-[240px]"
            placeholder="Besin Adı"
          />
        </div>

        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              onDelete(meal.id);
              onClose();
            }}
            className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition active:scale-95"
            title="Öğünü Sil"
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        ) : (
          <div className="w-10 h-10" />
        )}
      </div>

      {/* Main Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Serving Size Measurement (Porsiyon Birimi) */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-white/80 block">
            Porsiyon Birimi
          </label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {UNITS.map((u) => {
              const isSelected = unit.toLowerCase() === u.toLowerCase();
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                    isSelected
                      ? "bg-white text-black shadow-md"
                      : "border border-white/20 bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>
        </div>

        {/* Serving Amount Stepper (Porsiyon Miktarı) */}
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm font-semibold text-white/90">
            Porsiyon Miktarı
          </span>
          <div className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/[0.04] px-4 py-2 min-w-[140px] justify-between">
            <button
              type="button"
              onClick={() => handleStep(-0.25)}
              className="text-white/70 hover:text-white text-lg font-bold transition active:scale-90 w-6 h-6 flex items-center justify-center"
            >
              —
            </button>
            <span className="font-extrabold text-white text-base min-w-[36px] text-center tabular-nums">
              {multiplier}x <span className="text-xs font-normal text-white/50">{unit}</span>
            </span>
            <button
              type="button"
              onClick={() => handleStep(0.25)}
              className="text-white/70 hover:text-white text-lg font-bold transition active:scale-90 w-6 h-6 flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        {/* Calories Hero Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5 fill-amber-400/20" />
            </div>
            <div>
              <div className="text-xs font-medium text-white/50">Kalori</div>
              <div className="text-2xl font-black text-amber-400 tabular-nums tracking-tight">
                {scaledNutrition.kcal}
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 font-mono">kcal</div>
        </div>

        {/* 3 Main Macros Grid (Protein, Karbonhidrat, Yağ) with Percentages */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Protein */}
          <div className="rounded-2xl border border-protein/20 bg-protein/10 p-3 flex flex-col justify-between min-h-[85px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-protein">
                <Beef className="w-3.5 h-3.5" />
                <span>Protein</span>
              </div>
              <span className="text-[10px] text-protein/70 font-mono font-bold">%{proteinPct}</span>
            </div>
            <div className="text-base sm:text-lg font-black text-protein tabular-nums tracking-tight mt-1">
              {scaledNutrition.protein}g
            </div>
          </div>

          {/* Karbonhidrat */}
          <div className="rounded-2xl border border-carbs/20 bg-carbs/10 p-3 flex flex-col justify-between min-h-[85px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-carbs">
                <Wheat className="w-3.5 h-3.5" />
                <span>Karb</span>
              </div>
              <span className="text-[10px] text-carbs/70 font-mono font-bold">%{carbsPct}</span>
            </div>
            <div className="text-base sm:text-lg font-black text-carbs tabular-nums tracking-tight mt-1">
              {scaledNutrition.carbs}g
            </div>
          </div>

          {/* Yağ */}
          <div className="rounded-2xl border border-fat/20 bg-fat/10 p-3 flex flex-col justify-between min-h-[85px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fat">
                <Droplet className="w-3.5 h-3.5" />
                <span>Yağ</span>
              </div>
              <span className="text-[10px] text-fat/70 font-mono font-bold">%{fatPct}</span>
            </div>
            <div className="text-base sm:text-lg font-black text-fat tabular-nums tracking-tight mt-1">
              {scaledNutrition.fat}g
            </div>
          </div>
        </div>

        {/* Other Nutrition Facts List (Diğer Besin Değerleri) */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white/90 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent" /> Diğer Besin Değerleri
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-accent font-semibold hover:underline"
            >
              {showDetails ? "Gizle" : "Göster"}
            </button>
          </div>

          {showDetails && (
            <div className="space-y-2">
              {/* Doymuş Yağ */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-white/80">🥑 Doymuş Yağ</span>
                <span className="font-extrabold text-white">
                  {scaledNutrition.satFat !== undefined ? `${scaledNutrition.satFat}g` : "—"}
                </span>
              </div>
              {/* Lif (Fiber) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-white/80">🌾 Lif (Fiber)</span>
                <span className="font-extrabold text-white">{scaledNutrition.fiber}g</span>
              </div>
              {/* Şeker (Sugar) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-white/80">🍬 Şeker (Sugar)</span>
                <span className="font-extrabold text-white">
                  {scaledNutrition.sugar !== undefined ? `${scaledNutrition.sugar}g` : "—"}
                </span>
              </div>
              {/* Sodyum */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
                <span className="font-medium text-white/80">🧂 Sodyum</span>
                <span className="font-extrabold text-white">
                  {scaledNutrition.sodium !== undefined ? `${scaledNutrition.sodium}mg` : "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Width Bottom Save Button */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-[#13121b] flex-none">
        <button
          type="button"
          onClick={handleApplySave}
          className="w-full py-4 rounded-full bg-white text-black font-extrabold text-base hover:bg-white/90 transition shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" /> Değişiklikleri Kaydet
        </button>
      </div>
    </div>
  );
}
