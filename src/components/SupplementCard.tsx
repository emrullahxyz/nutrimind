import { useState } from "react";
import { Pill, Check, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useData } from "../lib/data";
import { parseSupplementsConfig } from "../lib/supplements";
import { PREF } from "../lib/prefs";
import { usePersistedBool } from "../lib/usePersistedBool";

export function SupplementCard({ date }: { date: string }) {
  const { config, updateConfig } = useData();
  const suppConfig = parseSupplementsConfig(config);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = usePersistedBool(PREF.supplementsOpen, false);

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
    <div className="rounded-[24px] bg-[#22202E] p-4 sm:p-5 flex flex-col gap-3 shadow-card backdrop-blur-sm transition-all">
      {/* Card Header (Collapsible Trigger) */}
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#2A283A] text-purple-300 flex items-center justify-center shrink-0">
            <Pill className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-base">Takviyeler</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono transition-all ${
                isAllTaken
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "bg-white/5 text-[#A5A2B8]"
              }`}>
                {isAllTaken ? "✨ Tamamlandı" : `${takenCount}/${totalCount} alındı`}
              </span>
            </div>
            <p className="text-[11px] text-[#A5A2B8] truncate">Günlük vitamin & gıda takviyeleri</p>
          </div>
        </div>

        <div className="w-8 h-8 rounded-full bg-[#2A283A] hover:bg-[#343248] flex items-center justify-center text-[#A5A2B8] hover:text-white transition shrink-0 ml-2">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Collapsed Preview Chips (When Closed) */}
      {!open && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          {suppConfig.items.map((item) => {
            const checked = daySupps.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSupplementToggle(item.id);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 whitespace-nowrap ${
                  checked
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "bg-white/5 text-white/40 border border-white/10 hover:text-white/70"
                }`}
              >
                {checked ? (
                  <Check className="w-3 h-3 text-purple-400 stroke-[3]" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                )}
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded Supplement Items List (When Open) */}
      {open && (
        <div className="flex flex-col gap-2 pt-1 animate-fadeIn">
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
      )}
    </div>
  );
}
