import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Sparkles, Check, Plus, Trash2, Tag, Scale, Package } from "lucide-react";
import {
  EMPTY_DRAFT,
  ErrorText,
  Label,
  NumField,
  NutritionFields,
  TextField,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { OffSearch } from "./OffSearch";
import { useData } from "../lib/data";
import { parseNum } from "../lib/nutrition";
import { OFF_SERVING_G } from "../lib/off";
import type { OffFood } from "../lib/off";
import type { Alias, AliasUnit, Nutrition } from "../types";

interface UnitDraft {
  id: string;
  name: string;
  grams: string;
}

/** Alias (besin hafızası) ekleme/düzenleme full-screen modal */
export function AliasForm({ initial, onClose }: { initial: Alias | null; onClose: () => void }) {
  const isPoppedRef = useRef(false);

  useEffect(() => {
    isPoppedRef.current = false;
    window.history.pushState({ isModal: true, modalType: "alias_form" }, "");

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

  const { upsertAlias } = useData();

  const [triggers, setTriggers] = useState(initial ? initial.triggers.join(", ") : "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [servingG, setServingG] = useState(String(initial?.serving_g ?? 100));
  const [draft, setDraft] = useState<NutritionDraft>(initial ? toDraft(initial.nutrition) : EMPTY_DRAFT);
  const [unitDrafts, setUnitDrafts] = useState<UnitDraft[]>(() =>
    (initial?.units ?? []).map((u, i) => ({
      id: `unit-${i}-${Date.now()}`,
      name: u.name,
      grams: String(u.grams),
    }))
  );
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [offId, setOffId] = useState(initial?.off_id ?? "");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasDetailsData = Boolean(
    brand.trim() ||
      barcode.trim() ||
      unitDrafts.some((u) => u.name.trim() || u.grams.trim())
  );

  const triggerList = [
    ...new Set(
      triggers
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  const canSave = triggerList.length > 0 && name.trim().length > 0 && parseNum(servingG) > 0;

  function applyOffFood(food: OffFood) {
    setName(food.name);
    setBrand(food.brand ?? "");
    setServingG(String(OFF_SERVING_G));
    setDraft(toDraft(food.nutrition));
    setBarcode(food.code);
    setOffId(food.code);
    setSearchOpen(false);
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);

    const rawNut = fromDraft(draft);
    const cleanNutrition: Nutrition = {
      kcal: Math.max(0, Math.round(rawNut.kcal || 0)),
      protein: Math.max(0, Number((rawNut.protein || 0).toFixed(1))),
      carbs: Math.max(0, Number((rawNut.carbs || 0).toFixed(1))),
      fat: Math.max(0, Number((rawNut.fat || 0).toFixed(1))),
      fiber: Math.max(0, Number((rawNut.fiber || 0).toFixed(1))),
      sugar: rawNut.sugar !== undefined ? Math.max(0, Number((rawNut.sugar || 0).toFixed(1))) : undefined,
      satFat: rawNut.satFat !== undefined ? Math.max(0, Number((rawNut.satFat || 0).toFixed(1))) : undefined,
      sodium: rawNut.sodium !== undefined ? Math.max(0, Math.round(rawNut.sodium || 0)) : undefined,
    };

    const validUnits: AliasUnit[] = [];
    const seenNames = new Set<string>(["g"]);
    for (const u of unitDrafts) {
      const trimmedName = u.name.trim();
      const parsedGrams = parseNum(u.grams);
      if (trimmedName.length > 0 && parsedGrams > 0) {
        const key = trimmedName.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          validUnits.push({ name: trimmedName, grams: parsedGrams });
        }
      }
    }

    try {
      await upsertAlias({
        ...(initial ? { id: initial.id } : {}),
        triggers: triggerList,
        name: name.trim().slice(0, 100),
        brand: brand.trim().slice(0, 100) || null,
        serving_g: Math.max(1, parseNum(servingG)),
        nutrition: cleanNutrition,
        units: validUnits,
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        ...(offId.trim() ? { off_id: offId.trim() } : {}),
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
          {initial ? "Besini Düzenle" : "Yeni Besin Ekle"}
        </h2>

        <div className="w-10 h-10" />
      </div>

      {/* Main Form Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* OFF Search Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white">
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-expanded={searchOpen}
            className="w-full flex items-center justify-between text-xs font-bold text-amber-300 hover:text-amber-200 transition"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Open Food Facts'ten besin getir (Arama veya Barkod)</span>
            </span>
            <span className="font-mono text-sm">{searchOpen ? "−" : "+"}</span>
          </button>
          {searchOpen && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <OffSearch onPick={applyOffFood} />
            </div>
          )}
        </div>

        {/* Triggers Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white/90">Tetikleyici İfadeler</span>
          </div>
          <input
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm font-semibold text-white focus:border-amber-400 focus:outline-none placeholder:text-white/30"
            value={triggers}
            placeholder="yoğurt, süzme yoğurt, aynı yoğurt (virgülle ayır)"
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
          <p className="text-[11px] text-white/50">
            Kullanıcı sohbet veya aramada bu kelimeleri yazdığında bu besin ve makrosu eşleşir.
          </p>
        </div>

        {/* Name & Serving Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-4">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-bold text-white/90">Temel Bilgiler</span>
          </div>
          <TextField label="Besin Adı" value={name} onChange={setName} placeholder="örn. Süzme Yoğurt %0" />
          <NumField label="Porsiyon Miktarı" suffix="g" value={servingG} onChange={setServingG} />
        </div>

        {/* Details Card (Marka, Barkod, Özel Birimler) */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-3">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between text-xs font-bold text-white/80 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-purple-400" />
              <span>Ayrıntılar (Marka, Barkod & Özel Birimler)</span>
              {hasDetailsData && (
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono">
                  Dolu
                </span>
              )}
            </span>
            <span className="font-mono text-sm">{detailsOpen ? "−" : "+"}</span>
          </button>

          {detailsOpen && (
            <div className="space-y-4 pt-3 border-t border-white/10">
              <TextField label="Marka (opsiyonel)" value={brand} onChange={setBrand} placeholder="örn. Sütaş" />
              <TextField label="Barkod (opsiyonel)" value={barcode} onChange={setBarcode} placeholder="örn. 8690000000000" />

              {/* Custom Units */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold text-white/80 block">Özel Birimler (opsiyonel)</span>
                {unitDrafts.length > 0 && (
                  <div className="space-y-2">
                    {unitDrafts.map((u) => (
                      <div key={u.id} className="flex items-end gap-2 bg-black/40 p-3 rounded-xl border border-white/10">
                        <div className="flex-1">
                          <TextField
                            label="Birim Adı"
                            value={u.name}
                            placeholder="örn. adet, kase, dilim"
                            onChange={(val) =>
                              setUnitDrafts((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, name: val } : x))
                              )
                            }
                          />
                        </div>
                        <div className="w-28">
                          <NumField
                            label="Miktar"
                            suffix="g"
                            value={u.grams}
                            onChange={(val) =>
                              setUnitDrafts((prev) =>
                                prev.map((x) => (x.id === u.id ? { ...x, grams: val } : x))
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setUnitDrafts((prev) => prev.filter((x) => x.id !== u.id))}
                          className="p-2.5 rounded-xl bg-white/10 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition mb-0.5"
                          title="Birimi sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setUnitDrafts((prev) => [
                      ...prev,
                      { id: `unit-${Date.now()}-${Math.random()}`, name: "", grams: "" },
                    ])
                  }
                  className="w-full py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-purple-400" /> Birim Ekle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nutrition Values Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white space-y-3">
          <p className="text-xs text-white/70 font-medium">
            Aşağıdaki makro değerler <strong className="text-amber-400">{parseNum(servingG) || 0} g</strong> porsiyon içindir.
          </p>
          <NutritionFields draft={draft} onChange={setDraft} />
        </div>

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
          <Check className="w-5 h-5" /> {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
