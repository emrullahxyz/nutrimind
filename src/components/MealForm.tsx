import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
  ExpandableMealName,
  FormActions,
  Label,
  NumField,
  NutrientSummaryLine,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { Skeleton } from "./Skeleton";
import { AiError, aiErrorMessage, parseWithAI } from "../lib/ai";
import { useData } from "../lib/data";
import { mealsOf, sumMeals, toPayload } from "../lib/days";
import { NUTRIENTS } from "../lib/nutrients";
import { GRAM_UNIT, parseNum, scaleNutrition, toGrams, unitOptions } from "../lib/nutrition";
import { formatKcal, todayISO, weekdayIndex } from "../lib/format";
import { effectiveProfile } from "../lib/goals";
import { buildUsageIndex, rankAliases } from "../lib/aliasRank";
import { categoryForHour, MEAL_CATEGORIES, MEAL_CATEGORY_LABELS } from "../lib/mealCategory";
import type { AIParseItem, MealCategory, MealPayload, MealSource, Nutrition } from "../types";
import { usualQuantity } from "../lib/quantity";
import { AliasPicker } from "./AliasPicker";

type Mode = "alias" | "manual" | "ai";

interface BasketItem {
  id: string;
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
  /** Faz 2: AI'nin bu değerden emin olmadığı anlamına gelir (görsel işaret için). */
  needsReview?: boolean;
}

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-3 py-1.5 text-xs font-bold transition ${
        active ? "bg-memory text-memory-ink" : "border border-line bg-white/[0.06] text-ink-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function BasketSection({
  basket,
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
  editingIndex: number | null;
  onStartEdit: (idx: number) => void;
  onSaveEdit: (idx: number) => void;
  onCancelEdit: () => void;
  onRemove: (idx: number) => void;
  onClear: () => void;
  editDraft: { name: string; nutrition: NutritionDraft };
  setEditDraft: (d: { name: string; nutrition: NutritionDraft }) => void;
  basketTotal: Nutrition | null;
}) {
  if (basket.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-chip border border-line bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-ink-secondary">
          Öğün Kalemleri ({basket.length})
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-ink-tertiary hover:text-danger"
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
                className="flex flex-col gap-2.5 rounded-chip border border-memory/40 bg-white/[0.06] p-3"
              >
                <TextField
                  label="Kalem Adı"
                  value={editDraft.name}
                  onChange={(name) => setEditDraft({ ...editDraft, name })}
                />
                <NutritionFields
                  draft={editDraft.nutrition}
                  onChange={(nutrition) => setEditDraft({ ...editDraft, nutrition })}
                />
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="rounded-pill border border-line px-3 py-1.5 text-xs text-ink-tertiary hover:text-ink-primary"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveEdit(idx)}
                    className="rounded-pill bg-memory px-3 py-1.5 text-xs font-bold text-memory-ink"
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
              className="flex items-center justify-between gap-3 rounded bg-white/[0.04] px-2.5 py-2 text-xs"
            >
              <div className="flex flex-col min-w-0">
                <span className="flex items-center gap-1.5">
                  <ExpandableMealName name={item.name} className="font-semibold text-ink-primary" />
                  {item.needsReview && (
                    <span
                      title="AI bu değerden emin değil, kontrol et"
                      className="h-1.5 w-1.5 flex-none rounded-full bg-warn"
                    />
                  )}
                </span>
                <NutrientSummaryLine
                  as="span"
                  nutrition={item.nutrition}
                  className="font-mono text-[10px] text-ink-tertiary"
                />
              </div>
              <div className="flex flex-none items-center gap-2 font-mono text-[11px] text-ink-secondary">
                <span>{formatKcal(item.nutrition.kcal)}</span>
                <button
                  type="button"
                  onClick={() => onStartEdit(idx)}
                  className="font-sans text-xs font-semibold text-ink-tertiary transition hover:text-memory"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-ink-tertiary transition hover:text-danger"
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
          className="mt-1 border-t border-line pt-2 font-mono text-xs text-accent"
        />
      )}
    </div>
  );
}

