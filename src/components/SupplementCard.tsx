import { useState } from "react";
import { Pill, Check, Sparkles } from "lucide-react";
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
  const takenCount = daySupps.length;
  const totalCount = suppConfig.items.length;
  const isAllTaken = totalCount > 0 && takenCount === totalCount;

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
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5 flex flex-col gap-3.5 shadow-card backdrop-blur-sm">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
            <Pill className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Takviyeler</h3>
            <p className="text-[11px] text-white/50">Günlük vitamin & gıda takviyeleri</p>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all ${
          isAllTaken
            ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
            : "bg-white/5 text-white/60 border border-white/10"
        }`}>
          {isAllTaken ? (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> Tamamlandı
            </span>
          ) : (
            `${takenCount}/${totalCount} alındı`
          )}
        </div>
      </div>

      {/* Supplement Items Grid */}
      <div className="flex flex-col gap-2">
        {suppConfig.items.map((item) => {
          const checked = daySupps.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => handleSupplementToggle(item.id)}
              className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all active:scale-[0.99] disabled:opacity-50 text-left ${
                checked
                  ? "border-purple-500/40 bg-purple-500/10 text-white shadow-sm"
                  : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  checked ? "bg-purple-500 text-black shadow" : "border border-white/20 bg-white/5"
                }`}>
                  {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                <div className="flex items-baseline gap-2 truncate">
                  <span className={`text-sm truncate ${checked ? "font-extrabold text-white" : "font-semibold text-white/80"}`}>
                    {item.name}
                  </span>
                  {item.dose && (
                    <span className={`text-xs font-mono shrink-0 ${checked ? "text-purple-300/80 font-semibold" : "text-white/40"}`}>
                      ({item.dose})
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
