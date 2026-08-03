import { useState, useEffect, useRef } from "react";
import { X, Plus, Minus, Flame, Sparkles, Scale, Trash2, Check } from "lucide-react";
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#151421] border border-white/10 p-5 text-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Besin & Makro Detayı</h2>
              <p className="text-xs text-white/50">Miktarı düzenle & değerleri incele</p>
            </div>
          </div>
          <button
            onClick={handleUserClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {/* Meal Label Input */}
          <div>
            <label className="text-[10px] text-white/40 mb-1 block font-semibold uppercase tracking-wider">
              Yemek / Besin Adı
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm font-semibold text-white focus:outline-none focus:border-accent"
            />
          </div>

          {/* Quantity & Unit Stepper */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/70">Porsiyon Çarpanı / Miktar</span>
              <div className="flex gap-1">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnit(u)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                      unit === u ? "bg-accent text-black font-bold" : "bg-white/5 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <button
                onClick={() => handleStep(-0.25)}
                className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white font-bold transition-all"
              >
                <Minus className="w-5 h-5" />
              </button>

              <div className="text-center">
                <div className="text-2xl font-black tracking-tight text-accent">
                  {multiplier}x <span className="text-xs font-normal text-white/50">{unit}</span>
                </div>
                <div className="text-[10px] text-white/40">Hesaplanan Porsiyon</div>
              </div>

              <button
                onClick={() => handleStep(0.25)}
                className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white font-bold transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Macro Cards Grid */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center">
              <div className="text-xs text-white/40 font-medium">Kalori</div>
              <div className="text-base font-black text-amber-400 mt-0.5">{scaledNutrition.kcal}</div>
              <div className="text-[9px] text-white/30">kcal</div>
            </div>
            <div className="p-3 rounded-2xl bg-protein/10 border border-protein/20 text-center">
              <div className="text-xs text-protein font-medium">Protein</div>
              <div className="text-base font-black text-protein mt-0.5">{scaledNutrition.protein}g</div>
              <div className="text-[9px] text-protein/50">%{(scaledNutrition.protein * 4 / (scaledNutrition.kcal || 1) * 100).toFixed(0)}</div>
            </div>
            <div className="p-3 rounded-2xl bg-carbs/10 border border-carbs/20 text-center">
              <div className="text-xs text-carbs font-medium">Karb</div>
              <div className="text-base font-black text-carbs mt-0.5">{scaledNutrition.carbs}g</div>
              <div className="text-[9px] text-carbs/50">%{(scaledNutrition.carbs * 4 / (scaledNutrition.kcal || 1) * 100).toFixed(0)}</div>
            </div>
            <div className="p-3 rounded-2xl bg-fat/10 border border-fat/20 text-center">
              <div className="text-xs text-fat font-medium">Yağ</div>
              <div className="text-base font-black text-fat mt-0.5">{scaledNutrition.fat}g</div>
              <div className="text-[9px] text-fat/50">%{(scaledNutrition.fat * 9 / (scaledNutrition.kcal || 1) * 100).toFixed(0)}</div>
            </div>
          </div>

          {/* Secondary Nutrition Breakdown Drawer */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-white/80">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-memory" /> Detaylı Besin Değerleri
              </span>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-[10px] text-accent hover:underline"
              >
                {showDetails ? "Gizle" : "Göster"}
              </button>
            </div>

            {showDetails && (
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-white/5">
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                  <span className="text-white/50">🌾 Lif (Fiber)</span>
                  <span className="font-semibold">{scaledNutrition.fiber} g</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                  <span className="text-white/50">🍬 Şeker (Sugar)</span>
                  <span className="font-semibold">{scaledNutrition.sugar ?? "—"} g</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                  <span className="text-white/50">🥑 Doymuş Yağ</span>
                  <span className="font-semibold">{scaledNutrition.satFat ?? "—"} g</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
                  <span className="text-white/50">🧂 Sodyum</span>
                  <span className="font-semibold">{scaledNutrition.sodium !== undefined ? `${scaledNutrition.sodium} mg` : "—"}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="flex items-center gap-2 pt-3 border-t border-white/10">
          {onDelete && (
            <button
              onClick={() => {
                onDelete(meal.id);
                onClose();
              }}
              className="p-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all active:scale-95"
              title="Öğünü Sil"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={handleApplySave}
            className="flex-1 py-3 rounded-2xl bg-white text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/90 transition-all shadow-lg active:scale-95"
          >
            <Check className="w-4 h-4" /> Değişiklikleri Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
