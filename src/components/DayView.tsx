import { useState } from "react";
import { CalorieRing } from "./CalorieRing";
import { MacroBar } from "./MacroBar";
import { MacroDonut } from "./MacroDonut";
import { Card } from "./Card";
import { MealForm } from "./MealForm";
import { ConfirmButton, ErrorText, FormActions, TextField } from "./FormBits";
import { Modal } from "./Modal";
import { formatKcal, formatNumber } from "../lib/format";
import { useData } from "../lib/data";
import { dayTotal, mealsOf, sumMeals, toPayload } from "../lib/days";
import type { MealItem, MealPayload } from "../types";

function MergeModal({
  selectedMeals,
  onConfirm,
  onClose,
  busy,
}: {
  selectedMeals: MealItem[];
  onConfirm: (name: string) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const defaultName = selectedMeals.map((m) => m.label).join(" + ");
  const [name, setName] = useState(defaultName);
  const totalNutrition = sumMeals(selectedMeals);

  return (
    <Modal title={`${selectedMeals.length} Öğünü Birleştir`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <TextField label="Birleşik öğün adı" value={name} onChange={setName} placeholder="örn. Kahvaltı" />
        <div className="rounded-chip border border-line bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-semibold text-ink-secondary">Birleşecek Öğünler:</p>
          <ul className="space-y-1 text-xs text-ink-tertiary">
            {selectedMeals.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>• {m.label}</span>
                <span className="font-mono">{formatKcal(m.computed.kcal)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-2 font-mono text-xs text-accent">
            <strong>Toplam: {formatKcal(totalNutrition.kcal)}</strong> (P{formatNumber(totalNutrition.protein, 1)} · K
            {formatNumber(totalNutrition.carbs, 1)} · Y{formatNumber(totalNutrition.fat, 1)} · L
            {formatNumber(totalNutrition.fiber, 1)})
          </div>
        </div>
        <FormActions
          onCancel={onClose}
          onSave={() => onConfirm(name.trim() || defaultName)}
          saving={busy}
          disabled={!name.trim()}
          saveLabel="Birleştir"
        />
      </div>
    </Modal>
  );
}

/** Bir günün besin görselleri (halka + makro donut + barlar + öğün katkısı)
 *  ve öğün ekleme/düzenleme/silme/birleştirme kontrolleri. */
export function DayView({ date, emptyLabel = "Bu gün için kayıt yok." }: { date: string; emptyLabel?: string }) {
  const { goals, days, setDayMeals } = useData();
  const meals = mealsOf(days, date);
  const total = dayTotal(days, date);
  const hasData = meals.length > 0;

  // editIndex: null = yeni öğün, sayı = o indeksli öğünü düzenle. form kapalıysa undefined.
  const [editIndex, setEditIndex] = useState<number | null | undefined>(undefined);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleSelect(index: number) {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  }

  async function removeMeal(index: number) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await setDayMeals(
        date,
        toPayload(meals.filter((_, i) => i !== index)),
      );
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMergeConfirm(mergedName: string) {
    if (busy || selectedIndices.length < 2) return;
    setErr(null);
    setBusy(true);
    try {
      const selectedMeals = selectedIndices.map((i) => meals[i]);
      const mergedNutrition = sumMeals(selectedMeals);
      const mergedMeal: MealPayload = { name: mergedName, nutrition: mergedNutrition };

      const firstIndex = Math.min(...selectedIndices);
      const selectedSet = new Set(selectedIndices);

      const nextPayload: MealPayload[] = [];
      meals.forEach((m, idx) => {
        if (idx === firstIndex) {
          nextPayload.push(mergedMeal);
        } else if (!selectedSet.has(idx)) {
          nextPayload.push({ name: m.label, nutrition: m.computed });
        }
      });

      await setDayMeals(date, nextPayload);
      setSelectedIndices([]);
      setShowMergeModal(false);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function closeForm() {
    setEditIndex(undefined);
    setErr(null);
  }

  const selectedMeals = selectedIndices.map((i) => meals[i]).filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex items-center justify-center p-6">
          <CalorieRing consumed={total.kcal} target={goals.kcal} />
        </Card>
        {hasData ? (
          <Card className="flex items-center justify-center p-6">
            <MacroDonut nutrition={total} />
          </Card>
        ) : (
          <Card className="flex items-center justify-center p-6 text-center text-sm text-ink-tertiary">
            {emptyLabel}
          </Card>
        )}
      </div>

      {hasData && (
        <Card className="flex flex-col gap-4 p-6">
          <MacroBar kind="protein" value={total.protein} target={goals.protein} />
          <MacroBar kind="carb" value={total.carbs} target={goals.carbs} />
          <MacroBar kind="fat" value={total.fat} target={goals.fat} />
          <MacroBar kind="memory" value={total.fiber} target={goals.fiber} />
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink-secondary">Öğün katkısı</h3>
            {selectedIndices.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIndices([])}
                className="text-[11px] text-ink-tertiary hover:text-ink-primary"
              >
                (Seçimi Temizle)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedIndices.length >= 2 && (
              <button
                type="button"
                onClick={() => setShowMergeModal(true)}
                disabled={busy}
                className="rounded-pill bg-memory px-3 py-1.5 text-xs font-bold text-memory-ink transition hover:opacity-90 disabled:opacity-40"
              >
                🔗 Birleştir ({selectedIndices.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditIndex(null)}
              disabled={busy}
              className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              + Öğün ekle
            </button>
          </div>
        </div>

        {err && <ErrorText>{err}</ErrorText>}

        {hasData ? (
          <ul className="flex flex-col gap-2.5">
            {meals.map((m, i) => {
              const pct = total.kcal ? (m.computed.kcal / total.kcal) * 100 : 0;
              const isSelected = selectedIndices.includes(i);
              return (
                <li key={m.id} className="group anim-fadeup flex flex-col gap-1" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <label className="flex min-w-0 cursor-pointer items-baseline gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(i)}
                        className={`h-3.5 w-3.5 rounded border-line bg-white/[0.06] text-accent focus:ring-0 transition-opacity duration-150 ${
                          isSelected ? "opacity-100" : "opacity-100 fine:opacity-0 fine:group-hover:opacity-100 focus:opacity-100"
                        }`}
                      />
                      <span className={`min-w-0 truncate text-sm font-semibold transition-colors ${isSelected ? "text-accent" : "text-ink-primary"}`}>
                        {m.label}
                      </span>
                    </label>
                    <span className="flex flex-none items-center gap-2">
                      <span className="font-mono text-xs text-ink-secondary">
                        {formatKcal(m.computed.kcal)}
                        <span className="ml-1 text-ink-tertiary">%{Math.round(pct)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditIndex(i)}
                        disabled={busy}
                        className="rounded-pill bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
                      >
                        Düzenle
                      </button>
                      <ConfirmButton onConfirm={() => removeMeal(i)} disabled={busy} />
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-memory-deep to-memory shadow-memory"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-tertiary">Henüz öğün yok. "+ Öğün ekle" ile başla.</p>
        )}
      </section>

      {editIndex !== undefined && <MealForm date={date} editIndex={editIndex} onClose={closeForm} />}

      {showMergeModal && (
        <MergeModal
          selectedMeals={selectedMeals}
          onConfirm={handleMergeConfirm}
          onClose={() => setShowMergeModal(false)}
          busy={busy}
        />
      )}
    </div>
  );
}
