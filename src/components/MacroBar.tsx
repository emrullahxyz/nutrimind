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

/** Labeled macro progress bar (protein/carb/fat/fiber), colored per hifi tokens. */
export function MacroBar({ kind, value, target, unit = "g" }: MacroBarProps) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  const c = macroClasses(kind);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-[13px] font-bold ${c.text}`}>{macroLabel(kind)}</span>
        <span className="font-mono text-xs text-ink-secondary">
          {formatNumber(value)} / {formatNumber(target)}
          {unit}
        </span>
      </div>
      <div className={`h-2 rounded-full ${c.track}`}>
        <div className={`h-full rounded-full ${c.bg}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
