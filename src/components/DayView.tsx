import { useEffect, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { StatCardCarousel } from "./StatCardCarousel";
import { MacroBar } from "./MacroBar";
import { Card } from "./Card";
import { DayTypeBadge } from "./DayTypeBadge";
import { MealForm } from "./MealForm";
import { ErrorText, ExpandableMealName, FormActions, NutrientSummaryLine, TextField } from "./FormBits";
import { Modal } from "./Modal";
import { ScanSheet } from "./ScanSheet";
import { SupplementCard } from "./SupplementCard";
import { WeightCard } from "./WeightCard";
import { Collapsible } from "./Collapsible";
import { MealRow } from "./MealRow";
import { ExerciseModal } from "./ExerciseModal";
import { NutritionSheet } from "./NutritionSheet";
import { formatKcal } from "../lib/format";
import { useData } from "../lib/data";
import { effectiveGoal } from "../lib/goals";
import { MACROS, MICROS } from "../lib/nutrients";
import { coverage, dayTotal, mealsOf, sumMeals, toPayload } from "../lib/days";
import { newTemplateId, parseTemplatesConfig } from "../lib/templates";
import type { MealTemplate } from "../lib/templates";
import type { AIParseItem, Exercise, MealItem, MealPayload } from "../types";
import { PREF } from "../lib/prefs";
import { usePersistedBool } from "../lib/usePersistedBool";
import { categoryForLoggedAt, groupMealsByCategory, MEAL_CATEGORY_LABELS } from "../lib/mealCategory";

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
    <Modal
      title={`${selectedMeals.length} Öğünü Birleştir`}
      onClose={onClose}
      footer={
        <FormActions
          onCancel={onClose}
          onSave={() => onConfirm(name.trim() || defaultName)}
          saving={busy}
          disabled={!name.trim()}
          saveLabel="Birleştir"
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Birleşik öğün adı" value={name} onChange={setName} placeholder="örn. Kahvaltı" />
        <div className="rounded-chip border border-line bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-semibold text-ink-secondary">Birleşecek Öğünler:</p>
          <ul className="space-y-1.5 text-xs text-ink-tertiary">
            {selectedMeals.map((m) => (
              <li key={m.id} className="flex justify-between items-baseline gap-2">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="flex-none">•</span>
                  <ExpandableMealName name={m.label} className="min-w-0 text-ink-tertiary" />
                </div>
                <span className="font-mono flex-none">{formatKcal(m.computed.kcal)}</span>
              </li>
            ))}
          </ul>
          <NutrientSummaryLine
            nutrition={totalNutrition}
            kcal="total"
            className="mt-3 border-t border-line pt-2 font-mono text-xs text-accent"
          />
        </div>
      </div>
    </Modal>
  );
}

/** Bir günün besin görselleri (halka + barlar + öğün katkısı)
 *  ve öğün ekleme/düzenleme/silme/birleştirme kontrolleri.
 *
 *  `enableScan`: Faz S3'ün "Tara" giriş noktalarından biri (Bugün ekranı).
 *  BİLEREK varsayılan false — DayView Geçmiş'in gün detayında da yeniden
 *  kullanılıyor (`HistoryPage.tsx`) ve brief'in iki giriş noktası (Bugün,
 *  Hafıza) dışına taşmasın diye yalnızca `DailyPage` bunu true geçiyor.
 *  ScanSheet'in kendisi HER ZAMAN bugüne yazar (`todayISO()`), hangi tarihin
 *  gösterildiğine bakmaz — bu yüzden prop yalnızca düğmenin görünürlüğünü
 *  kontrol eder, davranışını değil. */

