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
import { mealsOf, toPayload } from "../lib/days";
import { parseNum, scaleNutrition } from "../lib/nutrition";
import { formatKcal, formatNumber } from "../lib/format";
import type { MealPayload, Nutrition } from "../types";

type Mode = "alias" | "manual";

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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const alias = aliases.find((a) => a.id === aliasId);
  const gramsValue = parseNum(grams);
  // Miktar boş/sıfır ise sıfır makrolu öğün kaydedilmesin.
  const scaled: Nutrition | null =
    alias && gramsValue > 0 ? scaleNutrition(alias.nutrition, alias.serving_g, gramsValue) : null;

  const finalName = mode === "alias" ? name.trim() || alias?.name || "" : name.trim();
  const finalNutrition = mode === "alias" ? scaled : fromDraft(draft);
  const canSave = finalName.length > 0 && finalNutrition !== null;

  /** Kayıt uçarken kapanmayı engelle: yazma sunucuya düşerken vazgeçilmiş sanılmasın. */
  function requestClose() {
    if (saving) return;
    onClose();
  }

  /** Alias değişince miktarı o besinin porsiyonuna sıfırla. */
  function pickAlias(id: string) {
    setAliasId(id);
    const a = aliases.find((x) => x.id === id);
    if (a) setGrams(String(a.serving_g));
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
            <label className="block">
              <Label>Besin</Label>
              <select className={fieldCls} value={aliasId} onChange={(e) => pickAlias(e.target.value)}>
                {aliases.map((a) => (
                  <option key={a.id} value={a.id} className="bg-elevated-2">
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <NumField label="Miktar" suffix="g" value={grams} onChange={setGrams} />
            <TextField
              label="Görünecek ad (opsiyonel)"
              value={name}
              onChange={setName}
              placeholder={alias?.name ?? ""}
            />

            {scaled && (
              <div className="rounded-chip border border-line bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-ink-secondary">
                {formatKcal(scaled.kcal)}
                <span className="ml-2 text-ink-tertiary">
                  P{formatNumber(scaled.protein, 1)} · K{formatNumber(scaled.carbs, 1)} · Y
                  {formatNumber(scaled.fat, 1)} · L{formatNumber(scaled.fiber, 1)}
                </span>
              </div>
            )}
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
