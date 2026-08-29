import type { TrendRange } from "../lib/trend";
import { useTranslation } from "react-i18next";

export const RANGE_OPTIONS: TrendRange[] = [7, 30, 90, "all"];

const RANGE_LABEL_KEY: Record<TrendRange, string> = {
  7: "range.last7",
  30: "range.last30",
  90: "range.last90",
  all: "range.all",
};

/** Çeviri çağrı yerinde yapılır (saf lib'de useTranslation import edilmez). */
export function formatRangeLabel(range: TrendRange, t: (k: string) => string): string {
  return t(RANGE_LABEL_KEY[range]);
}

export function RangePicker({
  value,
  onChange,
}: {
  value: TrendRange;
  onChange: (range: TrendRange) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {RANGE_OPTIONS.map((range) => (
        <button
          key={String(range)}
          type="button"
          onClick={() => onChange(range)}
          className={`flex flex-none items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold transition ${
            value === range
              ? "bg-memory text-memory-ink"
              : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {t(RANGE_LABEL_KEY[range])}
        </button>
      ))}
    </div>
  );
}
