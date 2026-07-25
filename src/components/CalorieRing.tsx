import { formatNumber } from "../lib/format";

interface CalorieRingProps {
  consumed: number;
  target: number;
  size?: number;
}

/** Big conic-gradient calorie ring, center shows remaining/consumed/target. */
export function CalorieRing({ consumed, target, size = 196 }: CalorieRingProps) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (consumed / target) * 100)) : 0;
  const remaining = Math.max(0, target - consumed);
  const innerSize = size - 38;

  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(#34d399 0 ${pct}%, rgba(255,255,255,0.06) ${pct}% 100%)`,
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-full bg-app"
        style={{ width: innerSize, height: innerSize }}
      >
        <div className="text-[40px] font-extrabold leading-none tracking-tight text-ink-primary">
          {formatNumber(remaining)}
        </div>
        <div className="mt-2 text-xs text-ink-tertiary">
          {consumed > target ? "hedef aşıldı" : "kcal kaldı"}
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-ink-faint">
          {formatNumber(consumed)} / {formatNumber(target)}
        </div>
      </div>
    </div>
  );
}
