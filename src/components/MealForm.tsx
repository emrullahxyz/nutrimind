import { useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
  FormActions,
  Label,
  NumField,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { mealsOf, sumMeals, toPayload } from "../lib/days";
import { parseNum, scaleNutrition } from "../lib/nutrition";
import { formatKcal, formatNumber } from "../lib/format";
import type { MealPayload, Nutrition } from "../types";

type Mode = "alias" | "manual";

interface BasketItem {
  id: string;
  name: string;
  grams: number;
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

  const [mode, setMode] = useState<Mode>(existing ? "manual" : "alias");
  const [name, setName] = useState(existing?.label ?? "");
  const [draft, setDraft] = useState<NutritionDraft>(existing ? toDraft(existing.computed) : EMPTY_DRAFT);
  const [aliasId, setAliasId] = useState(aliases[0]?.id ?? "");
  const [grams, setGrams] = useState(String(aliases[0]?.serving_g ?? 100));

  // Çoklu kalem (sepet) desteği
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const alias = aliases.find((a) => a.id === aliasId);
  const gramsValue = parseNum(grams);
  const scaled: Nutrition | null =
    alias && gramsValue > 0 ? scaleNutrition(alias.nutrition, alias.serving_g, gramsValue) : null;

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
    basket.length > 0 ? basketTotal : mode === "alias" ? scaled : fromDraft(draft);

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

  function addToBasket() {
    if (!alias || !scaled || gramsValue <= 0) return;
    const newItem: BasketItem = {
      id: `${alias.id}-${Date.now()}-${Math.random()}`,
      name: `${alias.name} (${gramsValue}g)`,
      grams: gramsValue,
      nutrition: scaled,
    };
    const nextBasket = [...basket, newItem];
    setBasket(nextBasket);
    if (!name.trim()) {
      setName(nextBasket.map((b) => b.name).join(" + "));
    }
  }

  function removeFromBasket(index: number) {
    const next = basket.filter((_, i) => i !== index);
    setBasket(next);
    if (next.length === 0) {
      setName("");
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
      {editIndex === null && (
        <div className="mb-4 flex gap-2">
          <ModeTab active={mode === "alias"} onClick={() => setMode("alias")} label="Hafızadan" />
          <ModeTab active={mode === "manual"} onClick={() => setMode("manual")} label="Elle" />
        </div>
      )}

      {mode === "alias" ? (
        aliases.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Hafızada besin yok. "Elle" sekmesinden ekleyebilirsin.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-chip border border-line bg-white/[0.02] p-3">
              <label className="block">
                <Label>Besin seç</Label>
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
                  onClick={addToBasket}
                  disabled={!scaled}
                  className="rounded-chip border border-memory bg-memory/10 px-3 py-2 text-xs font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
                >
                  + Listeye ekle
                </button>
              </div>

              {scaled && basket.length === 0 && (
                <div className="font-mono text-[11px] text-ink-secondary">
                  {formatKcal(scaled.kcal)}
                  <span className="ml-2 text-ink-tertiary">
                    P{formatNumber(scaled.protein, 1)} · K{formatNumber(scaled.carbs, 1)} · Y
                    {formatNumber(scaled.fat, 1)} · L{formatNumber(scaled.fiber, 1)}
                  </span>
                </div>
              )}
            </div>

            {basket.length > 0 && (
              <div className="flex flex-col gap-2 rounded-chip border border-line bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-ink-secondary">
                    Eklenen Kalemler ({basket.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setBasket([])}
                    className="text-[11px] text-ink-tertiary hover:text-danger"
                  >
                    Temizle
                  </button>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {basket.map((item, idx) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded bg-white/[0.04] px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-medium text-ink-primary">{item.name}</span>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-ink-secondary">
                        <span>{formatKcal(item.nutrition.kcal)}</span>
                        <button
                          type="button"
                          onClick={() => removeFromBasket(idx)}
                          className="text-ink-tertiary transition hover:text-danger"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {basketTotal && (
                  <div className="mt-1 border-t border-line pt-2 font-mono text-xs text-accent">
                    <strong>Toplam: {formatKcal(basketTotal.kcal)}</strong> (P
                    {formatNumber(basketTotal.protein, 1)} · K{formatNumber(basketTotal.carbs, 1)} · Y
                    {formatNumber(basketTotal.fat, 1)} · L{formatNumber(basketTotal.fiber, 1)})
                  </div>
                )}
              </div>
            )}

            <TextField
              label="Öğün adı"
              value={name}
              onChange={setName}
              placeholder={basket.length > 0 ? basket.map((b) => b.name).join(" + ") : alias?.name ?? ""}
            />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <TextField label="Öğün adı" value={name} onChange={setName} placeholder="örn. Yulaf + protein + süt" />
          <NutritionFields draft={draft} onChange={setDraft} />
        </div>
      )}

      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={requestClose} onSave={save} saving={saving} disabled={!canSave} />
    </Modal>
  );
}
