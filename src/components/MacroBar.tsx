import { useEffect, useState } from "react";
import { formatNumber } from "../lib/format";
import type { NutrientDef } from "../lib/nutrients";

interface MacroBarProps {
  /** Besin kaydındaki tanım — etiket, birim, renk sınıfları ve `direction`. */
  def: NutrientDef;
  value: number;
  target: number;
}

/** Hedef durumu metni.
 *
 *  `target` (protein, karbonhidrat, yağ, lif): hedefe ULAŞILACAK — kalanı sayar,
 *  tam tutunca "✓ Tamamlandı", aşınca uyarır.
 *
 *  `limit` (Faz 2: sodyum, şeker, doymuş yağ): hedef AŞILMAYACAK bir üst sınır;
 *  limite ulaşmak bir başarı olmadığı için "✓ Tamamlandı" hiç görünmez. Kayıttaki
 *  5 besinin hepsi `target` olduğundan bu dal şimdilik hiç çalışmıyor; renk/eşik
 *  semantiği (%80 warn vb.) Faz 2'de eklenecek. */
function statusText(def: NutrientDef, diff: number, isOver: boolean, isMet: boolean): string {
  if (def.direction === "limit") {
    return isOver
      ? `+${formatNumber(Math.abs(diff), def.decimals)}${def.unit} limit aşıldı!`
      : `${formatNumber(diff, def.decimals)}${def.unit} kullanılabilir`;
  }
  return isOver
    ? `+${formatNumber(Math.abs(diff), def.decimals)}${def.unit} aşıldı!`
    : isMet
      ? "✓ Tamamlandı"
      : `${formatNumber(diff, def.decimals)}${def.unit} kaldı`;
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

/** Labeled nutrient progress bar (protein/carb/fat/fiber) with count-up number animation & smooth bar fill. */
export function MacroBar({ def, value, target }: MacroBarProps) {
  const targetPct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  const pct = useAnimatedPct(targetPct);
  const animatedValue = useAnimatedValue(value);
  const diff = target - value;
  const isOver = target > 0 && diff < -0.05;
  const isMet = target > 0 && Math.abs(diff) <= 0.05;
  const c = def.classes;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-bold ${c.text}`}>{def.label}</span>
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
              • {statusText(def, diff, isOver, isMet)}
            </span>
          )}
        </div>
        <span className={`font-mono text-xs ${isOver ? "font-bold text-danger" : "text-ink-secondary"}`}>
          {formatNumber(animatedValue)} / {formatNumber(target)}
          {def.unit}
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
