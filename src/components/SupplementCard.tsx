import { useState } from "react";
import { Card } from "./Card";
import { useData } from "../lib/data";
import { parseSupplementsConfig } from "../lib/supplements";

export function SupplementCard({ date }: { date: string }) {
  const { config, updateConfig } = useData();
  const suppConfig = parseSupplementsConfig(config);
  const [busy, setBusy] = useState(false);

  if (suppConfig.items.length === 0) {
    return null;
  }

  const daySupps = suppConfig.log[date] ?? [];

  async function handleSupplementToggle(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const currentIds = suppConfig.log[date] ?? [];
      const nextIds = currentIds.includes(id)
        ? currentIds.filter((x) => x !== id)
        : [...currentIds, id];

      await updateConfig("supplements", {
        items: suppConfig.items,
        log: {
          ...suppConfig.log,
          [date]: nextIds,
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
        Takviyeler
      </span>

      <div className="flex flex-col gap-1.5">
        {suppConfig.items.map((item) => {
          const checked = daySupps.includes(item.id);
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-chip px-2 py-1 transition hover:bg-white/[0.03]"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => handleSupplementToggle(item.id)}
                className="h-4 w-4 flex-none rounded border-line bg-white/[0.06] text-memory focus:ring-0 cursor-pointer disabled:opacity-50"
              />
              <span
                className={`text-sm transition ${
                  checked ? "font-semibold text-ink-primary" : "text-ink-secondary"
                }`}
              >
                {item.name}
              </span>
              {item.dose && (
                <span className="font-mono text-xs text-ink-tertiary">({item.dose})</span>
              )}
            </label>
          );
        })}
      </div>
    </Card>
  );
}
