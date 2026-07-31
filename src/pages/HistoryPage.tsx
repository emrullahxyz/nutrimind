import { useState } from "react";
import { Card } from "../components/Card";
import { Stat } from "../components/Stat";
import { WeekBars } from "../components/WeekBars";
import { MacroDonut } from "../components/MacroDonut";
import { DayView } from "../components/DayView";
import { formatKcal, formatLongDate, formatNumber, formatRelativeDay, formatShortDate } from "../lib/format";
import { useData } from "../lib/data";
import { effectiveGoal } from "../lib/goals";
import { MACROS } from "../lib/nutrients";
import type { NutrientDef } from "../lib/nutrients";
import { weekStart, weeks } from "../lib/weeks";
import type { Week } from "../lib/weeks";
import { addDaysISO } from "../lib/format";
import { TrendPage } from "./TrendPage";

type HistorySegment = "weeks" | "trend";

function weekLabel(w: Week): string {
  return `${formatShortDate(w.startDate)} – ${formatShortDate(w.endDate)}`;
}

/** Hafta etiketi — haftanın `days` içinde kaydı kalmasa da hesaplanabilir. */
function weekLabelOf(dateStr: string): string {
  const start = weekStart(dateStr);
  return `${formatShortDate(start)} – ${formatShortDate(addDaysISO(start, 6))}`;
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:text-ink-primary"
    >
      ‹ {label}
    </button>
  );
}

export function HistoryPage() {
  const [segment, setSegment] = useState<HistorySegment>("weeks");
  const { days } = useData();
  const all = weeks(days);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const week = selectedWeek ? all.find((w) => w.startDate === selectedWeek) : null;

  const segmentPicker = (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <button
        type="button"
        onClick={() => setSegment("weeks")}
        className={`flex-none rounded-pill px-4 py-2 text-sm font-bold transition ${
          segment === "weeks"
            ? "bg-memory text-memory-ink"
            : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
        }`}
      >
        Haftalar
      </button>
      <button
        type="button"
        onClick={() => setSegment("trend")}
        className={`flex-none rounded-pill px-4 py-2 text-sm font-bold transition ${
          segment === "trend"
            ? "bg-memory text-memory-ink"
            : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
        }`}
      >
        Trend
      </button>
    </div>
  );

  if (segment === "trend") {
    return (
      <div className="flex flex-col gap-5">
        {segmentPicker}
        <TrendPage />
      </div>
    );
  }

  // --- Kademe 3: gün detayı (günlük görünümle aynı) ---
  if (selectedDay) {
    return (
      <div key={selectedDay} className="anim-zoom flex flex-col gap-5">
        {segmentPicker}
        <div className="flex items-center justify-between gap-3">
          <BackButton
            label={week ? weekLabel(week) : weekLabelOf(selectedDay)}
            onClick={() => setSelectedDay(null)}
          />
          <div className="text-right">
            <div className="text-base font-extrabold capitalize text-ink-primary">
              {formatRelativeDay(selectedDay)}
            </div>
            <div className="text-[11px] text-ink-tertiary">{formatLongDate(selectedDay)}</div>
          </div>
        </div>
        <DayView date={selectedDay} />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {segmentPicker}
        <p className="text-sm text-ink-tertiary">Henüz geçmiş kaydı yok.</p>
      </div>
    );
  }

  // --- Kademe 2: hafta detayı ---
  if (week) {
    const active = week.days.filter((d) => d.hasData);
    const highest = active.reduce((a, b) => (b.total.kcal > a.total.kcal ? b : a), active[0]);
    const lowest = active.reduce((a, b) => (b.total.kcal < a.total.kcal ? b : a), active[0]);

    return (
      <div key={week.startDate} className="anim-zoom flex flex-col gap-5">
        {segmentPicker}
        <div className="flex items-center justify-between gap-3">
          <BackButton label="Haftalar" onClick={() => setSelectedWeek(null)} />
          <h2 className="text-lg font-extrabold text-ink-primary">{weekLabel(week)}</h2>
        </div>

        <WeekBars week={week} onSelectDay={(d) => setSelectedDay(d)} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Haftalık toplam" value={formatKcal(week.total.kcal)} hint={`${week.activeDays} gün`} />
          <Stat label="Günlük ort." value={formatKcal(week.avgKcal)} />
          <Stat
            label="En yoğun"
            value={formatKcal(highest?.total.kcal ?? 0)}
            hint={highest ? formatRelativeDay(highest.date) : "—"}
          />
          <Stat
            label="En hafif"
            value={formatKcal(lowest?.total.kcal ?? 0)}
            hint={lowest ? formatRelativeDay(lowest.date) : "—"}
          />
        </div>

        <Card className="flex flex-col items-center justify-center p-6 gap-4">
          <div className="text-sm font-bold text-ink-secondary">Haftalık Makro Dağılımı & Toplamları</div>
          <MacroDonut nutrition={week.total} />
          <div className="w-full border-t border-line/40 pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {MACROS.map((def) => (
                <div key={def.key} className="flex flex-col items-center text-center">
                  <span className={`text-xs font-bold ${def.classes.text}`}>{def.label}</span>
                  <span className="font-mono text-xs font-semibold text-ink-primary">
                    {formatNumber(week.total[def.key] ?? 0)} {def.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // --- Kademe 1: hafta listesi ---
  return (
    <div className="flex flex-col gap-5">
      {segmentPicker}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {all.map((w, i) => (
          <button
            key={w.startDate}
            type="button"
            onClick={() => {
              setSelectedWeek(w.startDate);
              setSelectedDay(null);
            }}
            className="anim-fadeup text-left"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <Card className="flex flex-col gap-3 p-4 transition hover:border-memory/40 hover:bg-white/[0.03]">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-bold text-ink-primary">{weekLabel(w)}</div>
                <div className="text-[11px] text-ink-tertiary">{w.activeDays} gün</div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-mono text-xl font-extrabold text-ink-primary">{formatKcal(w.total.kcal)}</div>
                <div className="font-mono text-[11px] text-ink-tertiary">ort {formatKcal(w.avgKcal)}/gün</div>
              </div>
              <WeekBars week={w} compact />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