export function DayView({
  date,
  emptyLabel = "Bu gün için kayıt yok.",
  enableScan = false,
  triggerAddMeal,
  onResetTriggerAddMeal,
  triggerScan,
  onResetTriggerScan,
  showWeightCard = true,
}: {
  date: string;
  emptyLabel?: string;
  enableScan?: boolean;
  triggerAddMeal?: boolean;
  onResetTriggerAddMeal?: () => void;
  triggerScan?: boolean;
  onResetTriggerScan?: () => void;
  showWeightCard?: boolean;
}) {
  const { goals, days, setDayMeals, config, updateConfig } = useData();
  const goal = effectiveGoal(goals, date);
  const meals = mealsOf(days, date);
  const total = dayTotal(days, date);
  const hasData = meals.length > 0;
  const templates = parseTemplatesConfig(config);

  const exerciseData = (config[`exercise_${date}`] as { exercises?: Exercise[] }) ?? { exercises: [] };
  const currentExercises: Exercise[] = exerciseData.exercises ?? [];
  const burnedKcal = currentExercises.reduce((acc, curr) => acc + curr.caloriesBurned, 0);

  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [selectedMealForSheet, setSelectedMealForSheet] = useState<{ meal: MealItem; index: number } | null>(null);

  const [editIndex, setEditIndex] = useState<number | null | undefined>(undefined);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [pendingAIItems, setPendingAIItems] = useState<AIParseItem[] | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [microsOpen, setMicrosOpen] = usePersistedBool(PREF.microsOpen, false);
  const [showRatio, setShowRatio] = useState(true);
  const toggleRatio = () => setShowRatio(!showRatio);

  async function handleSaveFromNutritionSheet(updatedMeal: MealItem, index: number) {
    if (busy) return;
    setBusy(true);
    try {
      const updatedMeals = [...meals];
      updatedMeals[index] = updatedMeal;
      await setDayMeals(date, toPayload(updatedMeals));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (triggerAddMeal) {
      setEditIndex(null);
      onResetTriggerAddMeal?.();
    }
  }, [triggerAddMeal, onResetTriggerAddMeal]);

  useEffect(() => {
    if (triggerScan) {
      setShowScan(true);
      onResetTriggerScan?.();
    }
  }, [triggerScan, onResetTriggerScan]);

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

  async function saveAsTemplate(meal: MealItem) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const newTemplate: MealTemplate = {
        id: newTemplateId(),
        name: meal.label,
        items: [{ name: meal.label, nutrition: meal.computed, ...(meal.sources ? { sources: meal.sources } : {}) }],
      };
      await updateConfig("templates", { list: [...templates.list, newTemplate] });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate(t: MealTemplate) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const newPayloads: MealPayload[] = t.items.map((it) => ({
        name: it.name,
        nutrition: it.nutrition,
        ...(it.sources ? { sources: it.sources } : {}),
      }));
      await setDayMeals(date, [...toPayload(meals), ...newPayloads]);
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

      const withLoggedAt = selectedMeals.filter((m) => m.loggedAt).sort((a, b) => a.loggedAt!.localeCompare(b.loggedAt!));
      const earliestLoggedAt = withLoggedAt[0]?.loggedAt;
      const mergedCategory = earliestLoggedAt ? categoryForLoggedAt(earliestLoggedAt) : undefined;

      const mergedMeal: MealPayload = {
        name: mergedName,
        nutrition: mergedNutrition,
        ...(earliestLoggedAt ? { loggedAt: earliestLoggedAt } : {}),
        ...(mergedCategory ? { category: mergedCategory } : {}),
      };

      const firstIndex = Math.min(...selectedIndices);
      const selectedSet = new Set(selectedIndices);

      const nextPayload: MealPayload[] = [];
      meals.forEach((m, idx) => {
        if (idx === firstIndex) {
          nextPayload.push(mergedMeal);
        } else if (!selectedSet.has(idx)) {
          nextPayload.push(toPayload([m])[0]);
        }
      });

      await setDayMeals(date, nextPayload);
      setSelectedIndices([]);
      setSelectMode(false);
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
    setPendingAIItems(undefined);
  }

  function requestCloseMerge() {
    if (busy) return;
    setShowMergeModal(false);
  }

  const selectedMeals = selectedIndices.map((i) => meals[i]).filter(Boolean);

  const microRows = MICROS.filter((def) => total[def.key] !== undefined).map((def) => ({
    def,
    value: total[def.key] ?? 0,
    cover: coverage(meals, def.key),
  }));

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <DayTypeBadge date={date} />

      <StatCardCarousel
        total={total}
        goal={goal}
        burnedKcal={burnedKcal}
        showRatio={showRatio}
        onToggleRatio={toggleRatio}
        onOpenExercise={() => setShowExerciseModal(true)}
      />

      {microRows.length > 0 && (
        <Collapsible
          title="Mikro besinler"
          badge={
            <span className="rounded-pill bg-micro/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-micro">
              {microRows.map(({ def }) => def.short).join(" \u00b7 ")}
            </span>
          }
          open={microsOpen}
          onToggle={() => setMicrosOpen(!microsOpen)}
        >
          <div className="flex flex-col gap-3">
            {microRows.map(({ def, value, cover }) => (
              <div key={def.key}>
                <MacroBar def={def} value={value} target={goal[def.key] ?? 0} />
                {cover.have < cover.of && (
                  <p className="mt-1 font-mono text-[11px] text-ink-faint">
                    {cover.have}/{cover.of} öğünde veri
                  </p>
                )}
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      <SupplementCard date={date} />
      {showWeightCard && <WeightCard date={date} />}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-secondary">Son eklenen</h3>

          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                {selectedIndices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIndices([])}
                    className="rounded-pill border border-line bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-ink-tertiary transition hover:text-ink-primary"
                  >
                    Seçimi temizle
                  </button>
                )}
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
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIndices([]);
                  }}
                  className="rounded-pill border border-memory/40 bg-white/[0.09] px-3 py-1.5 text-xs font-bold text-ink-primary transition hover:bg-white/[0.15]"
                >
                  Tamam
                </button>
              </>
            ) : (
              hasData && (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary"
                >
                  Seç
                </button>
              )
            )}
            {enableScan && (
              <button
                type="button"
                onClick={() => setShowScan(true)}
                disabled={busy}
                className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary disabled:opacity-40"
              >
                📷 Tara
              </button>
            )}
          </div>
        </div>

        {err && <ErrorText>{err}</ErrorText>}

        {enableScan && templates.list.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {templates.list.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => applyTemplate(t)}
                className="flex-none rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary disabled:opacity-40"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {hasData ? (
          <>
            <button
              type="button"
              onClick={() => setEditIndex(null)}
              disabled={busy}
              className="self-start rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              + Öğün ekle
            </button>
            <div className="flex flex-col gap-4">
              {groupMealsByCategory(meals).map(({ category, items }) => (
                <div key={category} className="flex flex-col gap-2.5 sm:gap-3">
                  <h4 className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
                    {category === "other" ? "Diğer" : MEAL_CATEGORY_LABELS[category]}
                  </h4>
                  <ul className="flex flex-col gap-2.5 sm:gap-3">
                    {items.map(({ meal: m, index: i }) => {
                      const pct = total.kcal ? (m.computed.kcal / total.kcal) * 100 : 0;
                      return (
                        <MealRow
                          key={m.id}
                          meal={m}
                          pct={pct}
                          index={i}
                          selectMode={selectMode}
                          isSelected={selectedIndices.includes(i)}
                          onToggleSelect={() => toggleSelect(i)}
                          onEdit={() => setSelectedMealForSheet({ meal: m, index: i })}
                          onSaveTemplate={() => saveAsTemplate(m)}
                          onRemove={() => removeMeal(i)}
                          busy={busy}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditIndex(null)}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-3 rounded-card bg-calCard border border-calBorder shadow-card px-4 py-8 text-center transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#201f2e] text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="text-sm text-ink-tertiary">{emptyLabel}</span>
            <span className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink">
              + Öğün ekle
            </span>
          </button>
        )}
      </section>

      {editIndex !== undefined && (
        <MealForm date={date} editIndex={editIndex} onClose={closeForm} initialAIItems={pendingAIItems} />
      )}

      {showMergeModal && (
        <MergeModal
          selectedMeals={selectedMeals}
          onConfirm={handleMergeConfirm}
          onClose={requestCloseMerge}
          busy={busy}
        />
      )}

      {showScan && (
        <ScanSheet
          onClose={() => setShowScan(false)}
          onVisionResult={(items) => {
            setPendingAIItems(items);
            setShowScan(false);
            setEditIndex(null);
          }}
        />
      )}

      <ExerciseModal
        isOpen={showExerciseModal}
        onClose={() => setShowExerciseModal(false)}
        date={date}
      />

      <NutritionSheet
        isOpen={!!selectedMealForSheet}
        onClose={() => setSelectedMealForSheet(null)}
        meal={selectedMealForSheet?.meal ?? null}
        onSave={(updated) => {
          if (selectedMealForSheet) {
            handleSaveFromNutritionSheet(updated, selectedMealForSheet.index);
          }
        }}
        onDelete={(id) => {
          if (selectedMealForSheet) {
            removeMeal(selectedMealForSheet.index);
          }
        }}
      />
    </div>
  );
}
