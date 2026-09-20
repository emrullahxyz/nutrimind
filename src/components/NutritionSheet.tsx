import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flame, Beef, Wheat, Droplet, Trash2 } from "lucide-react";
import { ZERO_NUTRITION } from "../types";
import type { MealCategory, MealItem, Nutrition } from "../types";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useModalHistory } from "../hooks/useModalHistory";
import { useModalExit } from "../hooks/useModalExit";
import { scaleMealSources } from "../lib/nutrition";
import { EditableStat, toDraft, fromDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { MEAL_CATEGORIES, categoryForHour } from "../lib/mealCategory";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  meal: MealItem | null;
  onSave?: (updatedMeal: MealItem) => void;
  onDelete?: (mealId: string) => void;
}

/** `multiplier`'la ölçeklenmiş besin değeri — hem render'da hem `handleStep`
 *  içinde (yeni çarpanın taslağını kurmak için) kullanılıyor, tek yerde. */
export function scaleMealNutrition(computed: Nutrition | undefined, multiplier: number): Nutrition {
  // Çarpan 1 iken HİÇBİR ŞEYE dokunma: `.toFixed(1)` turu, aç-kaydet akışında
  // 2 ondalığı sessizce 1 ondalığa tırnaklar (8.75 → 8.8). Kayıt `fromDraft`
  // ile gösterilen değeri geri yazar, yani taslağın saklananla birebir olması
  // şart. Yuvarlama yalnızca stepper ölçeklemesinde (m ≠ 1) isteniyor.
  if (multiplier === 1) return { ...(computed ?? ZERO_NUTRITION) };
  return {
    kcal: Math.round((computed?.kcal ?? 0) * multiplier),
    protein: Number(((computed?.protein ?? 0) * multiplier).toFixed(1)),
    carbs: Number(((computed?.carbs ?? 0) * multiplier).toFixed(1)),
    fat: Number(((computed?.fat ?? 0) * multiplier).toFixed(1)),
    fiber: Number(((computed?.fiber ?? 0) * multiplier).toFixed(1)),
    sugar: computed?.sugar !== undefined ? Number((computed.sugar * multiplier).toFixed(1)) : undefined,
    satFat: computed?.satFat !== undefined ? Number((computed.satFat * multiplier).toFixed(1)) : undefined,
    sodium: computed?.sodium !== undefined ? Math.round(computed.sodium * multiplier) : undefined,
  };
}

