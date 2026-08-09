import { useMemo, useState } from "react";
import { useModalHistory } from "../hooks/useModalHistory";
import { ArrowLeft, Sparkles, Plus, Check } from "lucide-react";
import {
  EMPTY_DRAFT,
  ErrorText,
  ExpandableMealName,
  NumField,
  NutrientSummaryLine,
  NutritionFields,
  TextField,
  fromDraft,
  hasUnsavedBasketEntry,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { ItemEditFields } from "./ItemEditFields";
import type { EditableItem } from "./ItemEditFields";
import { Skeleton } from "./Skeleton";
import { AiError, aiErrorMessage, parseWithAI } from "../lib/ai";
import { useData } from "../lib/data";
import { fetchData } from "../lib/api";
import { mealsOf, toPayload } from "../lib/days";
import { GRAM_UNIT, parseNum, scaleNutrition, toGrams, unitOptions } from "../lib/nutrition";
import { formatKcal, todayISO, weekdayIndex } from "../lib/format";
import { effectiveProfile } from "../lib/goals";
import { rankAliases } from "../lib/aliasRank";
import { categoryForHour, MEAL_CATEGORIES, MEAL_CATEGORY_LABELS } from "../lib/mealCategory";
import type { AIParseItem, Alias, MealCategory, MealPayload, MealSource, Nutrition } from "../types";
import { usualQuantity } from "../lib/quantity";
import { AliasPicker } from "./AliasPicker";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

type Mode = "alias" | "manual" | "ai";

/** Kaydet'te aktif sekmede listeye eklenmemiş kalem bulununca gösterilen mesaj. */
const UNSAVED_ENTRY_ERROR =
  "Girdiğin kalem henüz listeye eklenmedi. '+ Öğüne Bir Kalem Daha Ekle' ile ekle ya da alanları temizle.";

interface BasketItem {
  id: string;
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
  needsReview?: boolean;
}

function BasketSection({
  basket,
  aliases,
  editingIndex,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onClear,
  editDraft,
  setEditDraft,
  basketTotal,
}: {
  basket: BasketItem[];
  aliases: Alias[];
  editingIndex: number | null;
  onStartEdit: (idx: number) => void;
  onSaveEdit: (idx: number) => void;
  onCancelEdit: () => void;
  onRemove: (idx: number) => void;
  onClear: () => void;
  editDraft: EditableItem;
  setEditDraft: (d: EditableItem) => void;
  basketTotal: Nutrition | null;
}) {
  if (basket.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <span className="font-bold text-xs text-white/80">
          Öğün Kalemleri ({basket.length})
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-red-400 hover:underline"
        >
          Temizle
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {basket.map((item, idx) => {
          const isEditing = editingIndex === idx;
          if (isEditing) {
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-white/20 bg-white/[0.06] p-3 text-white"
              >
                <TextField
                  label="Kalem Adı"
                  value={editDraft.name}
                  onChange={(name) => setEditDraft({ ...editDraft, name })}
                />
                <ItemEditFields item={editDraft} aliases={aliases} onChange={setEditDraft} />
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:text-white"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveEdit(idx)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black"
                  >
                    Tamam
                  </button>
                </div>
              </li>
            );
          }

          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-white"
            >
              <div className="flex flex-col min-w-0">
                <span className="flex items-center gap-1.5 font-bold">
                  <ExpandableMealName name={item.name} className="text-white" />
                  {item.needsReview && (
                    <span
                      title="AI bu değerden emin değil"
                      className="h-2 w-2 flex-none rounded-full bg-amber-400"
                    />
                  )}
                </span>
                <NutrientSummaryLine
                  as="span"
                  nutrition={item.nutrition}
                  className="font-mono text-[10px] text-white/50"
                />
              </div>
              <div className="flex flex-none items-center gap-2 font-mono text-xs">
                <span className="font-bold text-amber-400">{formatKcal(item.nutrition.kcal)}</span>
                <button
                  type="button"
                  onClick={() => onStartEdit(idx)}
                  className="text-xs text-white/60 hover:text-white font-sans"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-white/40 hover:text-red-400 font-sans ml-1"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {basketTotal && (
        <NutrientSummaryLine
          nutrition={basketTotal}
          kcal="total"
          className="mt-1 border-t border-white/10 pt-2 font-mono text-xs text-amber-400 font-bold"
        />
      )}
    </div>
  );
}

/** Öğün ekleme/düzenleme full screen modal */
export function MealForm({
  date,
  editIndex,
  onClose,
  initialAIItems,
  initialCategory,
  isOpen = true,
}: {
  date: string;
  editIndex: number | null;
  onClose: () => void;
  initialAIItems?: AIParseItem[];
  initialCategory?: MealCategory;
  isOpen?: boolean;
}) {
  // Lock background body scroll when modal is open
  useBodyScrollLock(isOpen);

  // Geri tuşu/kaydırma/X entegrasyonu — bkz. `useModalHistory` (7 bileşende
  // elle kopyalanmış aynı deseni tek yere topluyor; bu dosyadaki eski sürüm
  // kapanışta `replaceState` kullanıyordu, bu da her açılışta geçmiş
  // yığınında boş bir girdi bırakıyordu — hook `history.back()` kullanıyor).
  const { requestClose: handleUserClose } = useModalHistory({ active: isOpen, onClose });

  const { aliases, days, usageIndex, goals, setDayMeals } = useData();
  const existing = editIndex === null ? undefined : mealsOf(days, date)[editIndex];

  const mealIndex = editIndex !== null ? editIndex : mealsOf(days, date).length;

  const initialRankedAliases = useMemo(() => {
    const today = todayISO();
    const ctx = {
      today,
      weekday: weekdayIndex(today),
      profileId: effectiveProfile(goals, today).id,
      mealIndex,
    };
    return rankAliases(aliases, usageIndex, ctx);
  }, [aliases, usageIndex, goals, mealIndex]);

  const [mode, setMode] = useState<Mode>("alias");
  const [category, setCategory] = useState<MealCategory>(
    initialCategory ?? existing?.category ?? categoryForHour(new Date().getHours())
  );
  const [name, setName] = useState(
    existing?.label ??
      (initialAIItems && initialAIItems.length > 0
        ? initialAIItems.length > 1
          ? initialAIItems.map((it) => it.name).join(" + ")
          : initialAIItems[0].name
        : "")
  );
  const [draft, setDraft] = useState<NutritionDraft>(existing ? toDraft(existing.computed) : EMPTY_DRAFT);
  const [aliasId, setAliasId] = useState(() => initialRankedAliases[0]?.id ?? aliases[0]?.id ?? "");

  const [grams, setGrams] = useState(() => {
    const first = initialRankedAliases[0] ?? aliases[0];
    if (!first) return "100";
    const est = usualQuantity(days, first.id, GRAM_UNIT.name, aliases);
    return String(est !== null ? est.value : first.serving_g);
  });
  const [unitName, setUnitName] = useState(GRAM_UNIT.name);

  const [manualItemName, setManualItemName] = useState("");

  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [basket, setBasket] = useState<BasketItem[]>(() => {
    if (existing) {
      return [
        { id: `existing-${Date.now()}`, name: existing.label, nutrition: existing.computed, sources: existing.sources },
      ];
    }
    if (initialAIItems && initialAIItems.length > 0) {
      return initialAIItems.map((it, i) => ({
        id: `vision-${Date.now()}-${i}-${Math.random()}`,
        name: it.name,
        nutrition: it.nutrition,
        ...(it.needsReview ? { needsReview: true } : {}),
      }));
    }
    return [];
  });

  const [editingBasketIndex, setEditingBasketIndex] = useState<number | null>(null);
  const [basketEditDraft, setBasketEditDraft] = useState<EditableItem>({
    name: "",
    nutrition: fromDraft(EMPTY_DRAFT),
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** "Hafızadan" sekmesinde kullanıcı aliası/miktarı/birimi son "+ Ekle"den beri
   *  DEĞİŞTİRDİ mi? Bkz. `hasUnsavedBasketEntry`'nin JSDoc'u — varsayılan
   *  seçim her zaman geçerli olduğu için yalnızca "seçili + miktar > 0" kontrolü
   *  düzenleme ekranını açar açmaz Kaydet'i yanlışlıkla bloke ederdi. */
  const [aliasPendingAdd, setAliasPendingAdd] = useState(false);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    if (existing && basket.length === 0) {
      setBasket([
        {
          id: `existing-${Date.now()}`,
          name: existing.label,
          nutrition: existing.computed,
          sources: existing.sources,
        },
      ]);
    }
  }

  function startEditingBasketItem(idx: number) {
    const item = basket[idx];
    if (!item) return;
    setEditingBasketIndex(idx);
    setBasketEditDraft({
      name: item.name,
      nutrition: item.nutrition,
      sources: item.sources,
    });
  }

  function saveBasketItemEdit(idx: number) {
    const item = basket[idx];
    if (!item) return;
    const updatedName = basketEditDraft.name.trim() || item.name;
    setBasket(
      basket.map((it, i) =>
        i === idx
          ? {
              ...it,
              name: updatedName,
              nutrition: basketEditDraft.nutrition,
              sources: basketEditDraft.sources,
              needsReview: false,
            }
          : it
      )
    );
    setEditingBasketIndex(null);
  }

  function cancelBasketItemEdit() {
    setEditingBasketIndex(null);
  }

  const alias = aliases.find((a) => a.id === aliasId);
  const estimate = useMemo(
    () => (aliasId ? usualQuantity(days, aliasId, unitName, aliases) : null),
    [days, aliasId, unitName, aliases]
  );
  const availableUnits = useMemo(() => unitOptions(alias?.units), [alias]);
  const isDifferentFromEstimate =
    estimate !== null && parseNum(grams) > 0 && Math.abs(parseNum(grams) - estimate.value) > 0.01;
  const showServingReset = alias !== undefined && parseNum(grams) !== alias.serving_g;

  function pickAlias(id: string) {
    setAliasPendingAdd(true);
    setAliasId(id);
    const picked = aliases.find((a) => a.id === id);
    if (picked) {
      setUnitName(GRAM_UNIT.name);
      const est = usualQuantity(days, id, GRAM_UNIT.name, aliases);
      setGrams(String(est !== null ? est.value : picked.serving_g));
    }
  }

  function handleGramsChange(v: string) {
    setAliasPendingAdd(true);
    setGrams(v);
  }

  function handleUnitChange(newUnitName: string) {
    setAliasPendingAdd(true);
    setUnitName(newUnitName);
    const currentVal = parseNum(grams);
    if (alias && currentVal > 0) {
      const currentUnitObj = availableUnits.find((u) => u.name === unitName) ?? GRAM_UNIT;
      const currentInGrams = toGrams(currentVal, currentUnitObj);
      const targetOpt = availableUnits.find((u) => u.name === newUnitName);
      if (targetOpt && targetOpt.grams > 0) {
        const newVal = currentInGrams / targetOpt.grams;
        const rounded = newVal >= 10 ? Math.round(newVal) : Number(newVal.toFixed(1));
        setGrams(String(rounded));
      }
    }
  }

  const scaled = useMemo(() => {
    if (!alias) return null;
    const val = parseNum(grams);
    if (val <= 0) return null;
    const selectedUnitObj = availableUnits.find((u) => u.name === unitName) ?? GRAM_UNIT;
    const totalGrams = toGrams(val, selectedUnitObj);
    if (totalGrams <= 0) return null;
    return scaleNutrition(alias.nutrition, alias.serving_g, totalGrams);
  }, [alias, grams, unitName, availableUnits]);

  const currentManualNutrition = useMemo(() => fromDraft(draft), [draft]);
  const hasManualNutrition = currentManualNutrition.kcal > 0 || currentManualNutrition.protein > 0;

  const basketTotal = useMemo(() => {
    if (basket.length === 0) return null;
    return basket.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.nutrition.kcal,
        protein: Number((acc.protein + item.nutrition.protein).toFixed(1)),
        carbs: Number((acc.carbs + item.nutrition.carbs).toFixed(1)),
        fat: Number((acc.fat + item.nutrition.fat).toFixed(1)),
        fiber: Number((acc.fiber + item.nutrition.fiber).toFixed(1)),
        sugar:
          acc.sugar !== undefined || item.nutrition.sugar !== undefined
            ? Number(((acc.sugar ?? 0) + (item.nutrition.sugar ?? 0)).toFixed(1))
            : undefined,
        satFat:
          acc.satFat !== undefined || item.nutrition.satFat !== undefined
            ? Number(((acc.satFat ?? 0) + (item.nutrition.satFat ?? 0)).toFixed(1))
            : undefined,
        sodium:
          acc.sodium !== undefined || item.nutrition.sodium !== undefined
            ? Math.round((acc.sodium ?? 0) + (item.nutrition.sodium ?? 0))
            : undefined,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } as Nutrition
    );
  }, [basket]);

  const finalNutrition = useMemo<Nutrition | null>(() => {
    if (basket.length > 0) return basketTotal;
    if (mode === "alias") return scaled;
    if (mode === "manual") return currentManualNutrition;
    return null;
  }, [basket.length, basketTotal, mode, scaled, currentManualNutrition]);

  const finalName = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed) return trimmed;
    if (basket.length > 0) return basket.map((b) => b.name).join(" + ");
    if (mode === "alias" && alias) return alias.name;
    if (mode === "manual" && manualItemName.trim()) return manualItemName.trim();
    return "";
  }, [name, basket, mode, alias, manualItemName]);

  const canSave = finalName.length > 0 && finalNutrition !== null && (finalNutrition.kcal > 0 || finalNutrition.protein > 0);

  function addAliasToBasket() {
    if (!alias || !scaled) return;
    const qtyVal = parseNum(grams);
    if (qtyVal <= 0) return;

    let currentBasket = basket;
    if (existing && currentBasket.length === 0) {
      currentBasket = [
        {
          id: `existing-${Date.now()}`,
          name: existing.label,
          nutrition: existing.computed,
          sources: existing.sources,
        },
      ];
    }

    const newItem: BasketItem = {
      id: `alias-${Date.now()}-${Math.random()}`,
      name: alias.name,
      nutrition: scaled,
      sources: [{ aliasId: alias.id, qty: qtyVal, unit: unitName }],
    };

    const nextBasket = [...currentBasket, newItem];
    setBasket(nextBasket);
    setAliasPendingAdd(false);
    if (nextBasket.length > 1) {
      setName(nextBasket.map((b) => b.name).join(" + "));
    } else {
      setName(alias.name);
    }
  }

  function addManualToBasket() {
    if (!hasManualNutrition) return;

    let currentBasket = basket;
    if (existing && currentBasket.length === 0) {
      currentBasket = [
        {
          id: `existing-${Date.now()}`,
          name: existing.label,
          nutrition: existing.computed,
          sources: existing.sources,
        },
      ];
    }

    const itemName = manualItemName.trim() || (existing ? "Ek Kalem" : "Kalem");
    const newItem: BasketItem = {
      id: `manual-${Date.now()}-${Math.random()}`,
      name: itemName,
      nutrition: currentManualNutrition,
    };

    const nextBasket = [...currentBasket, newItem];
    setBasket(nextBasket);
    setManualItemName("");
    setDraft(EMPTY_DRAFT);
    if (nextBasket.length > 1) {
      setName(nextBasket.map((b) => b.name).join(" + "));
    } else {
      setName(itemName);
    }
  }

  function addAIItemsToBasket(items: AIParseItem[]) {
    if (items.length === 0) return;

    let currentBasket = basket;
    if (existing && currentBasket.length === 0) {
      currentBasket = [
        {
          id: `existing-${Date.now()}`,
          name: existing.label,
          nutrition: existing.computed,
          sources: existing.sources,
        },
      ];
    }

    const newItems: BasketItem[] = items.map((it, i) => ({
      id: `ai-${Date.now()}-${i}-${Math.random()}`,
      name: it.name,
      nutrition: it.nutrition,
      ...(it.needsReview ? { needsReview: true } : {}),
    }));

    const nextBasket = [...currentBasket, ...newItems];
    setBasket(nextBasket);
    setName(nextBasket.length > 1 ? nextBasket.map((b) => b.name).join(" + ") : nextBasket[0].name);
  }

  async function analyzeWithAI() {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await parseWithAI(aiText.trim());
      if (result.items.length === 0) {
        setAiError("AI bu metinden bir besin çıkaramadı. Daha açık yazmayı dene.");
      } else {
        addAIItemsToBasket(result.items);
        setAiText("");
      }
    } catch (e) {
      setAiError(
        e instanceof AiError ? aiErrorMessage(e.status, e.message, e.retryAfter) : String((e as Error)?.message ?? e)
      );
    } finally {
      setAiLoading(false);
    }
  }

  function removeFromBasket(index: number) {
    if (editingBasketIndex === index) {
      setEditingBasketIndex(null);
    }
    const nextBasket = basket.filter((_, i) => i !== index);
    setBasket(nextBasket);
    if (nextBasket.length === 1) {
      setName(nextBasket[0].name);
    } else if (nextBasket.length > 1) {
      setName(nextBasket.map((b) => b.name).join(" + "));
    }
  }

  async function save() {
    if (!canSave || !finalNutrition || saving) return;
    if (
      hasUnsavedBasketEntry({
        basketLength: basket.length,
        mode,
        hasManualNutrition,
        aliasPendingAdd,
        aliasAddable: scaled !== null,
      })
    ) {
      setErr(UNSAVED_ENTRY_ERROR);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const fresh = await fetchData();
      const next: MealPayload[] = toPayload(mealsOf(fresh.days, date));

      const cleanNutrition: Nutrition = {
        kcal: Math.max(0, Math.round(finalNutrition.kcal || 0)),
        protein: Math.max(0, Number((finalNutrition.protein || 0).toFixed(1))),
        carbs: Math.max(0, Number((finalNutrition.carbs || 0).toFixed(1))),
        fat: Math.max(0, Number((finalNutrition.fat || 0).toFixed(1))),
        fiber: Math.max(0, Number((finalNutrition.fiber || 0).toFixed(1))),
        sugar: finalNutrition.sugar !== undefined ? Math.max(0, Number((finalNutrition.sugar || 0).toFixed(1))) : undefined,
        satFat: finalNutrition.satFat !== undefined ? Math.max(0, Number((finalNutrition.satFat || 0).toFixed(1))) : undefined,
        sodium: finalNutrition.sodium !== undefined ? Math.max(0, Math.round(finalNutrition.sodium || 0)) : undefined,
      };

      let entrySources: MealSource[] | undefined;
      if (basket.length > 0) {
        const collected = basket.flatMap((b) => b.sources ?? []);
        if (collected.length > 0) entrySources = collected;
      } else if (mode === "alias" && alias && scaled && parseNum(grams) > 0) {
        entrySources = [
          {
            aliasId: alias.id,
            qty: parseNum(grams),
            unit: unitName,
          },
        ];
      }

      const loggedAt = editIndex === null ? new Date().toISOString() : existing?.loggedAt;

      const entry: MealPayload = {
        name: finalName.slice(0, 100).trim(),
        nutrition: cleanNutrition,
        ...(entrySources && entrySources.length > 0 ? { sources: entrySources } : {}),
        ...(loggedAt ? { loggedAt } : {}),
        category,
      };

      if (editIndex === null) next.push(entry);
      else next[editIndex] = entry;

      await setDayMeals(date, next);
      handleUserClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  if (!isOpen) return null;

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
          {editIndex === null ? "Öğün Ekle" : "Öğünü Düzenle"}
        </h2>

        <div className="w-10 h-10" />
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Mode Selector Tabs (Hafızadan | Elle | AI ile) */}
        <div className="flex rounded-full border border-white/15 bg-white/[0.04] p-1.5 gap-1">
          <button
            type="button"
            onClick={() => switchMode("alias")}
            className={`flex-1 py-2.5 rounded-full text-xs font-extrabold transition-all active:scale-95 ${
              mode === "alias" ? "bg-white text-black shadow-md" : "text-white/70 hover:text-white"
            }`}
          >
            Hafızadan
          </button>
          <button
            type="button"
            onClick={() => switchMode("manual")}
            className={`flex-1 py-2.5 rounded-full text-xs font-extrabold transition-all active:scale-95 ${
              mode === "manual" ? "bg-white text-black shadow-md" : "text-white/70 hover:text-white"
            }`}
          >
            Elle
          </button>
          <button
            type="button"
            onClick={() => switchMode("ai")}
            className={`flex-1 py-2.5 rounded-full text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1 ${
              mode === "ai" ? "bg-white text-black shadow-md" : "text-white/70 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> AI ile
          </button>
        </div>

        {/* Category Selector Pills (Kahvaltı, Öğle, Akşam, Atıştırmalık) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80 block">Öğün Kategorisi</label>
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
                  {MEAL_CATEGORY_LABELS[c]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Body depending on Mode */}
        {mode === "alias" ? (
          aliases.length === 0 ? (
            <p className="text-sm text-white/60">Hafızada besin yok. "Elle" sekmesinden ekleyebilirsin.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white">
                <AliasPicker
                  aliases={aliases}
                  selectedAliasId={aliasId}
                  onSelectAlias={pickAlias}
                  label="Hafızadan besin seç"
                  mealIndex={mealIndex}
                />

                <div className="flex items-end gap-2 pt-1">
                  <div className="flex-1">
                    <NumField label="Miktar" value={grams} onChange={handleGramsChange} />
                  </div>
                  <div className="w-32 flex-none">
                    <label className="block text-xs text-white/70 font-semibold mb-1">Birim</label>
                    <select
                      className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                      value={unitName}
                      onChange={(e) => handleUnitChange(e.target.value)}
                    >
                      {availableUnits.map((u) => (
                        <option key={u.name} value={u.name} className="bg-[#191825] text-white">
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(isDifferentFromEstimate || showServingReset) && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    {isDifferentFromEstimate && estimate ? (
                      <button
                        type="button"
                        onClick={() => handleGramsChange(String(estimate.value))}
                        className="flex items-center gap-1 text-amber-400 hover:underline font-medium"
                      >
                        <span>✨ her zamanki {estimate.value} {unitName}</span>
                      </button>
                    ) : (
                      <span />
                    )}
                    {showServingReset && alias && (
                      <button
                        type="button"
                        onClick={() => {
                          setAliasPendingAdd(true);
                          setUnitName(GRAM_UNIT.name);
                          setGrams(String(alias.serving_g));
                        }}
                        className="text-[11px] text-white/40 hover:text-white font-mono"
                      >
                        porsiyon: {alias.serving_g}g
                      </button>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={addAliasToBasket}
                    disabled={!scaled}
                    className="w-full py-3 px-4 rounded-full bg-amber-400/15 border border-amber-400/30 text-xs font-bold text-amber-300 hover:bg-amber-400/25 transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm"
                  >
                    <Plus className="w-4 h-4 text-amber-400" />
                    <span>+ {basket.length > 0 ? "Öğüne Bir Kalem Daha Ekle" : "Bu Besini Öğüne Kalem Olarak Ekle (Çoklu Malzeme)"}</span>
                  </button>
                </div>
              </div>

              <BasketSection
                basket={basket}
                aliases={aliases}
                editingIndex={editingBasketIndex}
                onStartEdit={startEditingBasketItem}
                onSaveEdit={saveBasketItemEdit}
                onCancelEdit={cancelBasketItemEdit}
                onRemove={removeFromBasket}
                onClear={() => {
                  setEditingBasketIndex(null);
                  setBasket([]);
                }}
                editDraft={basketEditDraft}
                setEditDraft={setBasketEditDraft}
                basketTotal={basketTotal}
              />

              <TextField
                label={basket.length > 0 ? "Birleşik Öğün Adı" : "Öğün Adı"}
                value={name}
                onChange={setName}
                placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : alias?.name ?? ""}
              />
            </div>
          )
        ) : mode === "manual" ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white">
              {basket.length > 0 && (
                <TextField
                  label="Eklenecek Kalem Adı (opsiyonel)"
                  value={manualItemName}
                  onChange={setManualItemName}
                  placeholder="örn. Ekstra Yoğurt"
                />
              )}
              <NutritionFields draft={draft} onChange={setDraft} />

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={addManualToBasket}
                  disabled={!hasManualNutrition}
                  className="rounded-full bg-white/10 border border-white/20 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:opacity-40"
                >
                  + {basket.length > 0 ? "Listeye ekle" : "Kalem ekle (çoklu malzeme)"}
                </button>
              </div>
            </div>

            <BasketSection
              basket={basket}
              aliases={aliases}
              editingIndex={editingBasketIndex}
              onStartEdit={startEditingBasketItem}
              onSaveEdit={saveBasketItemEdit}
              onCancelEdit={cancelBasketItemEdit}
              onRemove={removeFromBasket}
              onClear={() => {
                setEditingBasketIndex(null);
                setBasket([]);
              }}
              editDraft={basketEditDraft}
              setEditDraft={setBasketEditDraft}
              basketTotal={basketTotal}
            />

            <TextField
              label={basket.length > 0 ? "Birleşik Öğün Adı" : "Öğün Adı"}
              value={name}
              onChange={setName}
              placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : "örn. Yulaf + protein + süt"}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-white/80 block">Ne yedin? (AI Analiz)</span>
                <textarea
                  className="w-full min-h-[96px] p-3 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-amber-400 resize-none"
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="örn. 200g tavuk göğsü ve 1 kase pilav"
                />
              </label>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={analyzeWithAI}
                  disabled={aiLoading || !aiText.trim()}
                  className="rounded-full bg-amber-400 px-5 py-2 text-xs font-extrabold text-black transition hover:bg-amber-300 disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {aiLoading ? "Analiz ediliyor…" : "Analiz Et"}
                </button>
              </div>

              {aiError && <ErrorText>{aiError}</ErrorText>}
            </div>

            {aiLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ) : (
              <BasketSection
                basket={basket}
                aliases={aliases}
                editingIndex={editingBasketIndex}
                onStartEdit={startEditingBasketItem}
                onSaveEdit={saveBasketItemEdit}
                onCancelEdit={cancelBasketItemEdit}
                onRemove={removeFromBasket}
                onClear={() => {
                  setEditingBasketIndex(null);
                  setBasket([]);
                }}
                editDraft={basketEditDraft}
                setEditDraft={setBasketEditDraft}
                basketTotal={basketTotal}
              />
            )}

            <TextField
              label={basket.length > 0 ? "Birleşik Öğün Adı" : "Öğün Adı"}
              value={name}
              onChange={setName}
              placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : ""}
            />
          </div>
        )}

        {err && <ErrorText>{err}</ErrorText>}
      </div>

      {/* Full Width Bottom Save Button */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-[#171622] flex-none">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="w-full py-4 rounded-full bg-white text-black font-extrabold text-base hover:bg-white/90 transition shadow-xl active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" /> {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
