import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Check, Plus, Trash2, Tag, Utensils, Scale, Sparkles } from "lucide-react";
import {
  EMPTY_DRAFT,
  ErrorText,
  Label,
  NumField,
  NutrientSummaryLine,
  NutritionFields,
  TextField,
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

/** Tarif oluşturma & düzenleme full-screen modal */
export function RecipeBuilder({
  initial,
  onClose,
}: {
  initial: Alias | null;
  onClose: () => void;
}) {
  const isPoppedRef = useRef(false);

  useEffect(() => {
    isPoppedRef.current = false;
    window.history.pushState({ isModal: true, modalType: "recipe_builder" }, "");

    const handlePopState = () => {
      isPoppedRef.current = true;
      onClose();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!isPoppedRef.current && window.history.state?.isModal) {
        window.history.back();
      }
    };
  }, [onClose]);

  const handleUserClose = () => {
    if (!isPoppedRef.current && window.history.state?.isModal) {
      window.history.back();
    } else {
      onClose();
    }
  };

  const { aliases, upsertAlias } = useData();

  const [triggers, setTriggers] = useState(initial ? initial.triggers.join(", ") : "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [totalG, setTotalG] = useState(String(initial?.recipe?.totalG ?? ""));

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

  const triggerList = [
    ...new Set(
      triggers
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

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

  async function save() {
    if (!canSave || saving) return;
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
      handleUserClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <div
      data-modal="true"
      className="fixed inset-0 z-[9999] flex flex-col bg-[#13121b] text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 border-b border-white/10 flex-none bg-[#13121b]">
        <button
          type="button"
          onClick={handleUserClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
          aria-label="Geri"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-extrabold text-white tracking-wide">
          {initial ? "Tarifi Düzenle" : "Yeni Tarif Oluştur"}
        </h2>

        <div className="w-10 h-10" />
      </div>

      {/* Main Form Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Triggers Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white/90">Tetikleyici İfadeler</span>
          </div>
          <input
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm font-semibold text-white focus:border-amber-400 focus:outline-none placeholder:text-white/30"
            value={triggers}
            placeholder="mercimek çorbası, ev çorbası (virgülle ayır)"
            onChange={(e) => setTriggers(e.target.value)}
          />

          {triggerList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {triggerList.map((t) => (
                <span
                  key={t}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Basic Info */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-3">
          <TextField label="Tarif / Yemek Adı" value={name} onChange={setName} placeholder="örn. Ev Yapımı Mercimek Çorbası" />
          <TextField label="Marka / Açıklama (opsiyonel)" value={brand} onChange={setBrand} placeholder="örn. Ev yapımı" />
        </div>

        {/* Ingredients Section Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Utensils className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-white/90">Malzemeler ({parsedIngredients.length})</span>
            </div>
          </div>

          {ingredients.map((ing, index) => {
            const alias = aliases.find((a) => a.id === ing.aliasId);
            const units = unitOptions(alias?.units);

            return (
              <div key={ing.id} className="p-3.5 rounded-2xl border border-white/10 bg-black/40 space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-extrabold text-amber-300 font-mono">
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
                        className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white transition"
                      >
                        {ing.mode === "alias" ? "Elle gir" : "Hafızadan seç"}
                      </button>
                    )}
                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(ing.id)}
                        className="p-1 rounded-full text-white/40 hover:text-red-400 transition"
                        title="Malzemeyi sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {ing.mode === "alias" ? (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-white/70 block mb-1">Hafızadaki Besin</span>
                      <select
                        className="w-full px-3 py-2.5 rounded-xl bg-[#191825] border border-white/15 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
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
                          <option key={a.id} value={a.id} className="bg-[#191825] text-white">
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
                        <span className="text-xs font-semibold text-white/70 block mb-1">Birim</span>
                        <select
                          className="w-full px-3 py-2.5 rounded-xl bg-[#191825] border border-white/15 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                          value={ing.unit}
                          onChange={(e) => updateRow(ing.id, (prev) => ({ ...prev, unit: e.target.value }))}
                        >
                          {units.map((u) => (
                            <option key={u.name} value={u.name} className="bg-[#191825] text-white">
                              {u.name} {u.name !== "g" ? `(${u.grams}g)` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {alias && parseNum(ing.qty) > 0 && (
                      <div className="rounded-xl bg-white/[0.04] p-2.5 font-mono text-xs text-white/80">
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
                  <div className="space-y-3">
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
            className="w-full py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-purple-400" /> Malzeme Ekle
          </button>
        </div>

        {/* Total Weight & Portion Info */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white/90">Pişmiş Toplam Ağırlık & Porsiyon</span>
          </div>

          <NumField
            label="Pişmiş Toplam Ağırlık"
            suffix="g"
            value={totalG}
            onChange={setTotalG}
          />
          <NumField
            label="Porsiyon Sayısı (opsiyonel)"
            value={portionCount}
            onChange={setPortionCount}
          />
        </div>

        {/* Live Preview Card */}
        {totalGNum > 0 && parsedIngredients.length > 0 && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-white space-y-2">
            <div className="flex items-center gap-1.5 text-amber-300 font-extrabold text-xs">
              <Sparkles className="w-4 h-4 text-amber-400" /> Canlı Tarif Önizleme
            </div>
            <div className="flex flex-col gap-1 text-xs font-mono">
              <NutrientSummaryLine nutrition={totalNutrition} kcal="total" className="text-white font-bold" />
              <NutrientSummaryLine nutrition={per100g} kcal="inline" prefix="100 g · " className="text-white/60" />
            </div>
          </div>
        )}

        {err && <ErrorText>{err}</ErrorText>}
      </div>

      {/* Bottom Save Button */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-[#13121b] flex-none">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="w-full py-4 rounded-full bg-white text-black font-extrabold text-base hover:bg-white/90 transition shadow-xl active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Check className="w-5 h-5" /> {saving ? "Kaydediliyor..." : "Besin Olarak Kaydet"}
        </button>
      </div>
    </div>
  );
}