export function NutritionSheet({ isOpen, onClose, meal, onSave, onDelete }: Props) {
  // Lock background body scroll when modal is open
  useBodyScrollLock(isOpen);
  const { t } = useTranslation();

  const [label, setLabel] = useState(meal?.label ?? "");
  const [category, setCategory] = useState<MealCategory>(
    meal?.category ?? categoryForHour(new Date().getHours())
  );
  const [multiplier, setMultiplier] = useState(1);
  // Kartların kendisi düzenlenebilir alan — `draft` her zaman gösterilen değer.
  // "Miktar her zaman kazanır": stepper her basıldığında draft yeniden ölçeklenmiş
  // değerle kurulur ve `basis` "quantity"ye döner; bir alana doğrudan yazmak
  // `basis`'i "manual" yapar (kaydederken `sources` koparılır).
  const [basis, setBasis] = useState<"quantity" | "manual">("quantity");
  const [draft, setDraft] = useState<NutritionDraft>(() => toDraft(scaleMealNutrition(meal?.computed, 1)));

  // Sync state when meal prop changes
  useEffect(() => {
    if (meal) {
      setLabel(meal.label);
      setCategory(meal.category ?? categoryForHour(new Date().getHours()));
      setMultiplier(1);
      setBasis("quantity");
      setDraft(toDraft(scaleMealNutrition(meal.computed, 1)));
    }
  }, [meal]);

  // Geri tuşu/kaydırma/X entegrasyonu — bkz. `useModalHistory` (7 bileşende
  // elle kopyalanmış aynı deseni tek yere topluyor; bu dosyadaki eski sürüm
  // kapanışta `replaceState` kullanıyordu, bu da her açılışta geçmiş
  // yığınında boş bir girdi bırakıyordu — hook `history.back()` kullanıyor).
  // Blur çağrısı `onClose`'un içinde: odaklı bir `EditableStat` alanındaki
  // metin seçiliyse mobil "kes/kopyala" balonu input DOM'dan kalksa bile
  // ekranda asılı kalıyordu — kapanmadan önce blur ile seçimi bırakmak
  // balonu da kapatıyor (hem geri tuşu hem X/backdrop yolunda gerekli).
  const { requestClose: handleUserClose } = useModalHistory({
    active: isOpen && !!meal,
    onClose: () => {
      (document.activeElement as HTMLElement | null)?.blur();
      onClose();
    },
  });
  const { closing, beginClose } = useModalExit(handleUserClose);

  /** Tam-ekran diyalog: `aria-modal="true"` iddiası artık Tab tuzağı ve
   *  kapanışta odak iadesiyle karşılanıyor (bkz. `useDialogFocus`). Odak
   *  kapanışta açan öğeye döner — kapanış anında sheet İÇİNDEKİ alanın blur'u
   *  (yukarıdaki `onClose`) yine önce çalışır, kes/kopyala balonu asılı kalmaz. */
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogFocus({
    containerRef: rootRef,
    active: isOpen && !!meal && !closing,
    onEscape: beginClose,
    autoFocus: "container",
  });

  if (!isOpen || !meal) return null;

  const scaledSources = scaleMealSources(meal.sources, multiplier);

  function updateField(key: keyof NutritionDraft, value: string) {
    setBasis("manual");
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const handleStep = (delta: number) => {
    // Elle düzenlenen makro değerleri varsa uyar
    if (basis === "manual") {
      if (!window.confirm(t("nutrition.manualOverrideWarning"))) return;
    }
    // Miktar her zaman kazanır: porsiyon çarpanı değiştiğinde önceki elle
    // düzenlenmiş makro değerleri geçersiz kılınır, taslak yeniden ölçeklenmiş
    // değerle kurulur.
    const nextMultiplier = Math.max(0.25, Number((multiplier + delta).toFixed(2)));
    setMultiplier(nextMultiplier);
    setBasis("quantity");
    setDraft(toDraft(scaleMealNutrition(meal.computed, nextMultiplier)));
  };

  const handleApplySave = () => {
    if (!onSave) return;
    // Porsiyon çarpanı `sources[].qty`'yi de ölçeklemeli — aksi halde `computed`
    // iki katına çıkar ama kaynak miktar eski değerde kalır, `usualQuantity`nin
    // ("geçmişe dayalı miktar tahmini") temel aldığı veri bozulur. Bir alan elle
    // düzenlendiyse (`basis==="manual"`) hafıza bağlantısı koparılır.
    const finalNutrition = fromDraft(draft);
    const finalSources = basis === "manual" ? undefined : scaledSources;
    const updated: MealItem = {
      ...meal,
      label,
      category,
      computed: finalNutrition,
      ...(finalSources ? { sources: finalSources } : {}),
    };
    onSave(updated);
    beginClose();
  };

  return (
    <div
      ref={rootRef}
      data-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label={t("nutrition.title")}
      tabIndex={-1}
      className={`fixed inset-0 z-[9999] flex flex-col bg-app text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe glass-screen ${
        closing ? "glass-screen-out" : ""
      }`}
    >
      {/* Top Header */}
      {/* `pad-safe-t`: iPhone'da başlık status bar'ın altında kalmasın (geri düğmesi). */}
      <div className="pad-safe-t flex items-center justify-between px-4 py-3.5 sm:px-6 border-b border-white/10 flex-none bg-app">
        <button
          type="button"
          onClick={beginClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
          aria-label={t("meal.back")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-extrabold text-white tracking-wide">
          {t("nutrition.title")}
        </h2>

        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t("nutrition.confirmDelete"))) return;
              onDelete(meal.id);
              beginClose();
            }}
            className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition active:scale-95"
            title={t("nutrition.deleteMeal")}
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        ) : (
          <div className="w-10 h-10" />
        )}
      </div>

      {/* Main Scrollable Content Area */}
      {/* `pb-[calc(…var(--kb))]`: iOS klavyesi açılınca odaklanılan alan klavyenin
          altında kalmasın (bkz. hooks/useKeyboardInset). */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-[calc(1rem_+_var(--kb))]">
        {/* Meal Name Input Field (Besin Adı) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80 block">
            {t("nutrition.foodName")}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/20 text-sm font-semibold text-white focus:outline-none focus:border-white/40"
            placeholder={t("nutrition.foodName")}
          />
        </div>

        {/* Category Selector Pills */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80 block">{t("meal.categoryLabel")}</label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {MEAL_CATEGORIES.map((c) => {
              const isSelected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                    isSelected
                      ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                      : "border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
                  }`}
                >
                  {t(`meal.category${c.charAt(0).toUpperCase() + c.slice(1)}`)}
                </button>
              );
            })}
          </div>
        </div>


        {/* Serving Amount Stepper (Porsiyon Miktarı) */}
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm font-semibold text-white/90">
            {t("nutrition.servingAmount")}
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

        {/* Calories Hero Card — tıklayınca direkt düzenlenebilir */}
        <label htmlFor="macro-kcal" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center justify-between cursor-text">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-white/50">{t("nutrition.calories")}</div>
              <EditableStat
                id="macro-kcal"
                value={draft.kcal ?? ""}
                onChange={(v) => updateField("kcal", v)}
                className="text-2xl font-black text-white tabular-nums tracking-tight w-24"
              />
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 font-mono">kcal</div>
        </label>

        {/* 3 Main Macros Grid (Protein, Karbonhidrat, Yağ) */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Protein */}
          <label htmlFor="macro-protein" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px] cursor-text">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Beef className="w-3.5 h-3.5 text-protein-bright" />
              <span>{t("nutrition.protein")}</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <EditableStat
                id="macro-protein"
                value={draft.protein ?? ""}
                onChange={(v) => updateField("protein", v)}
                className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight w-12"
              />
              <span className="text-base sm:text-lg font-black text-white">g</span>
            </div>
          </label>

          {/* Karbonhidrat */}
          <label htmlFor="macro-carbs" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px] cursor-text">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Wheat className="w-3.5 h-3.5 text-carb-bright" />
              <span>{t("nutrition.carbs")}</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <EditableStat
                id="macro-carbs"
                value={draft.carbs ?? ""}
                onChange={(v) => updateField("carbs", v)}
                className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight w-12"
              />
              <span className="text-base sm:text-lg font-black text-white">g</span>
            </div>
          </label>

          {/* Yağ */}
          <label htmlFor="macro-fat" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px] cursor-text">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Droplet className="w-3.5 h-3.5 text-fat-bright" />
              <span>{t("nutrition.fat")}</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <EditableStat
                id="macro-fat"
                value={draft.fat ?? ""}
                onChange={(v) => updateField("fat", v)}
                className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight w-12"
              />
              <span className="text-base sm:text-lg font-black text-white">g</span>
            </div>
          </label>
        </div>

        {/* Other Nutrition Facts List (Diğer Besin Değerleri) */}
        <div className="space-y-2.5 pt-2">
          <div className="text-sm font-bold text-white/90">{t("nutrition.otherNutrients")}</div>
          <p className="text-[11px] text-white/40">{t("nutrition.emptyMeansUnknown")}</p>
          <div className="space-y-2">
            {/* Doymuş Yağ */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.satFat")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.satFat ?? ""}
                  onChange={(v) => updateField("satFat", v)}
                  placeholder="—"
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">g</span>
              </div>
            </div>
            {/* Sodyum */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.sodium")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.sodium ?? ""}
                  onChange={(v) => updateField("sodium", v)}
                  placeholder="—"
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">mg</span>
              </div>
            </div>
            {/* Lif */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.fiber")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.fiber ?? ""}
                  onChange={(v) => updateField("fiber", v)}
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">g</span>
              </div>
            </div>
            {/* Şeker */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.sugar")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.sugar ?? ""}
                  onChange={(v) => updateField("sugar", v)}
                  placeholder="—"
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">g</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Width Bottom Save Button */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-app flex-none">
        <button
          type="button"
          onClick={handleApplySave}
          className="w-full py-4 rounded-full bg-white text-black font-extrabold text-base hover:bg-white/90 transition shadow-xl active:scale-[0.98]"
        >
          {t("meal.save")}
        </button>
      </div>
    </div>
  );
}
