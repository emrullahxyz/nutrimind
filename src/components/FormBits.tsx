import { useState } from "react";
import type { ReactNode } from "react";
import { parseNum } from "../lib/nutrition";
import type { Nutrition } from "../types";

/** Input ve select için ortak görsel dil. */
export const fieldCls =
  "w-full rounded-chip border border-line bg-white/[0.04] px-3 py-2 text-sm text-ink-primary outline-none transition placeholder:text-ink-faint focus:border-memory/60";

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">{children}</span>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input className={fieldCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <Label>{suffix ? `${label} (${suffix})` : label}</Label>
      <input
        className={`${fieldCls} font-mono`}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Makro alanları form içinde metin olarak tutulur (yarım yazılmış "12," bozulmasın). */
export interface NutritionDraft {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

export const EMPTY_DRAFT: NutritionDraft = { kcal: "", protein: "", carbs: "", fat: "", fiber: "" };

export function toDraft(n: Nutrition): NutritionDraft {
  return {
    kcal: String(n.kcal),
    protein: String(n.protein),
    carbs: String(n.carbs),
    fat: String(n.fat),
    fiber: String(n.fiber),
  };
}

export function fromDraft(d: NutritionDraft): Nutrition {
  return {
    kcal: parseNum(d.kcal),
    protein: parseNum(d.protein),
    carbs: parseNum(d.carbs),
    fat: parseNum(d.fat),
    fiber: parseNum(d.fiber),
  };
}

export function NutritionFields({
  draft,
  onChange,
}: {
  draft: NutritionDraft;
  onChange: (d: NutritionDraft) => void;
}) {
  const set = (k: keyof NutritionDraft) => (v: string) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <NumField label="Kalori" suffix="kcal" value={draft.kcal} onChange={set("kcal")} />
      <NumField label="Protein" suffix="g" value={draft.protein} onChange={set("protein")} />
      <NumField label="Karbonhidrat" suffix="g" value={draft.carbs} onChange={set("carbs")} />
      <NumField label="Yağ" suffix="g" value={draft.fat} onChange={set("fat")} />
      <NumField label="Lif" suffix="g" value={draft.fiber} onChange={set("fiber")} />
    </div>
  );
}

export function FormActions({
  onCancel,
  onSave,
  saving,
  disabled,
  saveLabel = "Kaydet",
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
  saveLabel?: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink-secondary transition hover:text-ink-primary disabled:opacity-40 disabled:hover:text-ink-secondary"
      >
        Vazgeç
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="rounded-pill bg-accent px-4 py-2 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
      >
        {saving ? "…" : saveLabel}
      </button>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-chip bg-danger/10 px-3 py-2 text-xs text-danger">{children}</p>;
}

/** İki adımlı sil onayı: ilk tık "Emin misin?"e döner, ikinci tık siler. */
export function ConfirmButton({
  onConfirm,
  label = "Sil",
  className = "",
  disabled = false,
}: {
  onConfirm: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        // Onaydan sonra kur-durumunu bırak: aynı satıra ikinci tık yeni bir silme uçurmasın.
        setArmed(false);
        if (armed) onConfirm();
        else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
      className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
        armed ? "bg-danger/20 text-danger" : "bg-white/[0.06] text-ink-tertiary hover:text-danger"
      } ${className}`}
    >
      {armed ? "Emin misin?" : label}
    </button>
  );
}
