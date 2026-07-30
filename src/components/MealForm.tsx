import { useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
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
import { useData } from "../lib/data";
import { mealsOf, sumMeals, toPayload } from "../lib/days";
import { NUTRIENTS } from "../lib/nutrients";
import { parseNum, scaleNutrition } from "../lib/nutrition";
import { formatKcal } from "../lib/format";
import type { MealPayload, Nutrition } from "../types";

type Mode = "alias" | "manual";

interface BasketItem {
  id: string;
  name: string;
  nutrition: Nutrition;
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
              className="flex items-center justify-between rounded bg-white/[0.04] px-2.5 py-2 text-xs"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-ink-primary truncate">{item.name}</span>
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
}: {
  date: string;
  editIndex: number | null;
  onClose: () => void;
}) {
  const { aliases, days, setDayMeals } = useData();
  const existing = editIndex === null ? undefined : mealsOf(days, date)[editIndex];

  // Varsayılan olarak "Hafızadan" seçili gelsin
  const [mode, setMode] = useState<Mode>("alias");
  const [name, setName] = useState(existing?.label ?? "");
  const [draft, setDraft] = useState<NutritionDraft>(existing ? toDraft(existing.computed) : EMPTY_DRAFT);
  const [aliasId, setAliasId] = useState(aliases[0]?.id ?? "");
  const [grams, setGrams] = useState(String(aliases[0]?.serving_g ?? 100));

  // Elle modunda girilen münferit kalem adı
  const [manualItemName, setManualItemName] = useState("");

  // Çoklu kalem (sepet) desteği — düzenleme modundaysa mevcut öğünü varsayılan ilk kalem yap
  const [basket, setBasket] = useState<BasketItem[]>(() =>
    existing
      ? [
          {
            id: `existing-${Date.now()}`,
            name: existing.label,
            nutrition: existing.computed,
          },
        ]
      : []
  );

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
  const gramsValue = parseNum(grams);
  const scaled: Nutrition | null =
    alias && gramsValue > 0 ? scaleNutrition(alias.nutrition, alias.serving_g, gramsValue) : null;

  const currentManualNutrition = fromDraft(draft);
  // Formdaki alanlardan en az biri doldurulmuş mu — kayıt üzerinden yürür ki
  // yeni bir besin eklenince burası da kendiliğinden kapsasın.
  const hasManualNutrition = NUTRIENTS.some((def) => (currentManualNutrition[def.key] ?? 0) > 0);

  // Sepette öğün var ise onların toplamı, yoksa tekli alias/manual hesabı
  const basketTotal: Nutrition | null =
    basket.length > 0
      ? sumMeals(basket.map((b) => ({ id: b.id, label: b.name, computed: b.nutrition })))
      : null;

  const defaultName =
    basket.length > 0
      ? basket.map((b) => b.name).join(" + ")
      : mode === "alias"
        ? name.trim() || alias?.name || ""
        : name.trim();

  const finalName = name.trim() || defaultName;
  const finalNutrition =
    basket.length > 0 ? basketTotal : mode === "alias" ? scaled : hasManualNutrition ? currentManualNutrition : null;

  const canSave = finalName.length > 0 && finalNutrition !== null;

  function requestClose() {
    if (saving) return;
    onClose();
  }

  function pickAlias(id: string) {
    setAliasId(id);
    const a = aliases.find((x) => x.id === id);
    if (a) setGrams(String(a.serving_g));
  }

  function addAliasToBasket() {
    if (!alias || !scaled || gramsValue <= 0) return;

    let currentBasket = basket;
    if (existing && currentBasket.length === 0) {
      currentBasket = [
        {
          id: `existing-${Date.now()}`,
          name: existing.label,
          nutrition: existing.computed,
        },
      ];
    }

    const newItem: BasketItem = {
      id: `${alias.id}-${Date.now()}-${Math.random()}`,
      name: `${alias.name} (${gramsValue}g)`,
      nutrition: scaled,
    };
    const nextBasket = [...currentBasket, newItem];
    setBasket(nextBasket);
    setName(nextBasket.map((b) => b.name).join(" + "));
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
    setName(nextBasket.map((b) => b.name).join(" + "));
  }

  function removeFromBasket(index: number) {
    if (editingBasketIndex === index) {
      setEditingBasketIndex(null);
    }
    const next = basket.filter((_, i) => i !== index);
    setBasket(next);
    if (next.length === 0) {
      setName(existing?.label ?? "");
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
      const entry: MealPayload = { name: finalName, nutrition: finalNutrition };
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
    <Modal title={editIndex === null ? "Öğün ekle" : "Öğünü düzenle"} onClose={requestClose}>
      <div className="mb-4 flex gap-2">
        <ModeTab active={mode === "alias"} onClick={() => switchMode("alias")} label="Hafızadan" />
        <ModeTab active={mode === "manual"} onClick={() => switchMode("manual")} label="Elle" />
      </div>

      {mode === "alias" ? (
        aliases.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Hafızada besin yok. "Elle" sekmesinden ekleyebilirsin.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-chip border border-line bg-white/[0.02] p-3">
              <label className="block">
                <Label>Hafızadan besin seç</Label>
                <select className={fieldCls} value={aliasId} onChange={(e) => pickAlias(e.target.value)}>
                  {aliases.map((a) => (
                    <option key={a.id} value={a.id} className="bg-elevated-2">
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <NumField label="Miktar" suffix="g" value={grams} onChange={setGrams} />
                </div>
                <button
                  type="button"
                  onClick={addAliasToBasket}
                  disabled={!scaled}
                  className="rounded-chip border border-memory bg-memory/10 px-3 py-2 text-xs font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
                >
                  + Listeye ekle
                </button>
              </div>

              {scaled && basket.length === 0 && (
                <NutrientSummaryLine
                  nutrition={scaled}
                  kcal="inline"
                  className="font-mono text-[11px] text-ink-secondary"
                />
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
              label="Birleşik Öğün Adı"
              value={name}
              onChange={setName}
              placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : alias?.name ?? ""}
            />
          </div>
        )
      ) : (
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
                className="rounded-chip border border-memory bg-memory/10 px-3 py-1.5 text-xs font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
              >
                + Listeye ekle
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
            label="Öğün Adı"
            value={name}
            onChange={setName}
            placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : "örn. Yulaf + protein + süt"}
          />
        </div>
      )}

      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={requestClose} onSave={save} saving={saving} disabled={!canSave} />
    </Modal>
  );
}
