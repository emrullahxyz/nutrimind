import { useMemo, useState } from "react";
import type { AppData } from "../lib/api";
import { dayTotal } from "../lib/days";
import {
  addDaysISO,
  formatKcal,
  formatNumber,
  formatShortDate,
  todayISO,
  weekdayShort,
} from "../lib/format";
import { effectiveGoal, weeklyAverageGoal } from "../lib/goals";
import { nutrientOf } from "../lib/nutrients";
import { buildTrend, trendStats } from "../lib/trend";
import type { TrendGoal, TrendRange } from "../lib/trend";
import { formatTargetHitRate } from "../lib/trendFormat";
import { RangePicker } from "./RangePicker";
import { TrendChart } from "./TrendChart";
import { useTranslation } from "react-i18next";

export function ReportView({ data }: { data: AppData }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>(30);

  const end = todayISO();
  const sortedDates = useMemo(() => Object.keys(data.days).sort(), [data.days]);

  const startDate = useMemo(() => {
    if (range === "all") {
      return sortedDates.length > 0 ? sortedDates[0] : addDaysISO(end, -29);
    }
    return addDaysISO(end, -(range - 1));
  }, [range, sortedDates, end]);

  // Seçili aralıktaki tüm takvim günleri
  const calendarDates = useMemo(() => {
    const dates: string[] = [];
    for (let d = startDate; d <= end; d = addDaysISO(d, 1)) {
      dates.push(d);
    }
    return dates;
  }, [startDate, end]);

  // Yalnızca kaydı olan günler
  const recordedDates = useMemo(
    () => calendarDates.filter((d) => (data.days[d] ?? []).length > 0),
    [calendarDates, data.days],
  );

  // Kalori trend serisi
  const kcalSeries = useMemo(() => {
    const goalObj: TrendGoal = {
      of: (date) => effectiveGoal(data.goals, date),
      line: weeklyAverageGoal(data.goals),
    };
    return buildTrend(data.days, "kcal", range, goalObj);
  }, [data.days, data.goals, range]);

  const stats = useMemo(() => trendStats(kcalSeries, nutrientOf("kcal")), [kcalSeries]);

  // Seçili dönem ortalamaları (yalnızca verisi olan günler üzerinden)
  const averages = useMemo(() => {
    if (recordedDates.length === 0) return null;
    let sumKcal = 0,
      sumP = 0,
      sumC = 0,
      sumF = 0,
      sumFib = 0;
    for (const d of recordedDates) {
      const tot = dayTotal(data.days, d);
      sumKcal += tot.kcal;
      sumP += tot.protein;
      sumC += tot.carbs;
      sumF += tot.fat;
      sumFib += tot.fiber;
    }
    const n = recordedDates.length;
    return {
      kcal: sumKcal / n,
      protein: sumP / n,
      carbs: sumC / n,
      fat: sumF / n,
      fiber: sumFib / n,
    };
  }, [recordedDates, data.days]);

  // Makro kalori dağılımı (%)
  const macroDist = useMemo(() => {
    if (!averages) return { pPct: 0, cPct: 0, fPct: 0 };
    const pKcal = averages.protein * 4;
    const cKcal = averages.carbs * 4;
    const fKcal = averages.fat * 9;
    const totKcal = pKcal + cKcal + fKcal;
    if (totKcal <= 0) return { pPct: 0, cPct: 0, fPct: 0 };
    return {
      pPct: Math.round((pKcal / totKcal) * 100),
      cPct: Math.round((cKcal / totKcal) * 100),
      fPct: Math.round((fKcal / totKcal) * 100),
    };
  }, [averages]);

  return (
    <div className="flex flex-col gap-6 printable-area text-ink-primary">
      {/* Filtre ve Yazdır Butonu (Baskıda Gizli) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <RangePicker value={range} onChange={setRange} />
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-pill bg-accent px-4 py-2 text-xs font-extrabold text-accent-ink transition hover:opacity-90"
        >
          🖨️ {t("report.printCta")}
        </button>
      </div>

      {/* Rapor Başlığı */}
      <div className="border-b border-line pb-4 print-border-light">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-memory print-text-dark">
              {t("report.title")}
            </div>
            <h2 className="mt-1 text-xl font-extrabold print-text-dark sm:text-2xl">
              {t("report.subtitle")}
            </h2>
          </div>
          <div className="text-right font-mono text-xs text-ink-tertiary print-text-dark">
            <div>
              {t("report.dateRange", {
                start: formatShortDate(startDate),
                end: formatShortDate(end),
              })}
            </div>
            <div>{t("report.generatedAt", { date: formatShortDate(todayISO()) })}</div>
          </div>
        </div>
      </div>

      {/* Özet İstatistik Kartları */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 page-break-avoid">
        <div className="rounded-card border border-line bg-white/[0.02] p-3 print-border-light">
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary print-text-dark">
            {t("report.recordedDays")}
          </span>
          <div className="mt-1 font-mono text-lg font-extrabold print-text-dark">
            {recordedDates.length}{" "}
            <span className="text-xs font-normal text-ink-tertiary">
              / {calendarDates.length} {t("report.days")}
            </span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-white/[0.02] p-3 print-border-light">
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary print-text-dark">
            {t("report.dailyAvgKcal")}
          </span>
          <div className="mt-1 font-mono text-lg font-extrabold text-accent print-text-dark">
            {averages ? formatKcal(averages.kcal) : "—"}
          </div>
        </div>

        <div className="rounded-card border border-line bg-white/[0.02] p-3 print-border-light">
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary print-text-dark">
            {t("report.hitRate")}
          </span>
          <div className="mt-1 font-mono text-lg font-extrabold text-protein print-text-dark">
            {formatTargetHitRate(stats)}
            <span className="ml-1 text-xs font-normal text-ink-tertiary">
              ({stats.onTargetDays}/{stats.ratedDays} {t("report.days")})
            </span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-white/[0.02] p-3 print-border-light">
          <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary print-text-dark">
            {t("report.macroBalance")}
          </span>
          <div className="mt-1 font-mono text-lg font-extrabold print-text-dark">
            %{macroDist.pPct} / %{macroDist.cPct} / %{macroDist.fPct}
          </div>
        </div>
      </div>

      {/* Makro Ortalamaları Barları */}
      {averages && (
        <div className="rounded-card border border-line bg-white/[0.02] p-4 print-border-light page-break-avoid">
          <h3 className="mb-3 font-mono text-xs uppercase tracking-mono text-ink-tertiary print-text-dark">
            {t("report.macroAveragesTitle")}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <span className="text-xs text-protein font-bold">{t("report.protein")}</span>
              <div className="font-mono text-base font-extrabold print-text-dark">
                {formatNumber(averages.protein, 1)} g
              </div>
              <span className="font-mono text-[10px] text-ink-tertiary">
                %{macroDist.pPct} {t("report.kcalShare")}
              </span>
            </div>
            <div>
              <span className="text-xs text-carb font-bold">{t("report.carbs")}</span>
              <div className="font-mono text-base font-extrabold print-text-dark">
                {formatNumber(averages.carbs, 1)} g
              </div>
              <span className="font-mono text-[10px] text-ink-tertiary">
                %{macroDist.cPct} {t("report.kcalShare")}
              </span>
            </div>
            <div>
              <span className="text-xs text-fat font-bold">{t("report.fat")}</span>
              <div className="font-mono text-base font-extrabold print-text-dark">
                {formatNumber(averages.fat, 1)} g
              </div>
              <span className="font-mono text-[10px] text-ink-tertiary">
                %{macroDist.fPct} {t("report.kcalShare")}
              </span>
            </div>
            <div>
              <span className="text-xs text-memory font-bold">{t("report.fiber")}</span>
              <div className="font-mono text-base font-extrabold print-text-dark">
                {formatNumber(averages.fiber, 1)} g
              </div>
              <span className="font-mono text-[10px] text-ink-tertiary">
                {t("report.fiberHint")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Trend Grafiği */}
      <div className="rounded-card border border-line bg-white/[0.02] p-4 print-border-light page-break-avoid">
        <h3 className="mb-3 font-mono text-xs uppercase tracking-mono text-ink-tertiary print-text-dark">
          {t("report.kcalTrendTitle")}
        </h3>
        <TrendChart series={kcalSeries} def={nutrientOf("kcal")} goalIsAverage={true} />
      </div>

      {/* Günlük Detay Tablosu */}
      <div className="rounded-card border border-line bg-white/[0.02] p-4 print-border-light page-break-avoid">
        <h3 className="mb-3 font-mono text-xs uppercase tracking-mono text-ink-tertiary print-text-dark">
          {t("report.dailyDetailTitle", { count: recordedDates.length })}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-line text-ink-tertiary print-border-light print-text-dark">
                <th className="py-2 pr-2">{t("report.date")}</th>
                <th className="py-2 px-2">{t("report.meals")}</th>
                <th className="py-2 px-2">{t("report.kcalOverTarget")}</th>
                <th className="py-2 px-2">{t("report.protein")}</th>
                <th className="py-2 px-2">{t("report.carbs")}</th>
                <th className="py-2 px-2">{t("report.fat")}</th>
                <th className="py-2 pl-2">{t("report.fiber")}</th>
              </tr>
            </thead>
            <tbody>
              {recordedDates.map((date) => {
                const meals = data.days[date] ?? [];
                const tot = dayTotal(data.days, date);
                const goal = effectiveGoal(data.goals, date);

                return (
                  <tr
                    key={date}
                    className="border-b border-line-faint hover:bg-white/[0.02] print-border-light"
                  >
                    <td className="py-2 pr-2 font-bold print-text-dark">
                      {formatShortDate(date)}{" "}
                      <span className="text-[10px] font-normal text-ink-tertiary">
                        ({weekdayShort(date)})
                      </span>
                    </td>
                    <td className="py-2 px-2 print-text-dark">{meals.length}</td>
                    <td className="py-2 px-2 font-bold text-accent print-text-dark">
                      {formatKcal(tot.kcal)}{" "}
                      <span className="text-[10px] font-normal text-ink-tertiary">
                        / {formatKcal(goal.kcal)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-protein print-text-dark">
                      {formatNumber(tot.protein, 1)}g
                    </td>
                    <td className="py-2 px-2 text-carb print-text-dark">
                      {formatNumber(tot.carbs, 1)}g
                    </td>
                    <td className="py-2 px-2 text-fat print-text-dark">
                      {formatNumber(tot.fat, 1)}g
                    </td>
                    <td className="py-2 pl-2 text-memory print-text-dark">
                      {formatNumber(tot.fiber, 1)}g
                    </td>
                  </tr>
                );
              })}
              {recordedDates.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink-tertiary">
                    {t("report.noRecordsInRange")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
