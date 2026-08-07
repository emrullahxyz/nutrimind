import { useMemo, useState } from "react";
import { Label, NumField, NutritionFields, fieldCls, fromDraft, sectionLabelCls, toDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import {
  GRAM_UNIT,
  parseNum,
  scaleMealSources,
  scaleNutrition,
  scaleNutritionByFactor,
  toGrams,
  unitOptions,
} from "../lib/nutrition";
import type { Alias, MealSource, Nutrition } from "../types";

export interface EditableItem {
  name: string;
  nutrition: Nutrition;
  sources?: MealSource[];
}

type Basis = "quantity" | "manual";

/** Miktar kontrolünün hangi türde gösterileceğine karar verir: tek kaynak,
 *  hâlâ hafızada var olan bir alias'a işaret ediyorsa kesin miktar+birim
 *  (barkod onay ekranındaki desen); aksi halde (kaynak yok / birden fazla /
 *  alias silinmiş) porsiyon çarpanı stepper'ına düşer. Saf fonksiyon — bkz.
 *  `ItemEditFields.test.ts`. */
export function resolveQuantityMode(
  sources: MealSource[] | undefined,
  aliases: readonly Pick<Alias, "id">[],
): "exact" | "stepper" {
  if (!sources || sources.length !== 1) return "stepper";
  return aliases.some((a) => a.id === sources[0].aliasId) ? "exact" : "stepper";
}

/** Sepet-içi kalem düzenleme (`MealForm`) ve kaydedilmiş öğün düzenleme
 *  (`NutritionSheet`, `hideQuantity` ile sadece makro kısmı) tarafından
 *  paylaşılan miktar+makro düzenleyici. Uzlaştırma kuralı: miktar/birim/
 *  çarpanla her etkileşim `basis`'i "quantity" yapar ve makroları yeniden
 *  hesaplar (kullanıcının önceki elle girdiği değerlerin üzerine yazar —
 *  miktar her zaman kazanır); bir makro alanına doğrudan yazmak `basis`'i
 *  "manual" yapar ve `sources`'ı koparır. `item`/`aliases` yalnızca AÇILIŞTA
 *  okunur (miktar modu, temel değerler) — bileşen kendi ilerleyen state'ini
 *  tutar, dışarıdan tekrar senkronize edilmez (yeni bir düzenleme oturumu
 *  için çağıran taraf bileşeni yeniden mount etmeli, örn. `key` ile). */
export function ItemEditFields({
  item,
  aliases,
  onChange,
  hideQuantity = false,
}: {
  item: EditableItem;
  aliases: Alias[];
  onChange: (next: EditableItem) => void;
  hideQuantity?: boolean;
}) {
  const [mode] = useState(() => resolveQuantityMode(item.sources, aliases));
  const [knownAlias] = useState(() => {
    const source = item.sources;
    if (mode !== "exact" || !source || source.length !== 1) return undefined;
    return aliases.find((a) => a.id === source[0].aliasId);
  });
  const [hadSourcesOriginally] = useState(() => !!item.sources && item.sources.length > 0);
  const [baseNutrition] = useState(() => item.nutrition);
  const [baseSources] = useState(() => item.sources);

  const [qty, setQty] = useState(() =>
    mode === "exact" && item.sources ? String(item.sources[0].qty) : "1",
  );
  const [unitName, setUnitName] = useState(() =>
    mode === "exact" && item.sources ? item.sources[0].unit : GRAM_UNIT.name,
  );
  const [multiplier, setMultiplier] = useState(1);

  const [basis, setBasis] = useState<Basis>("quantity");
  const [draft, setDraft] = useState<NutritionDraft>(() => toDraft(item.nutrition));

  const availableUnits = useMemo(() => unitOptions(knownAlias?.units), [knownAlias]);

  function commitExactQuantity(nextQty: string, nextUnitName: string) {
    setBasis("quantity");
    setQty(nextQty);
    setUnitName(nextUnitName);
    if (!knownAlias) return;
    const unit = availableUnits.find((u) => u.name === nextUnitName) ?? GRAM_UNIT;
    const grams = toGrams(parseNum(nextQty), unit);
    const nextNutrition = scaleNutrition(knownAlias.nutrition, knownAlias.serving_g, grams);
    setDraft(toDraft(nextNutrition));
    onChange({
      name: item.name,
      nutrition: nextNutrition,
      sources: [{ aliasId: knownAlias.id, qty: parseNum(nextQty), unit: nextUnitName }],
    });
  }

  function commitMultiplier(next: number) {
    setBasis("quantity");
    setMultiplier(next);
    const nextNutrition = scaleNutritionByFactor(baseNutrition, next);
    const nextSources = scaleMealSources(baseSources, next);
    setDraft(toDraft(nextNutrition));
    onChange({ name: item.name, nutrition: nextNutrition, sources: nextSources });
  }

  function handleStep(delta: number) {
    commitMultiplier(Math.max(0.25, Number((multiplier + delta).toFixed(2))));
  }

  function handleMacroChange(nextDraft: NutritionDraft) {
    setDraft(nextDraft);
    setBasis("manual");
    onChange({ name: item.name, nutrition: fromDraft(nextDraft), sources: undefined });
  }

  return (
    <div className="flex flex-col gap-3">
      {!hideQuantity &&
        (mode === "exact" ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NumField label="Miktar" value={qty} onChange={(v) => commitExactQuantity(v, unitName)} />
            </div>
            <div className="w-28 flex-none">
              <label className="block">
                <Label>Birim</Label>
                <select
                  className={fieldCls}
                  value={unitName}
                  onChange={(e) => commitExactQuantity(qty, e.target.value)}
                >
                  {availableUnits.map((u) => (
                    <option key={u.name} value={u.name} className="bg-elevated-2">
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-chip border border-line bg-white/[0.04] px-4 py-2.5">
            <span className={sectionLabelCls}>Porsiyon Çarpanı</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => handleStep(-0.25)}
                className="flex h-6 w-6 items-center justify-center text-lg font-bold text-ink-secondary transition hover:text-ink-primary active:scale-90"
              >
                —
              </button>
              <span className="min-w-[28px] text-center text-base font-extrabold tabular-nums text-ink-primary">
                {multiplier}
              </span>
              <button
                type="button"
                onClick={() => handleStep(0.25)}
                className="flex h-6 w-6 items-center justify-center text-lg font-bold text-ink-secondary transition hover:text-ink-primary active:scale-90"
              >
                +
              </button>
            </div>
          </div>
        ))}

      <NutritionFields draft={draft} onChange={handleMacroChange} />

      {basis === "manual" && hadSourcesOriginally && (
        <p className="text-[11px] text-warn">Bu kalemin hafıza bağlantısı elle düzenlemeyle kaldırılacak.</p>
      )}
    </div>
  );
}
