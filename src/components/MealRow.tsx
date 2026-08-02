import { useState } from "react";
import { formatKcal, formatNumber } from "../lib/format";
import { useAnimatedPct } from "../lib/useAnimatedValue";
import { breakdownRows } from "../lib/mealBreakdown";
import { ConfirmButton } from "./FormBits";
import type { MealItem } from "../types";

interface MealRowProps {
  meal: MealItem;
  pct: number;
  index: number;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onSaveTemplate: () => void;
  onRemove: () => void;
  busy: boolean;
}

/** Tek bir öğün kartı — kapalıyken ad (1 satır) + kcal + pay barı; açıkken tam
 *  ad + besin dökümü + aksiyonlar (Düzenle/Şablon yap/Sil). Satır kendi
 *  toggle'ını yönetir; seç modundaysa (çoklu birleştirme) button yerine
 *  checkbox+label olur — iki mod aynı anda aktif olamaz. */
export function MealRow({
  meal,
  pct,
  index,
  selectMode,
  isSelected,
  onToggleSelect,
  onEdit,
  onSaveTemplate,
  onRemove,
  busy,
}: MealRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = expanded && !selectMode;
  const animPct = useAnimatedPct(pct);
  const rows = breakdownRows(meal.computed);
  const delay = Math.min(index, 6) * 60;

  const nameCls = `min-w-0 flex-1 text-[15px] font-semibold transition-colors ${
    isOpen ? "" : "line-clamp-1"
  } ${isSelected ? "text-accent" : "text-ink-primary"}`;

  return (
    <li
      className="anim-fadeup overflow-hidden rounded-chip bg-surface shadow-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex">
        <div className="w-1 flex-none bg-gradient-to-b from-memory to-memory-deep" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          {selectMode ? (
            <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggleSelect}
                className="h-3.5 w-3.5 flex-none rounded border-line bg-white/[0.06] text-accent focus:ring-0 cursor-pointer"
              />
              <span className={nameCls}>{meal.label}</span>
              <span className="flex flex-none items-center font-mono text-[13px] font-semibold text-ink-secondary">
                {formatKcal(meal.computed.kcal)}
                <span className="ml-1 text-[11px] font-normal text-ink-faint">%{Math.round(pct)}</span>
              </span>
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={isOpen}
              className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.03]"
            >
              <span className={nameCls}>{meal.label}</span>
              <span className="flex flex-none items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-ink-secondary">
                  {formatKcal(meal.computed.kcal)}
                  <span className="ml-1 text-[11px] font-normal text-ink-faint">%{Math.round(pct)}</span>
                </span>
                <span aria-hidden="true" className="font-mono text-xs text-ink-tertiary">
                  {isOpen ? "\u2212" : "+"}
                </span>
              </span>
            </button>
          )}

          <div className="px-3 pb-2">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-memory-deep to-memory shadow-memory transition-[width] duration-700 ease-out"
                style={{ width: `${animPct}%` }}
              />
            </div>
          </div>

          {isOpen && (
            <div className="anim-fadeup flex flex-col gap-3 border-t border-line px-3 py-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {rows.map(({ def, value }) => (
                  <div key={def.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={`font-semibold ${def.classes.text}`}>{def.label}</span>
                    <span className="font-mono text-ink-secondary">
                      {formatNumber(value, def.decimals)}
                      {def.unit}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={busy}
                  className="rounded-pill bg-white/[0.06] px-3 py-2.5 text-xs font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={onSaveTemplate}
                  disabled={busy}
                  className="rounded-pill bg-white/[0.06] px-3 py-2.5 text-xs font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
                >
                  Şablon yap
                </button>
                <ConfirmButton onConfirm={onRemove} disabled={busy} className="px-3 py-2.5" />
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