/** Öğün ekleme/düzenleme. editIndex null ise ekleme, değilse o günün o indeksli öğünü. */
export function MealForm({
  date,
  editIndex,
  onClose,
  initialAIItems,
}: {
  date: string;
  editIndex: number | null;
  onClose: () => void;
  initialAIItems?: AIParseItem[];
}) {
  const { aliases, days, goals, setDayMeals } = useData();
  const existing = editIndex === null ? undefined : mealsOf(days, date)[editIndex];

  const mealIndex = editIndex !== null ? editIndex : mealsOf(days, date).length;

  const initialRankedAliases = useMemo(() => {
    const usageIndex = buildUsageIndex(days, goals);
    const today = todayISO();
    const ctx = {
      today,
      weekday: weekdayIndex(today),
      profileId: effectiveProfile(goals, today).id,
      mealIndex,
    };
    return rankAliases(aliases, usageIndex, ctx);
  }, [aliases, days, goals, mealIndex]);

  // Varsayılan olarak "Hafızadan" seçili gelsin
  const [mode, setMode] = useState<Mode>("alias");
  const [category, setCategory] = useState<MealCategory>(
    existing?.category ?? categoryForHour(new Date().getHours()),
  );
  const [name, setName] = useState(
    existing?.label ??
      (initialAIItems && initialAIItems.length > 0
        ? initialAIItems.length > 1
          ? initialAIItems.map((it) => it.name).join(" + ")
          : initialAIItems[0].name
        : ""),
  );
  const [draft, setDraft] = useState<NutritionDraft>(existing ? toDraft(existing.computed) : EMPTY_DRAFT);
  const [aliasId, setAliasId] = useState(() => initialRankedAliases[0]?.id ?? aliases[0]?.id ?? "");

  // Tembel başlangıç: `usualQuantity` 10 örnek toplayana kadar TÜM geçmişi
  // tarıyor. Doğrudan çağrılsaydı her render'da (miktar kutusuna yazılan her
  // harfte) yeniden taranırdı; useState'in fonksiyon biçimi yalnızca ilk
  // render'da çalıştırır.
  const [grams, setGrams] = useState(() => {
    const first = initialRankedAliases[0] ?? aliases[0];
    if (!first) return "100";
    const est = usualQuantity(days, first.id, GRAM_UNIT.name, aliases);
    return String(est !== null ? est.value : first.serving_g);
  });
  const [unitName, setUnitName] = useState(GRAM_UNIT.name);

  // Elle modunda girilen münferit kalem adı
  const [manualItemName, setManualItemName] = useState("");

  // AI modu (Faz 2): serbest metin → Gemini → sepete otomatik ekleme.
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Çoklu kalem (sepet) desteği — düzenleme modundaysa mevcut öğünü varsayılan ilk kalem yap
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

  // Sepetteki bir kalemi satır-içi (inline) düzenleme durumu
  const [editingBasketIndex, setEditingBasketIndex] = useState<number | null>(null);
  const [basketEditDraft, setBasketEditDraft] = useState<{ name: string; nutrition: NutritionDraft }>({
    name: "",
    nutrition: EMPTY_DRAFT,
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      nutrition: toDraft(item.nutrition),
    });
  }

  function saveBasketItemEdit(idx: number) {
    if (editingBasketIndex === null) return;
    const nextBasket = [...basket];
    nextBasket[idx] = {
      ...nextBasket[idx],
      name: basketEditDraft.name.trim() || nextBasket[idx].name,
      nutrition: fromDraft(basketEditDraft.nutrition),
    };
    setBasket(nextBasket);
    setEditingBasketIndex(null);
    if (existing && name === existing.label) {
      setName(nextBasket.map((b) => b.name).join(" + "));
    }
  }

  function cancelBasketItemEdit() {
    setEditingBasketIndex(null);
  }

  const alias = aliases.find((a) => a.id === aliasId);
  const availableUnits = unitOptions(alias?.units);
  const selectedUnitObj = availableUnits.find((u) => u.name === unitName) ?? GRAM_UNIT;
  const amountValue = parseNum(grams);
  const calculatedGrams = toGrams(amountValue, selectedUnitObj);

  const scaled: Nutrition | null =
    alias && calculatedGrams > 0 ? scaleNutrition(alias.nutrition, alias.serving_g, calculatedGrams) : null;

  const currentManualNutrition = fromDraft(draft);
  // Formdaki alanlardan en az biri doldurulmuş mu — kayıt üzerinden yürür ki
  // yeni bir besin eklenince burası da kendiliğinden kapsasın.
  const hasManualNutrition = NUTRIENTS.some((def) => (currentManualNutrition[def.key] ?? 0) > 0);

  // Sepette öğün var ise mevcuttan veya yeni eklenenlerden sumMeals
  const basketTotal: Nutrition | null =
    basket.length > 0
      ? sumMeals(basket.map((b) => ({ id: b.id, label: b.name, computed: b.nutrition })))
      : null;

  const defaultName =
    basket.length > 0
      ? basket.length === 1
        ? basket[0].name.replace(/\s*\([^)]*\)$/, "")
        : basket.map((b) => b.name).join(" + ")
      : mode === "alias"
        ? name.trim() || alias?.name || ""
        : name.trim();

  const finalName = name.trim() || defaultName;
  const finalNutrition =
    basket.length > 0 ? basketTotal : mode === "alias" ? scaled : hasManualNutrition ? currentManualNutrition : null;

  const canSave = finalName.length > 0 && finalNutrition !== null;

  // Aynı sebeple memo'lu: yalnızca besin/birim/geçmiş değişince yeniden taranır,
  // miktar kutusuna yazarken değil.
  const estimate = useMemo(
    () => (alias ? usualQuantity(days, alias.id, unitName, aliases) : null),
    [alias, days, unitName, aliases],
  );

  // `✨ her zamanki` yalnızca kutudaki değer tahminden farklıyken görünsün
  const isDifferentFromEstimate = estimate !== null && amountValue !== estimate.value;
  const showServingReset = alias && (grams !== String(alias.serving_g) || unitName !== GRAM_UNIT.name);

  function requestClose() {
    if (saving) return;
    onClose();
  }

  function pickAlias(id: string) {
    setAliasId(id);
    const a = aliases.find((x) => x.id === id);
    const defaultUnit = GRAM_UNIT.name;
    setUnitName(defaultUnit);
    if (a) {
      const est = usualQuantity(days, id, defaultUnit, aliases);
      if (est !== null) {
        setGrams(String(est.value));
      } else {
        setGrams(String(a.serving_g));
      }
    }
  }

  function handleUnitChange(newUnit: string) {
    setUnitName(newUnit);
    if (alias) {
      const est = usualQuantity(days, alias.id, newUnit, aliases);
      if (est !== null) {
        setGrams(String(est.value));
      } else if (newUnit === GRAM_UNIT.name) {
        setGrams(String(alias.serving_g));
      } else {
        setGrams("1");
      }
    }
  }

  function addAliasToBasket() {
    if (!alias || !scaled || calculatedGrams <= 0) return;

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

    // Gramda eski biçim aynen korunur ("150g"); diğer birimlerde araya boşluk
    // girer ("2 adet") — geçmiş kayıtlarla görsel tutarlılık için.
    const unitSuffix =
      selectedUnitObj.name === GRAM_UNIT.name
        ? `${amountValue}g`
        : `${amountValue} ${selectedUnitObj.name}`;
    const newItem: BasketItem = {
      id: `${alias.id}-${Date.now()}-${Math.random()}`,
      name: `${alias.name} (${unitSuffix})`,
      nutrition: scaled,
      sources: [
        {
          aliasId: alias.id,
          qty: amountValue,
          unit: selectedUnitObj.name,
        },
      ],
    };
    const nextBasket = [...currentBasket, newItem];
    setBasket(nextBasket);
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
        e instanceof AiError ? aiErrorMessage(e.status, e.message, e.retryAfter) : String((e as Error)?.message ?? e),
      );
    } finally {
      setAiLoading(false);
    }
  }

  function removeFromBasket(index: number) {
    if (editingBasketIndex === index) {
      setEditingBasketIndex(null);
    }
    const next = basket.filter((_, i) => i !== index);
    setBasket(next);
    if (next.length === 0) {
      setName(existing?.label ?? "");
    } else if (next.length === 1) {
      setName(next[0].name.replace(/\s*\([^)]*\)$/, ""));
    } else {
      setName(next.map((b) => b.name).join(" + "));
    }
  }

  async function save() {
    if (!canSave || !finalNutrition) return;
    setSaving(true);
    setErr(null);
    try {
      const next: MealPayload[] = toPayload(mealsOf(days, date));

      let entrySources: MealSource[] | undefined;
      if (basket.length > 0) {
        const collected = basket.flatMap((b) => b.sources ?? []);
        if (collected.length > 0) entrySources = collected;
      } else if (mode === "alias" && alias && scaled && calculatedGrams > 0) {
        entrySources = [
          {
            aliasId: alias.id,
            qty: amountValue,
            unit: selectedUnitObj.name,
          },
        ];
      }

      const loggedAt = editIndex === null ? new Date().toISOString() : existing?.loggedAt;

      const entry: MealPayload = {
        name: finalName,
        nutrition: finalNutrition,
        ...(entrySources && entrySources.length > 0 ? { sources: entrySources } : {}),
        ...(loggedAt ? { loggedAt } : {}),
        category,
      };

      if (editIndex === null) next.push(entry);
      else next[editIndex] = entry;

      await setDayMeals(date, next);
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editIndex === null ? "Öğün ekle" : "Öğünü düzenle"}
      onClose={requestClose}
      footer={<FormActions onCancel={requestClose} onSave={save} saving={saving} disabled={!canSave} />}
    >
      <div className="mb-4 flex gap-2">
        <ModeTab active={mode === "alias"} onClick={() => switchMode("alias")} label="Hafızadan" />
        <ModeTab active={mode === "manual"} onClick={() => switchMode("manual")} label="Elle" />
        <ModeTab active={mode === "ai"} onClick={() => switchMode("ai")} label="AI ile" />
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {MEAL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`flex-none rounded-pill px-2.5 py-1 text-[11px] font-semibold transition ${
              category === c ? "bg-accent text-accent-ink" : "border border-line bg-white/[0.06] text-ink-tertiary"
            }`}
          >
            {MEAL_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {mode === "alias" ? (
        aliases.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Hafızada besin yok. "Elle" sekmesinden ekleyebilirsin.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-chip border border-line bg-white/[0.02] p-3">
              <AliasPicker
                aliases={aliases}
                selectedAliasId={aliasId}
                onSelectAlias={pickAlias}
                label="Hafızadan besin seç"
                mealIndex={mealIndex}
              />

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <NumField label="Miktar" value={grams} onChange={setGrams} />
                </div>
                <div className="w-28 flex-none">
                  <label className="block">
                    <Label>Birim</Label>
                    <select
                      className={fieldCls}
                      value={unitName}
                      onChange={(e) => handleUnitChange(e.target.value)}
                    >
                      {availableUnits.map((u) => (
                        <option key={u.name} value={u.name} className="bg-elevated-2">
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {basket.length > 0 && (
                  <button
                    type="button"
                    onClick={addAliasToBasket}
                    disabled={!scaled}
                    className="rounded-chip border border-memory bg-memory/10 px-3 py-2 text-xs font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
                  >
                    + Listeye ekle
                  </button>
                )}
              </div>

              {(isDifferentFromEstimate || showServingReset) && (
                <div className="flex items-center justify-between text-xs pt-0.5 px-0.5">
                  {isDifferentFromEstimate && estimate ? (
                    <button
                      type="button"
                      onClick={() => setGrams(String(estimate.value))}
                      className="flex items-center gap-1.5 text-memory hover:underline font-medium text-left"
                    >
                      <span>✨</span>
                      <span>
                        her zamanki {estimate.value} {unitName} · son {estimate.sampleCount} kayıt
                      </span>
                    </button>
                  ) : (
                    <span />
                  )}
                  {showServingReset && alias && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnitName(GRAM_UNIT.name);
                        setGrams(String(alias.serving_g));
                      }}
                      className="text-[11px] text-ink-tertiary hover:text-ink-primary font-mono transition"
                    >
                      porsiyon: {alias.serving_g} g
                    </button>
                  )}
                </div>
              )}

              {scaled && basket.length === 0 && (
                <NutrientSummaryLine
                  nutrition={scaled}
                  kcal="inline"
                  className="font-mono text-[11px] text-ink-secondary"
                />
              )}

              {basket.length === 0 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={addAliasToBasket}
                    disabled={!scaled}
                    className="flex items-center gap-1 text-xs font-semibold text-memory hover:underline disabled:opacity-40"
                  >
                    + Kalem ekle (çoklu malzeme)
                  </button>
                </div>
              )}
            </div>

            <BasketSection
              basket={basket}
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
              label={basket.length > 0 ? "Birleşik Öğün Adı" : "Öğün adı"}
              value={name}
              onChange={setName}
              placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : alias?.name ?? ""}
            />
          </div>
        )
      ) : mode === "manual" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-chip border border-line bg-white/[0.02] p-3">
            {basket.length > 0 && (
              <TextField
                label="Eklenecek Kalem Adı (opsiyonel)"
                value={manualItemName}
                onChange={setManualItemName}
                placeholder="örn. Ekstra Yoğurt"
              />
            )}
            <NutritionFields draft={draft} onChange={setDraft} />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={addManualToBasket}
                disabled={!hasManualNutrition}
                className={
                  basket.length > 0
                    ? "rounded-chip border border-memory bg-memory/10 px-3 py-1.5 text-xs font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
                    : "flex items-center gap-1 text-xs font-semibold text-memory hover:underline disabled:opacity-40"
                }
              >
                + {basket.length > 0 ? "Listeye ekle" : "Kalem ekle (çoklu malzeme)"}
              </button>
            </div>
          </div>

          <BasketSection
            basket={basket}
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
            label={basket.length > 0 ? "Birleşik Öğün Adı" : "Öğün adı"}
            value={name}
            onChange={setName}
            placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : "örn. Yulaf + protein + süt"}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="block">
            <Label>Ne yedin?</Label>
            <textarea
              className={`${fieldCls} min-h-[88px] resize-none`}
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="örn. 200g tavuk göğsü ve 1 kase pilav"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={analyzeWithAI}
              disabled={aiLoading || !aiText.trim()}
              className="rounded-chip bg-memory px-3 py-1.5 text-xs font-bold text-memory-ink transition hover:opacity-90 disabled:opacity-40"
            >
              {aiLoading ? "Analiz ediliyor…" : "Analiz Et"}
            </button>
          </div>

          {aiError && <ErrorText>{aiError}</ErrorText>}

          {aiLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full rounded-chip" />
              <Skeleton className="h-16 w-full rounded-chip" />
            </div>
          ) : (
            <BasketSection
              basket={basket}
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
            label={basket.length > 0 ? "Birleşik Öğün Adı" : "Öğün adı"}
            value={name}
            onChange={setName}
            placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : ""}
          />
        </div>
      )}

      {err && <ErrorText>{err}</ErrorText>}
    </Modal>
  );
}

