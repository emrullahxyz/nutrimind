import { useState } from "react";
import { CalorieRing } from "./CalorieRing";
import { MacroBar } from "./MacroBar";
import { MacroDonut } from "./MacroDonut";
import { Card } from "./Card";
import { MealForm } from "./MealForm";
import { ConfirmButton, ErrorText } from "./FormBits";
import { formatKcal } from "../lib/format";
import { useData } from "../lib/data";
import { dayTotal, mealsOf, toPayload } from "../lib/days";

/** Bir günün besin görselleri (halka + makro donut + barlar + öğün katkısı)
 *  ve öğün ekleme/düzenleme/silme kontrolleri.
 *  Hem "Günlük" sekmesi hem Geçmiş'teki gün-detayı bunu kullanır → görünüm eşleşir. */
export function DayView({ date, emptyLabel = "Bu gün için kayıt yok." }: { date: string; emptyLabel?: string }) {
  const { goals, days, setDayMeals } = useData();
  const meals = mealsOf(days, date);
  const total = dayTotal(days, date);
  const hasData = meals.length > 0;

  // editIndex: null = yeni öğün, sayı = o indeksli öğünü düzenle. form kapalıysa undefined.
  const [editIndex, setEditIndex] = useState<number | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  // Gün yazımı tüm günü değiştirdiği için iki silme aynı anda uçarsa biri diğerini geri getirir.
  const [busy, setBusy] = useState(false);

  async function removeMeal(index: number) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await setDayMeals(
        date,
        toPayload(meals.filter((_, i) => i !== index)),
      );
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** Form kapanınca eski silme hatası ekranda kalmasın. */
  function closeForm() {
    setEditIndex(undefined);
    setErr(null);
  }

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
          <h3 className="text-sm font-bold text-ink-secondary">Öğün katkısı</h3>
          <button
            type="button"
            onClick={() => setEditIndex(null)}
            disabled={busy}
            className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
          >
            + Öğün ekle
          </button>
        </div>

        {err && <ErrorText>{err}</ErrorText>}

        {hasData ? (
          <ul className="flex flex-col gap-2.5">
            {meals.map((m, i) => {
              const pct = total.kcal ? (m.computed.kcal / total.kcal) * 100 : 0;
              return (
                <li key={m.id} className="anim-fadeup flex flex-col gap-1" style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink-primary">{m.label}</span>
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

      {editIndex !== undefined && (
        <MealForm date={date} editIndex={editIndex} onClose={closeForm} />
      )}
    </div>
  );
}
