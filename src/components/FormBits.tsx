import { useState } from "react";
import type { ReactNode } from "react";
import { parseNum } from "../lib/nutrition";
import { MACROS, NUTRIENTS, makeNutrition } from "../lib/nutrients";
import type { NutrientDef, NutrientKey } from "../lib/nutrients";
import { formatKcal, formatNumber } from "../lib/format";
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

/** Besin alanları form içinde METİN olarak tutulur (yarım yazılmış "12,"
 *  bozulmasın). Anahtarlar opsiyonel: taslakta yalnızca kayıtta bulunan (yani
 *  ekranda gerçekten çizilen) alanlar bulunur. */
export type NutritionDraft = Partial<Record<NutrientKey, string>>;

function emptyDraft(): NutritionDraft {
  const d: NutritionDraft = {};
  for (const def of NUTRIENTS) d[def.key] = "";
  return d;
}

export const EMPTY_DRAFT: NutritionDraft = emptyDraft();

export function toDraft(n: Nutrition): NutritionDraft {
  const d: NutritionDraft = {};
  for (const def of NUTRIENTS) {
    const v = n[def.key];
    // Girilmemiş (bilinmiyor) alan boş kutu olarak açılır, "0" olarak değil.
    d[def.key] = v === undefined ? "" : String(v);
  }
  return d;
}

export function fromDraft(d: NutritionDraft): Nutrition {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const def of NUTRIENTS) {
    const raw = d[def.key];
    if (raw === undefined) continue;
    out[def.key] = parseNum(raw);
  }
  // Çekirdek alanlar `makeNutrition` tabanında 0'a düşer; kayıtta olmayan mikro
  // alanlar hiç yazılmaz. (Faz 2: mikro kutusu BOŞ bırakıldığında da 0 değil
  // "bilinmiyor" üretmesi gerekecek.)
  return makeNutrition(out);
}

/** Taslaktaki bir alanın sayısal değeri (eksik/boş = 0). */
export function draftNum(d: NutritionDraft, key: NutrientKey): number {
  return parseNum(d[key] ?? "");
}

export function NutritionFields({
  draft,
  onChange,
}: {
  draft: NutritionDraft;
  onChange: (d: NutritionDraft) => void;
}) {
  const set = (k: NutrientKey) => (v: string) => onChange({ ...draft, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {NUTRIENTS.map((def) => (
        <NumField
          key={def.key}
          label={def.label}
          suffix={def.unit}
          value={draft[def.key] ?? ""}
          onChange={set(def.key)}
        />
      ))}
    </div>
  );
}

/** "P12,5 · K30 · Y5 · L2" — kayıttaki `short` alanından üretilir. */
export function nutrientSummary(
  n: Nutrition,
  defs: readonly NutrientDef[],
  decimals?: number,
): string {
  // Faz 2: eksik mikro besin burada "0" olarak görünür; mikrolar arayüze
  // girdiğinde "veri yok" gösterimi gerekecek (bkz. coverage()).
  return defs
    .map((def) => `${def.short}${formatNumber(n[def.key] ?? 0, decimals ?? def.decimals)}`)
    .join(" · ");
}

/** kcal'in özet satırındaki gösterimi:
 *  - `none`   → hiç yazılmaz
 *  - `inline` → satır başında düz "N kcal", makrolar soluk bir span içinde
 *  - `total`  → kalın "Toplam: N kcal", makrolar parantez içinde */
export type SummaryKcal = "none" | "inline" | "total";

/** Uygulamanın 5 ayrı yerinde elle yazılmış mono besin özeti satırı.
 *  Çağrı yerleri arasındaki farklar (kcal gösterimi, listelenen besinler,
 *  ondalık hane) bilinçli olarak korunuyor — bkz. AliasPage'teki TODO. */
export function NutrientSummaryLine({
  nutrition,
  defs = MACROS,
  decimals,
  kcal = "none",
  prefix,
  as: Tag = "div",
  className = "",
}: {
  nutrition: Nutrition;
  /** Listelenecek besinler — varsayılan: tüm makrolar (protein/karb/yağ/lif). */
  defs?: readonly NutrientDef[];
  /** Ondalık hane — verilmezse her besinin kayıttaki kendi hassasiyeti. */
  decimals?: number;
  kcal?: SummaryKcal;
  /** kcal'den önce yazılan ek metin (ör. "100 g · "). */
  prefix?: string;
  /** Sarmalayıcı etiket: bazı çağrı yerleri blok, bazıları satır-içi. */
  as?: "div" | "span";
  className?: string;
}) {
  const summary = nutrientSummary(nutrition, defs, decimals);

  if (kcal === "none") return <Tag className={className}>{summary}</Tag>;

  if (kcal === "total")
    return (
      <Tag className={className}>
        <strong>Toplam: {formatKcal(nutrition.kcal)}</strong> ({summary})
      </Tag>
    );

  return (
    <Tag className={className}>
      {prefix}
      {formatKcal(nutrition.kcal)}
      <span className="ml-2 text-ink-tertiary">{summary}</span>
    </Tag>
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
