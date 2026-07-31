import { useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
  FormActions,
  Label,
  NumField,
  NutrientSummaryLine,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { formatNumber } from "../lib/format";
import {
  calculateRecipeTotals,
  parseNum,
  scaleNutrition,
  toGrams,
  unitOptions,
} from "../lib/nutrition";
import type { Alias, AliasUnit, RecipeIngredient } from "../types";

interface IngredientDraft {
  id: string;
  mode: "alias" | "manual";
  aliasId: string;
  name: string;
  qty: string;
  unit: string;
  manualNutrition: NutritionDraft;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function RecipeBuilder({
  initial,
  onClose,
}: {
  initial: Alias | null;
  onClose: () => void;
}) {
  const { aliases, upsertAlias } = useData();

  const [triggers, setTriggers] = useState(initial ? initial.triggers.join(", ") : "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [totalG, setTotalG] = useState(String(initial?.recipe?.totalG ?? ""));

  // Porsiyon birimini tespit et
  const initialPortionUnit = initial?.units?.find((u) => u.name === "porsiyon");
  const initialPortionCount =
    initialPortionUnit && initial?.recipe?.totalG
      ? String(round1(initial.recipe.totalG / initialPortionUnit.grams))
      : "";
  const [portionCount, setPortionCount] = useState(initialPortionCount);

  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() => {
    if (initial?.recipe?.ingredients && initial.recipe.ingredients.length > 0) {
      return initial.recipe.ingredients.map((ing, i) => {
        const matchingAlias = ing.aliasId ? aliases.find((a) => a.id === ing.aliasId) : undefined;
        if (matchingAlias) {
          return {
            id: `ing-${i}-${Date.now()}`,
            mode: "alias",
            aliasId: matchingAlias.id,
            name: ing.name,
            qty: String(ing.qty),
            unit: ing.unit,
            manualNutrition: toDraft(ing.nutrition),
          };
        }
        return {
          id: `ing-${i}-${Date.now()}`,
          mode: "manual",
          aliasId: ing.aliasId ?? "",
          name: ing.name,
          qty: String(ing.qty),
          unit: ing.unit,
          manualNutrition: toDraft(ing.nutrition),
        };
      });
    }
    // Varsayılan ilk satır
    return [
      {
        id: `ing-0-${Date.now()}`,
        mode: aliases.length > 0 ? "alias" : "manual",
        aliasId: aliases[0]?.id ?? "",
        name: aliases[0]?.name ?? "",
        qty: "",
        unit: "g",
        manualNutrition: EMPTY_DRAFT,
      },
    ];
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Yinelenen ifadeleri tekilleştir
  const triggerList = [
    ...new Set(
      triggers
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  // Malzeme taslaklarını tipli RecipeIngredient yapısına çevir
  const parsedIngredients: RecipeIngredient[] = ingredients
    .map((ing) => {
      const qtyNum = parseNum(ing.qty);
      if (qtyNum <= 0) return null;

      if (ing.mode === "alias") {
        const alias = aliases.find((a) => a.id === ing.aliasId);
        if (!alias) return null;
        const availableUnits = unitOptions(alias.units);
        const unitObj = availableUnits.find((u) => u.name === ing.unit) ?? availableUnits[0];
        const grams = toGrams(qtyNum, unitObj);
        const nutrition = scaleNutrition(alias.nutrition, alias.serving_g, grams);
        return {
          aliasId: alias.id,
          name: alias.name,
          qty: qtyNum,
          unit: unitObj.name,
          nutrition,
        };
      } else {
        const trimmedName = ing.name.trim();
        if (!trimmedName) return null;
        const nutrition = fromDraft(ing.manualNutrition);
        return {
          ...(ing.aliasId ? { aliasId: ing.aliasId } : {}),
          name: trimmedName,
          qty: qtyNum,
          unit: ing.unit.trim() || "g",
          nutrition,
        };
      }
    })
    .filter((x): x is RecipeIngredient => x !== null);

  const totalGNum = parseNum(totalG);
  const portionCountNum = parseNum(portionCount);
  const canSave =
    triggerList.length > 0 &&
    name.trim().length > 0 &&
    totalGNum > 0 &&
    parsedIngredients.length > 0;

  const { totalNutrition, per100g } = calculateRecipeTotals(parsedIngredients, totalGNum);

  function updateRow(id: string, updater: (prev: IngredientDraft) => IngredientDraft) {
    setIngredients((prev) => prev.map((row) => (row.id === id ? updater(row) : row)));
  }

  function addRow() {
    setIngredients((prev) => [
      ...prev,
      {
        id: `ing-${Date.now()}-${Math.random()}`,
        mode: aliases.length > 0 ? "alias" : "manual",
        aliasId: aliases[0]?.id ?? "",
        name: aliases[0]?.name ?? "",
        qty: "",
        unit: "g",
        manualNutrition: EMPTY_DRAFT,
      },
    ]);
  }

  function removeRow(id: string) {
    setIngredients((prev) => prev.filter((row) => row.id !== id));
  }

  function requestClose() {
    if (saving) return;
    onClose();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);

    const validUnits: AliasUnit[] = [];
    if (portionCountNum > 0 && totalGNum > 0) {
      validUnits.push({
        name: "porsiyon",
        grams: round1(totalGNum / portionCountNum),
      });
    }

    try {
      await upsertAlias({
        ...(initial ? { id: initial.id } : {}),
        triggers: triggerList,
        name: name.trim(),
        brand: brand.trim() || null,
        serving_g: 100,
        nutrition: per100g,
        units: validUnits,
        recipe: {
          ingredients: parsedIngredients,
          totalG: totalGNum,
        },
      });
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Tarifi düzenle" : "Tarif oluştur"} onClose={requestClose}>
      <div className="flex flex-col gap-3">
        <label className="block">
          <Label>Tetikleyici ifadeler (virgülle ayır)</Label>
          <input
            className={fieldCls}
            value={triggers}
            placeholder="mercimek çorbası, ev yapımı çorba"
            onChange={(e) => setTriggers(e.target.value)}
          />
        </label>

        {triggerList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {triggerList.map((t) => (
              <span
                key={t}
                className="rounded-pill bg-memory/15 px-2.5 py-1 text-[11px] font-semibold text-memory"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <TextField label="Besin / Tarif adı" value={name} onChange={setName} placeholder="örn. Mercimek Çorbası" />
        <TextField label="Marka (opsiyonel)" value={brand} onChange={setBrand} placeholder="örn. Ev yapımı" />

        {/* Malzemeler Bölümü */}
        <div className="flex flex-col gap-3.5 rounded-chip border border-line bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
              Malzemeler ({parsedIngredients.length})
            </span>
          </div>

          {ingredients.map((ing, index) => {
            const alias = aliases.find((a) => a.id === ing.aliasId);
            const units = unitOptions(alias?.units);

            return (
              <div key={ing.id} className="flex flex-col gap-2 rounded-chip border border-line/60 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2 border-b border-line/40 pb-2">
                  <span className="font-mono text-[11px] font-bold text-ink-secondary">
                    Malzeme #{index + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {aliases.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          updateRow(ing.id, (prev) => ({
                            ...prev,
                            mode: prev.mode === "alias" ? "manual" : "alias",
                            ...(prev.mode === "manual" && aliases.length > 0
                              ? { aliasId: aliases[0].id, name: aliases[0].name }
                              : {}),
                          }))
                        }
                        className="rounded-pill bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-ink-tertiary transition hover:text-ink-primary"
                      >
                        {ing.mode === "alias" ? "Elle gir" : "Hafızadan seç"}
                      </button>
                    )}
                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(ing.id)}
                        className="rounded-chip p-1 text-xs text-ink-tertiary transition hover:text-danger"
                        title="Malzemeyi sil"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {ing.mode === "alias" ? (
                  <div className="flex flex-col gap-2">
                    <label className="block">
                      <Label>Hafızadaki Besin</Label>
                      <select
                        className={fieldCls}
                        value={ing.aliasId}
                        onChange={(e) => {
                          const newAliasId = e.target.value;
                          const selected = aliases.find((a) => a.id === newAliasId);
                          updateRow(ing.id, (prev) => ({
                            ...prev,
                            aliasId: newAliasId,
                            name: selected?.name ?? prev.name,
                            unit: "g",
                          }));
                        }}
                      >
                        {aliases.map((a) => (
                          <option key={a.id} value={a.id} className="bg-elevated-2 text-ink-primary">
                            {a.name} ({a.serving_g}g · {a.nutrition.kcal} kcal)
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <NumField
                        label="Miktar"
                        value={ing.qty}
                        onChange={(val) => updateRow(ing.id, (prev) => ({ ...prev, qty: val }))}
                      />
                      <label className="block">
                        <Label>Birim</Label>
                        <select
                          className={fieldCls}
                          value={ing.unit}
                          onChange={(e) => updateRow(ing.id, (prev) => ({ ...prev, unit: e.target.value }))}
                        >
                          {units.map((u) => (
                            <option key={u.name} value={u.name} className="bg-elevated-2 text-ink-primary">
                              {u.name} {u.name !== "g" ? `(${u.grams}g)` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Malzeme Makro Özeti */}
                    {alias && parseNum(ing.qty) > 0 && (
                      <div className="rounded bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-ink-tertiary">
                        {(() => {
                          const unitObj = units.find((u) => u.name === ing.unit) ?? units[0];
                          const grams = toGrams(parseNum(ing.qty), unitObj);
                          const computed = scaleNutrition(alias.nutrition, alias.serving_g, grams);
                          return (
                            <NutrientSummaryLine
                              nutrition={computed}
                              kcal="inline"
                              prefix={`${round1(grams)} g · `}
                            />
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <TextField
                      label="Malzeme Adı"
                      value={ing.name}
                      onChange={(val) => updateRow(ing.id, (prev) => ({ ...prev, name: val }))}
                      placeholder="örn. Zeytinyağı"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <NumField
                        label="Miktar"
                        value={ing.qty}
                        onChange={(val) => updateRow(ing.id, (prev) => ({ ...prev, qty: val }))}
                      />
                      <TextField
                        label="Birim"
                        value={ing.unit}
                        onChange={(val) => updateRow(ing.id, (prev) => ({ ...prev, unit: val }))}
                        placeholder="g, ml, adet..."
                      />
                    </div>
                    <div>
                      <Label>Toplam Besin Değerleri</Label>
                      <NutritionFields
                        draft={ing.manualNutrition}
                        onChange={(draft) =>
                          updateRow(ing.id, (prev) => ({ ...prev, manualNutrition: draft }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="w-full rounded-chip border border-line bg-white/[0.03] py-2 text-center text-xs font-semibold text-ink-secondary transition hover:text-ink-primary"
          >
            + Malzeme ekle
          </button>
        </div>

        {/* Pişmiş Toplam Ağırlık */}
        <div className="flex flex-col gap-1">
          <NumField
            label="Pişmiş toplam ağırlık"
            suffix="g"
            value={totalG}
            onChange={setTotalG}
          />
          <p className="text-[11px] text-ink-faint">
            Pişerken su çekilir veya buharlaşır; çiğ malzemelerin toplamı ile pişmiş yemeğin ağırlığı aynı değildir.
          </p>
        </div>

        {/* Porsiyon (opsiyonel) */}
        <div className="flex flex-col gap-1">
          <NumField
            label="Porsiyon sayısı (opsiyonel)"
            value={portionCount}
            onChange={setPortionCount}
          />
          <p className="text-[11px] text-ink-faint">
            {portionCountNum > 0 && totalGNum > 0
              ? `1 porsiyon = ${formatNumber(round1(totalGNum / portionCountNum))} g olarak özel birim eklenir.`
              : "Örn. 4 yazarsan 1 porsiyon = (toplam ağırlık / 4) g olarak otomatik birim eklenir."}
          </p>
        </div>

        {/* Canlı Önizleme Card */}
        {totalGNum > 0 && parsedIngredients.length > 0 && (
          <div className="flex flex-col gap-2 rounded-chip border border-accent/30 bg-accent/5 p-3">
            <span className="font-mono text-[11px] font-bold uppercase tracking-mono text-accent">
              Canlı Önizleme
            </span>
            <div className="flex flex-col gap-1 text-xs">
              <NutrientSummaryLine
                nutrition={totalNutrition}
                kcal="total"
                className="font-mono text-ink-primary"
              />
              <NutrientSummaryLine
                nutrition={per100g}
                kcal="inline"
                prefix="100 g · "
                className="font-mono text-ink-secondary"
              />
            </div>
          </div>
        )}
      </div>

      {err && <ErrorText>{err}</ErrorText>}
      <FormActions
        onCancel={requestClose}
        onSave={save}
        saving={saving}
        disabled={!canSave}
        saveLabel="Besin olarak kaydet"
      />
    </Modal>
  );
}
