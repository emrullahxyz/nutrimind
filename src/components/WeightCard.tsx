import { useEffect, useState } from "react";
import { Card } from "./Card";
import { NumField } from "./FormBits";
import { useData } from "../lib/data";
import { formatNumber } from "../lib/format";
import { parseNum } from "../lib/nutrition";
import { parseWeightConfig, weightDelta } from "../lib/weight";

export function WeightCard({ date }: { date: string }) {
  const { config, updateConfig } = useData();
  const weightConfig = parseWeightConfig(config);
  const entries = weightConfig.entries;
  const currentKg = entries[date];

  const [draft, setDraft] = useState<string>(currentKg !== undefined ? String(currentKg) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(entries[date] !== undefined ? String(entries[date]) : "");
  }, [date, entries[date]]);

  const delta = weightDelta(entries, date);

  async function handleSave() {
    if (busy) return;
    const val = parseNum(draft);
    if (val <= 0) return;
    setBusy(true);
    try {
      await updateConfig("weight", {
        entries: {
          ...entries,
          [date]: val,
        },
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy || !(date in entries)) return;
    setBusy(true);
    try {
      const nextEntries = { ...entries };
      delete nextEntries[date];
      await updateConfig("weight", { entries: nextEntries });
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex-1">
          <NumField label="Kilo" suffix="kg" value={draft} onChange={setDraft} />
        </div>
        <div className="flex items-center gap-2">
          {date in entries && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-tertiary transition hover:text-warn disabled:opacity-40"
            >
              Sil
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !draft.trim()}
            className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
          >
            Kaydet
          </button>
        </div>
      </div>
      {delta !== null && (
        <div className="mt-2 flex items-center gap-1.5 font-mono text-xs text-ink-tertiary">
          <span>
            {delta > 0
              ? `▲${formatNumber(delta, 1)} kg`
              : delta < 0
                ? `▼${formatNumber(Math.abs(delta), 1)} kg`
                : `0,0 kg`}
          </span>
          <span className="text-[11px] text-ink-faint">(önceki kayda göre)</span>
        </div>
      )}
    </Card>
  );
}
