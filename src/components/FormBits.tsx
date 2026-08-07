import { useState } from "react";
import type { ReactNode } from "react";
import { parseNum } from "../lib/nutrition";
import { MACROS, MICROS, NUTRIENTS, makeNutrition } from "../lib/nutrients";
import type { NutrientDef, NutrientKey } from "../lib/nutrients";
import { formatKcal, formatNumber } from "../lib/format";
import type { Nutrition } from "../types";

/** Input ve select için ortak görsel dil. */
export const fieldCls =
  "w-full rounded-chip border border-line bg-white/[0.04] px-3 py-2 text-base sm:text-sm text-ink-primary outline-none transition placeholder:text-ink-faint focus:border-memory/60";

export const sectionLabelCls = "font-mono text-[11px] uppercase tracking-mono text-ink-tertiary";
export const bigNumCls = "font-extrabold tabular-nums tracking-tight";

export function Label({ children }: { children: ReactNode }) {
  return <span className={`mb-1 block ${sectionLabelCls}`}>{children}</span>;
}

/** `type`/`inputMode`/`autoComplete` SONRADAN eklendi ve hepsi opsiyonel —
 *  mevcut çağıranların hiçbiri değişmedi. `autoComplete` olmadan Android'in
 *  otomatik doldurması ve parola yöneticileri çalışmıyor; mobil öncelikli bir
 *  uygulamada giriş formu için bu gerçek bir kusur olurdu. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type,
  inputMode,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password";
  inputMode?: "text" | "email";
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        className={fieldCls}
        value={value}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
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

/** Sayısal bir gösterim değerini (kart içindeki büyük rakam gibi) yerinde
 *  düzenlenebilir yapar — odaklanınca/tıklayınca tüm metin seçili gelir
 *  (`AliasPicker`'daki aynı desen), virgül/nokta ayrımı `fromDraft` → `parseNum`
 *  aşamasında zaten birleştiği için burada normalize etmeye gerek yok. */
export function EditableStat({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
      onClick={(e) => (e.target as HTMLInputElement).select()}
      className={`bg-transparent outline-none placeholder:text-white/30 ${className}`}
    />
  );
}

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
    d[def.key] = v === undefined ? "" : String(v);
  }
  return d;
}

function isBlank(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === "";
}

export function fromDraft(d: NutritionDraft): Nutrition {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const def of NUTRIENTS) {
    const raw = d[def.key];
    if (raw === undefined) continue;
    if (def.group === "micro" && isBlank(raw)) continue;
    out[def.key] = parseNum(raw);
  }
  return makeNutrition(out);
}

export function draftNum(d: NutritionDraft, key: NutrientKey): number {
  return parseNum(d[key] ?? "");
}

export function filledMicros(d: NutritionDraft): readonly NutrientDef[] {
  return MICROS.filter((def) => !isBlank(d[def.key]));
}

const FORM_MAIN: readonly NutrientDef[] = NUTRIENTS.filter((def) => def.group !== "micro");

export function NutritionFields({
  draft,
  onChange,
}: {
  draft: NutritionDraft;
  onChange: (d: NutritionDraft) => void;
}) {
  const set = (k: NutrientKey) => (v: string) => onChange({ ...draft, [k]: v });
  const [open, setOpen] = useState(false);
  const filled = filledMicros(draft);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FORM_MAIN.map((def) => (
          <NumField
            key={def.key}
            label={def.label}
            suffix={def.unit}
            value={draft[def.key] ?? ""}
            onChange={set(def.key)}
          />
        ))}
      </div>

      {MICROS.length > 0 && (
        <div className="rounded-chip border border-line bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
          >
            <span className="flex items-center gap-2">
              <span className={sectionLabelCls}>Mikro besinler</span>
              {filled.length > 0 && (
                <span className="rounded-pill bg-micro/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-micro">
                  {filled.map((def) => def.short).join(" · ")}
                </span>
              )}
            </span>
            <span className="font-mono text-xs text-ink-tertiary">{open ? "−" : "+"}</span>
          </button>
          {open && (
            <div className="grid grid-cols-2 gap-3 border-t border-line p-3 sm:grid-cols-3">
              {MICROS.map((def) => (
                <NumField
                  key={def.key}
                  label={def.label}
                  suffix={def.unit}
                  value={draft[def.key] ?? ""}
                  onChange={set(def.key)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <p className="text-[11px] text-ink-faint">
          Boş bıraktığın mikro besin "bilinmiyor" sayılır — 0 olarak kaydedilmez.
        </p>
      )}
    </div>
  );
}

export function nutrientSummary(
  n: Nutrition,
  defs: readonly NutrientDef[],
  decimals?: number,
): string {
  return defs
    .map((def) => `${def.short}${formatNumber(n[def.key] ?? 0, decimals ?? def.decimals)}`)
    .join(" · ");
}

export type SummaryKcal = "none" | "inline" | "total";

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
  defs?: readonly NutrientDef[];
  decimals?: number;
  kcal?: SummaryKcal;
  prefix?: string;
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
    <div className="flex items-center justify-end gap-2">
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

/** `MealForm`'un Kaydet koruması: aktif sekmede listeye eklenmemiş ama
 *  kaydedilebilir bir girdi varsa `true` döner — sepet (basket) zaten dolu
 *  olduğu için (`existing`'ten ya da önceki "+ Ekle"lerden) Kaydet o sepeti
 *  yazar ve aktif sekmenin alanları sessizce göz ardı edilir; bu fonksiyon o
 *  sessiz kaybı yakalar.
 *
 *  `basketLength === 0` iken hiçbir zaman `true` dönmez: o durumda aktif
 *  sekmenin alanları zaten DOĞRUDAN kaydedilir (kayıp yok, engellemeye gerek
 *  yok — bkz. `MealForm`'un `finalNutrition`'ı).
 *
 *  "alias" (Hafızadan) modu özel: `aliasId`/`grams` her zaman bir varsayılana
 *  sahiptir (ilk sıralı alias + porsiyon/her-zamanki tahmini), yani sadece
 *  "seçili ve miktar > 0" kontrolü mevcut düzenleme ekranını AÇAR AÇMAZ (hiç
 *  dokunulmadan) Kaydet'i bloke ederdi. Bu yüzden `aliasPendingAdd` ayrı
 *  izleniyor: yalnızca kullanıcı gerçekten bir alanı DEĞİŞTİRDİĞİNDE `true`
 *  olur, "+ Ekle" ile sepete düştüğünde tekrar `false`'a döner. "manual"
 *  (Elle) modunda böyle bir izleyiciye gerek yok: `hasManualNutrition` zaten
 *  taslak sıfırdan başladığı ve eklendikten sonra sıfırlandığı için
 *  "dokunuldu mu" sorusuna kendiliğinden doğru cevap veriyor. */
export function hasUnsavedBasketEntry(params: {
  basketLength: number;
  mode: "alias" | "manual" | "ai";
  hasManualNutrition: boolean;
  aliasPendingAdd: boolean;
  aliasAddable: boolean;
}): boolean {
  if (params.basketLength === 0) return false;
  if (params.mode === "manual") return params.hasManualNutrition;
  if (params.mode === "alias") return params.aliasPendingAdd && params.aliasAddable;
  return false;
}

/** Uzun öğün adlarını varsayılan 2 satıra sıkan, dokununca tam açan/kapatan bileşen. */
export function ExpandableMealName({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((prev) => !prev);
      }}
      title={name}
      className={`cursor-pointer transition-colors hover:text-memory ${
        expanded ? "line-clamp-none" : "line-clamp-2"
      } ${className}`}
    >
      {name}
    </span>
  );
}

