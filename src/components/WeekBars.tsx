import { useMemo } from "react";
import { useData } from "../lib/data";
import { effectiveGoal } from "../lib/goals";
import { formatNumber, weekdayShort } from "../lib/format";
import type { Week } from "../lib/weeks";
import { useValueSpring } from "../hooks/useValueSpring";
import { easeShowcase } from "../lib/animation";

const BEAM_SPEEDS = ["3.0s", "3.6s", "2.8s", "4.0s", "3.4s", "3.2s", "3.8s"];

/** Sona doğru erkenden yavaşlayan canlı kalori sayıcı komponenti */
function AnimatedKcal({ value, delayMs }: { value: number; delayMs: number }) {
  const display = useValueSpring(value, {
    tweenDurationMs: 2000,
    tweenDelayMs: delayMs,
    tweenEase: easeShowcase,
    round: "floor",
  });
  return <>{formatNumber(display)}</>;
}

/** Haftanın 7 günü için 3D-görünümlü kalori bar grafiği + hedef çizgisi.
 *  `compact` verilirse hafta listesi kartları için mini sparkline görünümü sunar.
 *  `onSelectDay` verilirse veri olan günler tıklanabilir (gün detayına drill). */
export function WeekBars({
  week,
  onSelectDay,
  compact = false,
}: {
  week: Week;
  onSelectDay?: (date: string) => void;
  compact?: boolean;
}) {
  const { goals } = useData();

  // Faz 8: her gün KENDİ hedefiyle karşılaştırılır (eskiden hepsi bugünün
  // hedefine bakıyordu — geçmiş bir hafta yanlış renkleniyordu).
  const dayGoals = useMemo(
    () => week.days.map((d) => effectiveGoal(goals, d.date).kcal),
    [goals, week],
  );

  const max = Math.max(...dayGoals, ...week.days.map((d) => d.total.kcal)) * 1.12 || 1;

  // Bar rengi çizilen çizgiyle AYNI referansa (haftalık ORTALAMA hedef) göre
  // belirlenir. Önceden her bar KENDİ gün hedefine bakıyordu — gün tipleri
  // farklı hedeflere sahip olduğunda (ör. dinlenme günü), ortalama çizginin
  // altında kalan bir bar bile kendi (daha düşük) hedefini aştığı için kırmızı
  // görünebiliyordu; çizilenle karşılaştırılan tutarsızdı.
  const avgGoal = dayGoals.reduce((a, b) => a + b, 0) / dayGoals.length;

  if (compact) {
    return (
      <div className="flex h-12 items-end gap-1.5 overflow-hidden rounded-lg bg-black/40 p-1.5 inset-0 border border-white/[0.06]">
        {week.days.map((d, i) => {
          const over = avgGoal > 0 && d.total.kcal > avgGoal;
          const springH = useValueSpring(Math.max((d.total.kcal / max) * 100, 10), {
            tweenDurationMs: 0,
            round: "none",
          });
          return (
            <div key={d.date} className="relative flex-1 h-full flex flex-col justify-end">
              {d.hasData ? (
                <div
                  className="anim-grow-spring relative w-full overflow-hidden rounded-t-[4px] shadow-[0_0_8px_rgba(45,212,191,0.2)] transition-transform duration-200 group-hover:-translate-y-0.5"
                  style={{
                    height: `${springH}%`,
                    animationDelay: `${i * 45}ms`,
                  }}
                >
                  {/* Obsidyen Zümrüt / Carmine Kırmızısı Bar Gövdesi */}
                  <div
                    className="relative z-10 h-full w-full overflow-hidden rounded-t-[4px]"
                    style={{
                      background: over
                        ? "linear-gradient(180deg, var(--bar-rose-0) 0%, var(--bar-rose-1) 35%, var(--bar-rose-2) 70%, var(--bar-rose-3) 100%)"
                        : "linear-gradient(180deg, var(--bar-teal-0) 0%, var(--bar-teal-1) 30%, var(--bar-teal-2) 70%, var(--bar-teal-3) 100%)",
                      boxShadow:
                        "inset 1px 1px 1px rgba(255,255,255,0.3), inset -1px -1px 3px rgba(0,0,0,0.5)",
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

  // Kesikli çizgi tek bir yatay çizgi olduğu için haftanın ORTALAMA hedefini gösterir
  const goalVaries = new Set(dayGoals).size > 1;
  const goalPct = (avgGoal / max) * 100;

  return (
    <div className="scene-3d">
      <div className="relative rounded-2xl border border-line bg-app/60 p-4 pt-6 backdrop-blur-xl">
        <div className="group/chart relative flex h-[180px] items-end gap-2">
          {/* hedef çizgisi */}
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-teal-400/40 shadow-[0_0_8px_rgba(45,212,191,0.25)]"
            style={{ bottom: `${goalPct}%` }}
          >
            <span className="absolute -top-4 right-0 rounded-full border border-teal-400/30 bg-goal-chip/90 px-2 py-0.5 font-mono text-[9px] font-bold text-teal-200 shadow-sm backdrop-blur-md">
              hedef {goalVaries && "ort. "}
              {formatNumber(avgGoal)}
            </span>
          </div>

          {week.days.map((d, i) => {
            const h = d.hasData ? Math.max((d.total.kcal / max) * 100, 3) : 1.5;
            const springH = useValueSpring(h, { tweenDurationMs: 0, round: "none" });
            const over = avgGoal > 0 && d.total.kcal > avgGoal;
            const clickable = d.hasData && !!onSelectDay;
            const beamSpeed = BEAM_SPEEDS[i % BEAM_SPEEDS.length];

            return (
              <button
                key={d.date}
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => onSelectDay!(d.date) : undefined}
                className={`group flex h-full flex-1 flex-col justify-end transition-opacity duration-300 group-hover/chart:opacity-40 hover:!opacity-100 ${
                  clickable ? "cursor-pointer" : "cursor-default"
                }`}
                aria-label={d.date}
              >
                <div className="relative w-full" style={{ height: `${springH}%` }}>
                  {d.hasData && (
                    <div
                      className="anim-zoom absolute -top-6 inset-x-0 z-30 text-center font-mono text-[10px] font-bold text-white"
                      style={{ animationDelay: `${i * 90 + 350}ms` }}
                    >
                      <span className="inline-block rounded-full border border-white/20 bg-white/12 px-2 py-0.5 shadow-md backdrop-blur-md">
                        <AnimatedKcal value={d.total.kcal} delayMs={i * 90 + 350} />
                      </span>
                    </div>
                  )}

                  {d.hasData ? (
                    /* Sınır Lazer Dolaşımlı Dış Kapsül */
                    <div
                      className="anim-grow-spring relative h-full w-full overflow-hidden rounded-t-lg p-[1.5px] shadow-[0_0_10px_rgba(255,255,255,0.18),0_0_18px_rgba(45,212,191,0.32)] transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:brightness-110"
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      {/* Döner Sınır Lazeri */}
                      <div
                        className="pointer-events-none absolute -inset-[150%] z-0"
                        style={{
                          background:
                            "conic-gradient(from 0deg, transparent 0deg, transparent 310deg, #ffffff 335deg, rgba(255, 255, 255, 0.8) 345deg, transparent 360deg)",
                          animation: `beamRotate ${beamSpeed} linear infinite`,
                        }}
                      />

                      {/* 3D Kaplamalı Mat Obsidyen Zümrüt Bar İç Gövdesi */}
                      <div
                        className="relative z-10 h-full w-full overflow-hidden rounded-t-[6px]"
                        style={{
                          background: over
                            ? "linear-gradient(180deg, var(--bar-rose-0) 0%, var(--bar-rose-1) 35%, var(--bar-rose-2) 70%, var(--bar-rose-3) 100%)"
                            : "linear-gradient(180deg, var(--bar-teal-0) 0%, var(--bar-teal-1) 30%, var(--bar-teal-2) 70%, var(--bar-teal-3) 100%)",
                          boxShadow:
                            "inset 1px 1px 2px rgba(255,255,255,0.35), inset -2px -2px 6px rgba(0,0,0,0.55)",
                          filter: "brightness(0.96)",
                        }}
                      >
                        {/* Chroma Holografik Katman */}
                        <div
                          className="pointer-events-none absolute inset-0 z-12 opacity-80 mix-blend-overlay"
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(255, 0, 128, 0.18) 0%, rgba(0, 255, 240, 0.18) 35%, rgba(255, 230, 0, 0.18) 70%, rgba(168, 85, 247, 0.18) 100%)",
                          }}
                        />

                        {/* Cam Yansıması */}
                        <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-15 w-[40%] rounded-tl-[6px] bg-gradient-to-r from-white/22 via-white/4 to-transparent" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full w-full rounded-t-md border border-dashed border-white/10 bg-white/[0.035]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex gap-2">
          {week.days.map((d) => (
            <div
              key={d.date}
              className={`flex-1 text-center font-mono text-[10px] font-semibold ${
                d.hasData ? "text-ink-secondary" : "text-ink-faint"
              }`}
            >
              {weekdayShort(d.date)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
