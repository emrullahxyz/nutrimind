import type { TrendRange } from "../lib/trend";

export const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
  { value: 7, label: "7 gün" },
  { value: 30, label: "30 gün" },
  { value: 90, label: "90 gün" },
  { value: "all", label: "Tümü" },
];

export function formatRangeLabel(range: TrendRange): string {
  const opt = RANGE_OPTIONS.find((r) => r.value === range);
  return opt ? opt.label : String(range);
}

export function RangePicker({
  value,
  onChange,
}: {
  value: TrendRange;
  onChange: (range: TrendRange) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {RANGE_OPTIONS.map((r) => (
        <button
          key={String(r.value)}
          type="button"
          onClick={() => onChange(r.value)}
          className={`flex flex-none items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold transition ${
            value === r.value
              ? "bg-memory text-memory-ink"
              : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
