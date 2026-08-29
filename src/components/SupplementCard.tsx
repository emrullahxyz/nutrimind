import { useState } from "react";
import { Pill, Check, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { useData } from "../lib/data";
import { parseSupplementsConfig } from "../lib/supplements";
import { PREF } from "../lib/prefs";
import { usePersistedBool } from "../lib/usePersistedBool";
import { usePressSpring } from "../hooks/usePressSpring";
import { useTranslation } from "react-i18next";

export function SupplementCard({ date, onOpenSettings }: { date: string; onOpenSettings?: () => void }) {
  const { t } = useTranslation();
  const { config, updateConfig } = useData();
  const suppConfig = parseSupplementsConfig(config);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = usePersistedBool(PREF.supplementsOpen, false);

  const press = usePressSpring({ pressScale: 0.97 });

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
    <div className="rounded-[24px] bg-calCard glass-card p-4 sm:p-5 flex flex-col gap-2.5 shadow-card backdrop-blur-sm transition-all">
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between cursor-pointer select-none"
        {...press.handlers}
        style={press.style}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Pill className="w-4 h-4 text-memory shrink-0" />
          <h3 className="font-bold text-white text-sm">{t("supplements.title")}</h3>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono transition-all ${
            isAllTaken
              ? "bg-memory/20 text-memory border border-memory/40"
              : "bg-white/5 text-ink-secondary"
          }`}>
            {isAllTaken ? t("supplements.done") : `${takenCount}/${totalCount}`}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {open ? <ChevronUp className="w-4 h-4 text-ink-secondary" /> : <ChevronDown className="w-4 h-4 text-ink-secondary" />}
          {onOpenSettings && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings();
              }}
              className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-ink-secondary hover:text-white transition"
              title={t("supplements.manage")}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsed: inline chips */}
      {!open && (
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
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
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all active:scale-95 whitespace-nowrap ${
                  checked
                    ? "bg-memory/20 text-memory border border-memory/40"
                    : "bg-white/5 text-white/30 border border-white/10 hover:text-white/60"
                }`}
              >
                {checked && <Check className="w-2.5 h-2.5 text-memory stroke-[3]" />}
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded: compact list */}
      {open && (
        <div className="flex flex-col gap-1.5 animate-fadeIn">
          {suppConfig.items.map((item) => {
            const checked = daySupps.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => handleSupplementToggle(item.id)}
                className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all active:scale-[0.99] disabled:opacity-50 text-left ${
                  checked
                    ? "bg-memory/10 text-white"
                    : "bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  checked ? "bg-memory text-black" : "border border-white/20 bg-white/5"
                }`}>
                  {checked && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span className={`text-sm flex-1 truncate ${checked ? "font-bold" : "font-medium"}`}>{item.name}</span>
                {item.dose && (
                  <span className={`text-[11px] font-mono shrink-0 ${checked ? "text-memory/70" : "text-white/30"}`}>{item.dose}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
