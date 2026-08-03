import { useMemo } from "react";
import { Card } from "./Card";
import { formatNumber, formatShortDate } from "../lib/format";
import type { TrendRange } from "../lib/trend";
import { buildWeightSeries } from "../lib/weight";

const W = 720;
const H = 200;
const PAD = { l: 48, r: 16, t: 16, b: 28 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;
const BASE_Y = PAD.t + PLOT_H;

type Run = { i: number; v: number }[];

function runsOf(values: readonly (number | null)[]): Run[] {
  const out: Run[] = [];
  let run: Run = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) out.push(run);
      run = [];
    } else {
      run.push({ i, v });
    }
  });
  if (run.length) out.push(run);
  return out;
}

export function WeightTrendCard({
  entries,
  range,
}: {
  entries: Record<string, number>;
  range: TrendRange;
}) {
  const points = useMemo(() => buildWeightSeries(entries, range), [entries, range]);
  const validPoints = useMemo(() => points.filter((p): p is { date: string; kg: number } => p.kg !== null), [points]);

  if (validPoints.length === 0) {
    return null;
  }

  const values = points.map((p) => p.kg);
  const runs = runsOf(values);

  const kgValues = validPoints.map((p) => p.kg);
  const minKgRaw = Math.min(...kgValues);
  const maxKgRaw = Math.max(...kgValues);
  const rangeDiff = maxKgRaw - minKgRaw;

  // Y ölçeği için margin ekle (en az 1 kg fark olsun ki tek noktada çizgi ortalansın)
  const yPadding = rangeDiff === 0 ? 1 : Math.max(0.5, rangeDiff * 0.15);
  const yMin = minKgRaw - yPadding;
  const yMax = maxKgRaw + yPadding;

  function getX(index: number): number {
    if (points.length <= 1) return PAD.l + PLOT_W / 2;
    return PAD.l + (index / (points.length - 1)) * PLOT_W;
  }

  function getY(kg: number): number {
    if (yMax === yMin) return PAD.t + PLOT_H / 2;
    return BASE_Y - ((kg - yMin) / (yMax - yMin)) * PLOT_H;
  }

  // Y-ekseni kılavuz çizgileri (min, orta, max)
  const midKg = (minKgRaw + maxKgRaw) / 2;
  const yTicks = [minKgRaw, midKg, maxKgRaw];
  const uniqueYTicks = Array.from(new Set(yTicks.map((v) => Number(v.toFixed(1)))));

  // X-ekseni tarih etiketleri (baştan, ortadan, sondan eşit aralıklı max 4 etiket)
  const labelCount = Math.min(4, points.length);
  const labelIndices: number[] = [];
  if (points.length > 0) {
    for (let k = 0; k < labelCount; k++) {
      labelIndices.push(Math.round((k * (points.length - 1)) / (labelCount - 1)));
    }
  }
  const uniqueLabelIndices = Array.from(new Set(labelIndices));

  // İlk ve son girilen kg farkı
  const firstEntry = validPoints[0];
  const lastEntry = validPoints[validPoints.length - 1];
  const totalChange = lastEntry.kg - firstEntry.kg;

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div>
          <h3 className="text-sm font-bold text-ink-primary">Kilo Trendi</h3>
          <p className="text-xs text-ink-tertiary">
            Son kayıt: <span className="font-mono font-bold text-ink-primary">{formatNumber(lastEntry.kg, 1)} kg</span>
          </p>
        </div>
        {validPoints.length >= 2 && (
          <div className="text-right font-mono text-xs">
            <span className={totalChange > 0 ? "text-warn font-semibold" : totalChange < 0 ? "text-accent font-semibold" : "text-ink-tertiary"}>
              {totalChange > 0 ? `▲${formatNumber(totalChange, 1)}` : totalChange < 0 ? `▼${formatNumber(Math.abs(totalChange), 1)}` : "0,0"} kg
            </span>
            <p className="text-[10px] text-ink-faint">bu aralıkta</p>
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block select-none">
          {/* Y-ekseni kılavuz çizgileri ve HTML yerine SVG içi hafif metinler */}
          {uniqueYTicks.map((tickVal) => {
            const y = getY(tickVal);
            return (
              <g key={tickVal}>
                <line
                  x1={PAD.l}
                  y1={y}
                  x2={W - PAD.r}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="4 4"
                />
                <text
                  x={PAD.l - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-ink-faint font-mono text-[10px]"
                >
                  {formatNumber(tickVal, 1)}
                </text>
              </g>
            );
          })}

          {/* X-ekseni kılavuz etiketleri */}
          {uniqueLabelIndices.map((idx) => {
            const pt = points[idx];
            const x = getX(idx);
            return (
              <text
                key={pt.date}
                x={x}
                y={H - 6}
                textAnchor={idx === 0 ? "start" : idx === points.length - 1 ? "end" : "middle"}
                className="fill-ink-tertiary font-mono text-[10px]"
              >
                {formatShortDate(pt.date)}
              </text>
            );
          })}

          {/* Yol parçaları (runs) */}
          {runs.map((run, runIdx) => {
            if (run.length === 1) {
              const pt = run[0];
              return (
                <circle
                  key={`run-${runIdx}`}
                  cx={getX(pt.i)}
                  cy={getY(pt.v)}
                  r={4}
                  className="fill-accent"
                />
              );
            }

            const pathD =
              "M " +
              run.map((pt) => `${getX(pt.i)},${getY(pt.v)}`).join(" L ");

            return (
              <g key={`run-${runIdx}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="currentColor"
                  className="text-accent"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {run.map((pt) => (
                  <circle
                    key={pt.i}
                    cx={getX(pt.i)}
                    cy={getY(pt.v)}
                    r={3}
                    className="fill-accent stroke-calCard"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 text-[11px] text-ink-faint">
        Kayıt olmayan günlerde çizgi kopar — kg takibi girilen günleri gösterir.
      </div>
    </Card>
  );
}
