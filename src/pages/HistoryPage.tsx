import { useEffect, useState } from "react";
import { Card } from "../components/Card";
import { Stat } from "../components/Stat";
import { WeekBars } from "../components/WeekBars";
import { MacroDonut } from "../components/MacroDonut";
import { DayView } from "../components/DayView";
import { StreakCard } from "../components/StreakCard";
import { WeightCard } from "../components/WeightCard";
import { formatKcal, formatLongDate, formatNumber, formatRelativeDay, formatShortDate, todayISO } from "../lib/format";
import { useData } from "../lib/data";
import { MACROS } from "../lib/nutrients";
import { weekStart, weeks } from "../lib/weeks";
import type { Week } from "../lib/weeks";
import { addDaysISO } from "../lib/format";
import { calculateStreak } from "../lib/streak";
import { TrendPage } from "./TrendPage";
import { useSubViewRegistration } from "../hooks/useSubViewRegistration";

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

function SectionLabel({ children }: { children: string }) {
  return <h2 className="text-sm font-bold text-ink-secondary">{children}</h2>;
}

export function HistoryPage({ resetKey = 0 }: { resetKey?: number }) {
  const { days } = useData();
  const all = weeks(days);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [visibleWeeksCount, setVisibleWeeksCount] = useState<number>(6);

  // App.tsx'in global geri-tuşu dinleyicisinin bu hafta/gün drilldown'ından
  // YENİ çıkıldığını anlayıp sahte "çıkmak için bir kez daha bas" toast'ını
  // bastırabilmesi için — bkz. hooks/useSubViewRegistration.ts.
  useSubViewRegistration(selectedWeek !== null || selectedDay !== null);

  // Alttaki gezinmeden "İlerleme"ye zaten o sekmedeyken tekrar basmak
  // App.tsx'te `tabResetKey.history`'yi artırır — burada dinlenmezse hafta/gün
  // detayında sıkışan kullanıcı sekmesine tekrar basarak listeye dönemiyordu.
  useEffect(() => {
    if (resetKey > 0) {
      setSelectedWeek(null);
      setSelectedDay(null);
      if (window.history.state?.tab === "history") {
        window.history.replaceState({ tab: "history", isRoot: true }, "");
      }
    }
  }, [resetKey]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state?.isModal) return;

      if (state && state.tab === "history") {
        setSelectedWeek(state.week || null);
        setSelectedDay(state.day || null);
      } else if (!state || state.tab !== "history") {
        setSelectedWeek(null);
        setSelectedDay(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSelectWeek = (weekStartStr: string) => {
    window.history.pushState({ tab: "history", week: weekStartStr, day: null }, "");
    setSelectedWeek(weekStartStr);
    setSelectedDay(null);
  };

  const handleSelectDay = (dayStr: string) => {
    window.history.pushState({ tab: "history", week: selectedWeek, day: dayStr }, "");
    setSelectedDay(dayStr);
  };

  const handleGoBack = () => {
    window.history.back();
  };

  const week = selectedWeek ? all.find((w) => w.startDate === selectedWeek) : null;
  const visibleWeeks = all.slice(0, visibleWeeksCount);
  const hasMoreWeeks = all.length > visibleWeeksCount;

  // --- Kademe 3: gün detayı (günlük görünümle aynı) ---
  if (selectedDay) {
    return (
      <div key={selectedDay} className="anim-zoom flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <BackButton
            label={week ? weekLabel(week) : weekLabelOf(selectedDay)}
            onClick={handleGoBack}
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

  // --- Kademe 2: hafta detayı ---
  if (week) {
    const active = week.days.filter((d) => d.hasData);
    const highest = active.reduce((a, b) => (b.total.kcal > a.total.kcal ? b : a), active[0]);
    const lowest = active.reduce((a, b) => (b.total.kcal < a.total.kcal ? b : a), active[0]);

    return (
      <div key={week.startDate} className="anim-zoom flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <BackButton label="Haftalar" onClick={handleGoBack} />
          <h2 className="text-lg font-extrabold text-ink-primary">{weekLabel(week)}</h2>
        </div>

        <WeekBars week={week} onSelectDay={(d) => handleSelectDay(d)} />

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
          <div className="w-full border-t border-line-faint pt-3">
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

  // --- Kademe 1: İlerleme — seri + haftalar + trend, TEK sürekli akış ---
  return (
    <div className="flex flex-col gap-6">
      <StreakCard days={days} streak={calculateStreak(days)} />

      <div className="flex flex-col gap-3">
        <SectionLabel>Kilo</SectionLabel>
        <WeightCard date={todayISO()} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <SectionLabel>Haftalar</SectionLabel>
          <span className="text-xs text-ink-tertiary font-mono">
            {all.length} haftadan {visibleWeeks.length} tanesi gösteriliyor
          </span>
        </div>
        {all.length === 0 ? (
          <div className="anim-fadeup text-sm text-ink-tertiary space-y-1">
            <p>Henüz geçmiş kaydı yok.</p>
            <p className="text-xs text-ink-tertiary/80">
              Birkaç gün öğün kaydet, sonra 7/30 günlük trendleri görebilirsin.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleWeeks.map((w, i) => (
                <button
                  key={w.startDate}
                  type="button"
                  onClick={() => handleSelectWeek(w.startDate)}
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

            {/* Pagination Controls */}
            {hasMoreWeeks && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleWeeksCount((prev) => prev + 6)}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-4 py-2 text-xs font-bold text-ink-primary hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
                >
                  <span>Daha Fazla Hafta Göster (+{all.length - visibleWeeksCount})</span>
                </button>
              </div>
            )}
            {!hasMoreWeeks && all.length > 6 && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleWeeksCount(6)}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-white/5 px-4 py-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-all active:scale-95"
                >
                  <span>Daha Az Göster</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <SectionLabel>Trend</SectionLabel>
        <TrendPage />
      </div>
    </div>
  );
}
