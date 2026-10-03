// Şablon önizlemesi: çipe dokununca kör uygulamadan önce içindekiler +
// kalem makroları gösterilir, kalem swap edilebilir, "şablonu da güncelle"
// seçeneğiyle değişiklik tanıma da yazılır.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { FormActions, NutrientSummaryLine } from "./FormBits";
import type { MealTemplate } from "../lib/templates";
import type { Alias, MealSource, Nutrition } from "../types";
import { addNutrition, scaleNutrition, toGrams, unitOptions } from "../lib/nutrition";
import { ZERO_NUTRITION } from "../types";

interface PreviewLine {
  name: string;
  grams: number | null;
  nutrition: Nutrition;
  sources?: MealSource[];
}

function resolveTemplateLines(t: MealTemplate, aliases: Alias[]): PreviewLine[] {
  const byId = new Map(aliases.map((a) => [a.id, a]));
  return t.items.map((it) => {
    const src = it.sources?.[0];
    const alias = src ? byId.get(src.aliasId) : undefined;
    if (src && alias) {
      const units = unitOptions(alias.units);
      const norm = src.unit.trim().toLocaleLowerCase("tr");
      const unit = units.find((u) => u.name.trim().toLocaleLowerCase("tr") === norm);
      if (unit) {
        const grams = toGrams(src.qty, unit);
        if (grams > 0) {
          return {
            name: alias.name,
            grams: Math.round(grams * 10) / 10,
            nutrition: scaleNutrition(alias.nutrition, alias.serving_g, grams),
            sources: [{ aliasId: alias.id, qty: src.qty, unit: unit.name }],
          };
        }
      }
    }
    return { name: it.name, grams: null, nutrition: it.nutrition, sources: it.sources };
  });
}

export function TemplatePreview({
  template,
  aliases,
  busy,
  onClose,
  onApply,
}: {
  template: MealTemplate;
  aliases: Alias[];
  busy: boolean;
  onClose: () => void;
  /** lines: güncel kalemler, updateTemplate: tanıma da yazılsın mı. */
  onApply: (lines: PreviewLine[], updateTemplate: boolean) => void;
}) {
  const { t } = useTranslation();
  const initial = useMemo(() => resolveTemplateLines(template, aliases), [template, aliases]);
  const [lines, setLines] = useState<PreviewLine[]>(initial);
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [updateTemplate, setUpdateTemplate] = useState(false);

  // ponytail: swappable = tek kaynak + çözüldü. Çok kaynaklı/çözümsüz
  // satır swap sunmaz (sessiz yanlış hesap yerine toplam satırı).
  const total = lines.reduce<Nutrition>(
    (a, l) => addNutrition(a, l.nutrition),
    { ...ZERO_NUTRITION },
  );

  function doSwap(idx: number, aliasId: string) {
    const next = aliases.find((a) => a.id === aliasId);
    const line = lines[idx];
    if (!next || !line || line.grams === null) return;
    const grams = line.grams;
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              name: next.name,
              grams,
              nutrition: scaleNutrition(next.nutrition, next.serving_g, grams),
              sources: [{ aliasId: next.id, qty: grams, unit: "g" }],
            }
          : l,
      ),
    );
    setSwapIdx(null);
  }

  return (
    <Modal
      title={template.name}
      onClose={onClose}
      footer={
        <FormActions
          onCancel={onClose}
          onSave={() => onApply(lines, updateTemplate)}
          saving={busy}
          disabled={lines.length === 0}
          saveLabel={t("day.addMeal")}
        />
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li
              key={i}
              className="rounded-chip border border-line bg-white/[0.03] px-3 py-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-primary">
                  {l.name}
                </span>
                <span className="flex-none font-mono text-ink-tertiary">
                  {l.grams !== null ? `${l.grams} g · ` : ""}
                  {l.nutrition.kcal} kcal
                </span>
              </div>
              <NutrientSummaryLine
                as="span"
                nutrition={l.nutrition}
                className="mt-1 block font-mono text-[11px] text-ink-tertiary"
              />
              {l.grams !== null && aliases.length > 0 &&
                (swapIdx === i ? (
                  <select
                    autoFocus
                    className="mt-2 w-full rounded-xl bg-field px-3 py-2 text-xs font-bold text-white focus:outline-none"
                    value={l.sources?.[0]?.aliasId ?? ""}
                    onChange={(e) => doSwap(i, e.target.value)}
                    onBlur={() => setSwapIdx(null)}
                  >
                    {aliases.map((a) => (
                      <option key={a.id} value={a.id} className="bg-field text-white">
                        {a.name} · {a.nutrition.kcal} kcal/{a.serving_g}g
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSwapIdx(i)}
                    className="mt-2 text-[11px] font-bold text-amber-300 hover:underline"
                  >
                    {t("nutrition.swapIngredient")}
                  </button>
                ))}
            </li>
          ))}
        </ul>
        <NutrientSummaryLine
          nutrition={total}
          kcal="total"
          className="rounded-chip border border-line bg-white/[0.03] p-3 font-mono text-xs text-accent"
        />
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={updateTemplate}
            onChange={(e) => setUpdateTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/10"
          />
          {t("templatePreview.updateTemplate")}
        </label>
      </div>
    </Modal>
  );
}
