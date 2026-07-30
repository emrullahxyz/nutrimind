import { useState } from "react";
import { Card } from "../components/Card";
import { Stat } from "../components/Stat";
import { WeekBars } from "../components/WeekBars";
import { MacroDonut } from "../components/MacroDonut";
import { DayView } from "../components/DayView";
import { formatKcal, formatLongDate, formatNumber, formatRelativeDay, formatShortDate } from "../lib/format";
import { useData } from "../lib/data";
import { MACROS } from "../lib/nutrients";
import type { NutrientDef } from "../lib/nutrients";
import { weekStart, weeks } from "../lib/weeks";
import type { Week } from "../lib/weeks";
import { addDaysISO } from "../lib/format";

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

function Sparkline({ week }: { week: Week }) {
  const { goals } = useData();
  const max = Math.max(goals.kcal, ...week.days.map((d) => d.total.kcal)) * 1.12 || 1;

  return (
    <div className="flex h-12 items-end gap-1.5 overflow-hidden rounded-lg bg-black/40 p-1.5 inset-0 border border-white/[0.06]">
      {week.days.map((d, i) => {
        const over = d.total.kcal > goals.kcal;
        return (
          <div key={d.date} className="relative flex-1 h-full flex flex-col justify-end">
            {d.hasData ? (
              <div
                className="anim-grow-spring relative w-full overflow-hidden rounded-t-[4px] shadow-[0_0_8px_rgba(45,212,191,0.2)] transition-transform duration-200 group-hover:-translate-y-0.5"
                style={{
                  height: `${Math.max((d.total.kcal / max) * 100, 10)}%`,
                  animationDelay: `${i * 45}ms`,
                }}
              >
                {/* Obsidyen Zümrüt / Carmine Kırmızısı Bar Gövdesi */}
                <div
                  className="relative z-10 h-full w-full overflow-hidden rounded-t-[4px]"
                  style={{
                    background: over
                      ? "linear-gradient(180deg, #fb7185 0%, #e11d48 35%, #9f1239 70%, #4c0519 100%)"
                      : "linear-gradient(180deg, #5eead4 0%, #2dd4bf 30%, #0d9488 70%, #042f2e 100%)",
                    boxShadow: "inset 1px 1px 1px rgba(255,255,255,0.3), inset -1px -1px 3px rgba(0,0,0,0.5)",
                    filter: "brightness(0.96)",
                  }}
                >
                  {/* Chroma Katmanı */}
                  <div
                    className="pointer-events-none absolute inset-0 z-12 opacity-70 mix-blend-overlay"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255, 0, 128, 0.15) 0%, rgba(0, 255, 240, 0.15) 50%, rgba(168, 85, 247, 0.15) 100%)",
                    }}
                  />
                  {/* Cam Yansıması */}
                  <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-15 w-[40%] rounded-tl-[4px] bg-gradient-to-r from-white/20 via-white/4 to-transparent" />
                </div>
              </div>
            ) : (
              <div className="h-[3px] w-full rounded-t-sm border border-dashed border-white/10 bg-white/[0.03]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MacroRow({ def, value }: { def: NutrientDef; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[13px] font-bold ${def.classes.text}`}>{def.label}</span>
      <span className="font-mono text-xs text-ink-secondary">
        {formatNumber(value)} {def.unit}
      </span>
    </div>
  );
}

export function HistoryPage() {
  const { days } = useData();
  const all = weeks(days);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const week = selectedWeek ? all.find((w) => w.startDate === selectedWeek) : null;

  // --- Kademe 3: gün detayı (günlük görünümle aynı) ---
  // Yalnızca `selectedDay`'e bağlı: son öğünü silince gün `days`'ten düşer ve
  // haftası da listeden kaybolabilir; buna rağmen kullanıcı o günde kalmalı ki
  // yeniden öğün ekleyebilsin (aksi halde o tarihe dönüş yolu kalmıyor).
  if (selectedDay) {
    return (
      <div key={selectedDay} className="anim-zoom flex flex-col gap-5">
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
    return <p className="text-sm text-ink-tertiary">Henüz geçmiş kaydı yok.</p>;
  }

  // --- Kademe 2: hafta detayı ---
  if (week) {
    const active = week.days.filter((d) => d.hasData);
    const highest = active.reduce((a, b) => (b.total.kcal > a.total.kcal ? b : a), active[0]);
    const lowest = active.reduce((a, b) => (b.total.kcal < a.total.kcal ? b : a), active[0]);

    return (
      <div key={week.startDate} className="anim-zoom flex flex-col gap-5">
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

        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
          <Card className="flex items-center justify-center p-6">
            <MacroDonut nutrition={week.total} />
          </Card>
          <Card className="flex flex-col justify-center gap-2 p-6">
            <div className="text-sm font-bold text-ink-secondary">Haftalık makro (toplam)</div>
            {MACROS.map((def) => (
              <MacroRow key={def.key} def={def} value={week.total[def.key] ?? 0} />
            ))}
          </Card>
        </div>
      </div>
    );
  }

  // --- Kademe 1: hafta listesi ---
  return (
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
            <Sparkline week={w} />
          </Card>
        </button>
      ))}
    </div>
  );
}
