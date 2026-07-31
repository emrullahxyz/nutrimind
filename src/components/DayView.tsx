import { useState } from "react";
import { CalorieRing } from "./CalorieRing";
import { MacroBar } from "./MacroBar";
import { Card } from "./Card";
import { DayTypeBadge } from "./DayTypeBadge";
import { MealForm } from "./MealForm";
import { ConfirmButton, ErrorText, ExpandableMealName, FormActions, NutrientSummaryLine, TextField } from "./FormBits";
import { Modal } from "./Modal";
import { ScanSheet } from "./ScanSheet";
import { formatKcal } from "../lib/format";
import { useData } from "../lib/data";
import { effectiveGoal } from "../lib/goals";
import { MACROS, MICROS } from "../lib/nutrients";
import { coverage, dayTotal, mealsOf, sumMeals, toPayload } from "../lib/days";
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
}: {
  date: string;
  emptyLabel?: string;
  enableScan?: boolean;
}) {
  const { goals, days, setDayMeals } = useData();
  // Faz 8: hedef artık GÜNE bağlı. Geçmiş bir gün de (Geçmiş sekmesinin gün
  // detayı bu bileşeni yeniden kullanıyor) kendi hedefiyle karşılaştırılır.
  const goal = effectiveGoal(goals, date);
  const meals = mealsOf(days, date);
  const total = dayTotal(days, date);
  const hasData = meals.length > 0;

  // editIndex: null = yeni öğün, sayı = o indeksli öğünü düzenle. form kapalıysa undefined.
  const [editIndex, setEditIndex] = useState<number | null | undefined>(undefined);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showScan, setShowScan] = useState(false);
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
  }

  function requestCloseMerge() {
    if (busy) return;
    setShowMergeModal(false);
  }

  const selectedMeals = selectedIndices.map((i) => meals[i]).filter(Boolean);

  // Mikro barlar YALNIZCA gerçekten veri olan besinler için çizilir: kimsenin
  // girmediği sodyumu "0 mg" göstermek besin hakkında yanlış bir beyandır.
  // (`sumMeals` bir mikroyu ancak en az bir öğünde varsa üretir.)
  const microRows = MICROS.filter((def) => total[def.key] !== undefined).map((def) => ({
    def,
    value: total[def.key] ?? 0,
    cover: coverage(meals, def.key),
  }));

  return (
    <div className="flex flex-col gap-5">
      <DayTypeBadge date={date} />

      {/* Halka mobilde küçültüldü (196 → 168): bu ekranın asıl işi altındaki
          öğün listesi ve o listenin ilk ekranda kalması halkanın 28 pikselinden
          daha değerli. */}
      <Card className="flex items-center justify-center p-4">
        <CalorieRing consumed={total.kcal} target={goal.kcal} size={168} />
      </Card>

      {!hasData && (
        <Card className="flex items-center justify-center p-4 text-center text-sm text-ink-tertiary">
          {emptyLabel}
        </Card>
      )}

      {hasData && (
        <Card className="flex flex-col gap-3 p-4">
          {MACROS.map((def) => (
            <MacroBar
              key={def.key}
              def={def}
              value={total[def.key] ?? 0}
              target={goal[def.key] ?? 0}
            />
          ))}

          {microRows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
                Mikro besinler
              </span>
              {microRows.map(({ def, value, cover }) => (
                <div key={def.key}>
                  <MacroBar def={def} value={value} target={goal[def.key] ?? 0} />
                  {cover.have < cover.of && (
                    // Kısmi veri: toplam gerçek ama EKSİK. Bunu yazmazsak
                    // 5 öğünün 3'ünden toplanan sodyum tam günmüş gibi okunur.
                    // ("3/5" biçimi bilinçli: Türkçe sayı ekleri sayıya göre
                    // değişiyor, kesir gösterimi her sayıda doğru okunuyor.)
                    <p className="mt-1 font-mono text-[11px] text-ink-faint">
                      {cover.have}/{cover.of} öğünde veri
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-secondary">Öğün katkısı</h3>

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
                    <div className="flex min-w-0 items-baseline gap-2">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(i)}
                          className="h-3.5 w-3.5 flex-none rounded border-line bg-white/[0.06] text-accent focus:ring-0 cursor-pointer"
                        />
                      )}
                      <ExpandableMealName
                        name={m.label}
                        className={`min-w-0 text-sm font-semibold transition-colors ${isSelected ? "text-accent" : "text-ink-primary"}`}
                      />
                    </div>
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
          <p className="text-sm text-ink-tertiary">Henüz öğün yok.</p>
        )}
      </section>

      {editIndex !== undefined && <MealForm date={date} editIndex={editIndex} onClose={closeForm} />}

      {showMergeModal && (
        <MergeModal
          selectedMeals={selectedMeals}
          onConfirm={handleMergeConfirm}
          onClose={requestCloseMerge}
          busy={busy}
        />
      )}

      {showScan && <ScanSheet onClose={() => setShowScan(false)} />}
    </div>
  );
}
