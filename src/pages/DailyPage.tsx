import { useState } from "react";
import { DayView } from "../components/DayView";
import { GoalsForm } from "../components/GoalsForm";
import { formatLongDate, todayISO } from "../lib/format";

export function DailyPage() {
  const date = todayISO();
  const [goalsOpen, setGoalsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-primary">Bugün</h2>
          <p className="text-sm text-ink-tertiary">{formatLongDate(date)}</p>
        </div>
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="flex-none rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:text-ink-primary"
        >
          Hedef
        </button>
      </div>

      <DayView date={date} emptyLabel="Bugün henüz bir şey yok." />

      {goalsOpen && <GoalsForm onClose={() => setGoalsOpen(false)} />}
    </div>
  );
}
