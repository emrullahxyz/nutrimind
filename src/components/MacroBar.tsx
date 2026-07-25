import { useEffect, useState } from "react";
import { formatNumber } from "../lib/format";

export type MacroKind = "protein" | "carb" | "fat" | "memory";

function macroLabel(kind: MacroKind): string {
  switch (kind) {
    case "protein":
      return "Protein";
    case "carb":
      return "Karbonhidrat";
    case "fat":
      return "Yağ";
    case "memory":
      return "Lif";
  }
}

function macroClasses(kind: MacroKind): { text: string; bg: string; track: string } {
  switch (kind) {
    case "protein":
      return { text: "text-protein", bg: "bg-protein", track: "bg-protein/[0.15]" };
    case "carb":
      return { text: "text-carb", bg: "bg-carb", track: "bg-carb/[0.15]" };
    case "fat":
      return { text: "text-fat", bg: "bg-fat", track: "bg-fat/[0.15]" };
    case "memory":
      return { text: "text-memory", bg: "bg-memory", track: "bg-memory/[0.15]" };
  }
}

interface MacroBarProps {
  kind: MacroKind;
  value: number;
  target: number;
  unit?: string;
}

/** Synchronized count-up animation hook for numeric values. */
function useAnimatedValue(targetVal: number, durationMs: number = 750): number {
  const [displayVal, setDisplayVal] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / durationMs, 1);
      // Cubic ease-out curve matching CSS ease-out
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayVal(Math.round(targetVal * easeProgress));

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    const handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [targetVal, durationMs]);

  return displayVal;
}

/** Hook to trigger initial mount CSS width transition from 0 to targetPct. */
function useAnimatedPct(targetPct: number): number {
  const [currentPct, setCurrentPct] = useState(0);

  useEffect(() => {
    // Micro-delay ensures browser paints initial 0% before transitioning to targetPct
    const timer = setTimeout(() => {
      setCurrentPct(targetPct);
    }, 50);
    return () => clearTimeout(timer);
  }, [targetPct]);

  return currentPct;
}

/** Labeled macro progress bar (protein/carb/fat/fiber) with count-up number animation & smooth bar fill. */
export function MacroBar({ kind, value, target, unit = "g" }: MacroBarProps) {
  const targetPct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  const pct = useAnimatedPct(targetPct);
  const animatedValue = useAnimatedValue(value);
  const remaining = target - animatedValue;
  const isOver = target > 0 && (target - value) < 0;
  const isMet = target > 0 && (target - value) === 0;
  const c = macroClasses(kind);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-bold ${c.text}`}>{macroLabel(kind)}</span>
          {target > 0 && (
            <span
              className={`text-xs font-mono ${
                isOver
                  ? "font-bold text-danger animate-pulse"
                  : isMet
                  ? "font-bold text-accent"
                  : `${c.text} opacity-75 font-semibold`
              }`}
            >
              • {isOver ? `+${formatNumber(Math.abs(target - value))}${unit} aşıldı!` : isMet ? "✓ Tamamlandı" : `${formatNumber(remaining)}${unit} kaldı`}
            </span>
          )}
        </div>
        <span className={`font-mono text-xs ${isOver ? "font-bold text-danger" : "text-ink-secondary"}`}>
          {formatNumber(animatedValue)} / {formatNumber(target)}
          {unit}
        </span>
      </div>
      <div className={`h-2 rounded-full ${c.track} overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isOver ? "bg-danger shadow-[0_0_8px_rgba(255,128,128,0.5)]" : c.bg
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
