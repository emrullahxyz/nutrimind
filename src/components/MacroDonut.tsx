import { formatNumber } from "../lib/format";
import type { Nutrition } from "../types";

const PARTS = [
  { key: "protein", label: "Protein", color: "#34d399", perG: 4 },
  { key: "carbs", label: "Karb", color: "#fb923c", perG: 4 },
  { key: "fat", label: "Yağ", color: "#fbbf24", perG: 9 },
] as const;

/** Makro kalori dağılımını (protein/karb/yağ) gösteren donut. */
export function MacroDonut({ nutrition, size = 200 }: { nutrition: Nutrition; size?: number }) {
  const segs = PARTS.map((p) => ({ ...p, kcal: nutrition[p.key] * p.perG }));
  const total = segs.reduce((a, s) => a + s.kcal, 0) || 1;

  const stroke = 18;
  const r = size / 2 - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: "rotate(-90deg)", filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.55))" }}
        >
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          {segs.map((s, i) => {
            const frac = s.kcal / total;
            const len = frac * circ;
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                className="anim-fadeup"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-mono text-2xl font-extrabold text-ink-primary">{formatNumber(nutrition.kcal)}</div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-ink-tertiary">kcal</div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-ink-secondary">{s.label}</span>
            <span className="font-mono text-ink-tertiary">%{Math.round((s.kcal / total) * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
