import { useState, useEffect, useRef } from "react";
import { consumeProgrammaticBack } from "../lib/backStack";
import { ArrowLeft, Flame, Beef, Wheat, Droplet, Trash2, Plus } from "lucide-react";
import type { MealItem, Nutrition } from "../types";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { scaleMealSources } from "../lib/nutrition";
import { formatMicroOrDash } from "../lib/format";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  meal: MealItem | null;
  onSave?: (updatedMeal: MealItem) => void;
  onDelete?: (mealId: string) => void;
  onEditMealItems?: () => void;
}

export function NutritionSheet({ isOpen, onClose, meal, onSave, onDelete, onEditMealItems }: Props) {
  const isPoppedRef = useRef(false);

  // Lock background body scroll when modal is open
  useBodyScrollLock(isOpen);

  const [label, setLabel] = useState(meal?.label ?? "");
  const [multiplier, setMultiplier] = useState(1);

  // Sync state when meal prop changes
  useEffect(() => {
    if (meal) {
      setLabel(meal.label);
      setMultiplier(1);
    }
  }, [meal]);

  useEffect(() => {
    if (!isOpen || !meal) return;
    isPoppedRef.current = false;
    window.history.pushState({ isModal: true, modalType: "nutrition", tab: "daily" }, "");

    const handlePopState = (e: PopStateEvent) => {
      // Başka bir overlay'in temizliğinden doğan `back()` bize ait değil
      // (bkz. MealForm'daki aynı not).
      if (consumeProgrammaticBack(e)) return;
      isPoppedRef.current = true;
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!isPoppedRef.current && window.history.state?.isModal) {
        window.history.replaceState({ tab: "daily" }, "");
      }
    };
  }, [isOpen, meal, onClose]);

  const handleUserClose = () => {
    if (!isPoppedRef.current && window.history.state?.isModal) {
      window.history.replaceState({ tab: "daily" }, "");
    }
    onClose();
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
    // Porsiyon çarpanı `sources[].qty`'yi de ölçeklemeli — aksi halde `computed`
    // iki katına çıkar ama kaynak miktar eski değerde kalır, `usualQuantity`nin
    // ("geçmişe dayalı miktar tahmini") temel aldığı veri bozulur.
    const scaledSources = scaleMealSources(meal.sources, multiplier);
    const updated: MealItem = {
      ...meal,
      label,
      computed: scaledNutrition,
      ...(scaledSources ? { sources: scaledSources } : {}),
    };
    onSave(updated);
    handleUserClose();
  };

  return (
    <div
      data-modal="true"
      className="fixed inset-0 z-[9999] flex flex-col bg-[#171622] text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 border-b border-white/10 flex-none bg-[#171622]">
        <button
          type="button"
          onClick={handleUserClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
          aria-label="Geri"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-extrabold text-white tracking-wide">
          Nutrition
        </h2>

        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              onDelete(meal.id);
              handleUserClose();
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
        {/* Meal Name Input Field (Besin Adı) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80 block">
            Besin Adı
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/20 text-sm font-semibold text-white focus:outline-none focus:border-white/40"
            placeholder="Besin Adı"
          />
        </div>

        {/* Add Extra Item Button (Bu Öğüne Ekstra Kalem/Besin Ekle) */}
        {onEditMealItems && (
          <button
            type="button"
            onClick={() => {
              handleUserClose();
              onEditMealItems();
            }}
            className="w-full py-3 px-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 font-extrabold text-xs transition active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>+ Bu Öğüne Ekstra Besin / Kalem Ekle</span>
          </button>
        )}

        {/* Serving Amount Stepper (Porsiyon Miktarı) */}
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm font-semibold text-white/90">
            Porsiyon Miktarı
          </span>
          <div className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/[0.04] px-4 py-2.5 min-w-[130px] justify-between">
            <button
              type="button"
              onClick={() => handleStep(-0.25)}
              className="text-white/70 hover:text-white text-lg font-bold transition active:scale-90 w-6 h-6 flex items-center justify-center"
            >
              —
            </button>
            <span className="font-extrabold text-white text-base min-w-[28px] text-center tabular-nums">
              {multiplier}
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
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-white/50">Kalori</div>
              <div className="text-2xl font-black text-white tabular-nums tracking-tight">
                {scaledNutrition.kcal}
              </div>
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 font-mono">kcal</div>
        </div>

        {/* 3 Main Macros Grid (Protein, Karbonhidrat, Yağ) */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Protein */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Beef className="w-3.5 h-3.5 text-[#FF6B8A]" />
              <span>Protein</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight mt-1">
              {scaledNutrition.protein}g
            </div>
          </div>

          {/* Karbonhidrat */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Wheat className="w-3.5 h-3.5 text-[#FFB84D]" />
              <span>Karb</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight mt-1">
              {scaledNutrition.carbs}g
            </div>
          </div>

          {/* Yağ */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Droplet className="w-3.5 h-3.5 text-[#5B8DEF]" />
              <span>Yağ</span>
            </div>
            <div className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight mt-1">
              {scaledNutrition.fat}g
            </div>
          </div>
        </div>

        {/* Other Nutrition Facts List (Diğer Besin Değerleri) */}
        <div className="space-y-2.5 pt-2">
          <div className="text-sm font-bold text-white/90">Diğer besin değerleri</div>
          <div className="space-y-2">
            {/* Doymuş Yağ */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">Doymuş Yağ</span>
              <span className={`font-extrabold ${scaledNutrition.satFat !== undefined ? "text-white" : "text-white/30"}`}>
                {formatMicroOrDash(scaledNutrition.satFat, "g")}
              </span>
            </div>
            {/* Sodyum */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">Sodyum</span>
              <span className={`font-extrabold ${scaledNutrition.sodium !== undefined ? "text-white" : "text-white/30"}`}>
                {formatMicroOrDash(scaledNutrition.sodium, "mg")}
              </span>
            </div>
            {/* Lif */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">Lif</span>
              <span className="font-extrabold text-white">{scaledNutrition.fiber}g</span>
            </div>
            {/* Şeker */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">Şeker</span>
              <span className={`font-extrabold ${scaledNutrition.sugar !== undefined ? "text-white" : "text-white/30"}`}>
                {formatMicroOrDash(scaledNutrition.sugar, "g")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Full Width Bottom Save Button */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-[#171622] flex-none">
        <button
          type="button"
          onClick={handleApplySave}
          className="w-full py-4 rounded-full bg-white text-black font-extrabold text-base hover:bg-white/90 transition shadow-xl active:scale-[0.98]"
        >
          Kaydet
        </button>
      </div>
    </div>
  );
}
