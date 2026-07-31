import { useState } from "react";
import { Modal } from "./Modal";
import {
  EMPTY_DRAFT,
  ErrorText,
  FormActions,
  Label,
  NumField,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { OffSearch } from "./OffSearch";
import { useData } from "../lib/data";
import { parseNum } from "../lib/nutrition";
import { OFF_SERVING_G } from "../lib/off";
import type { OffFood } from "../lib/off";
import type { Alias, AliasUnit } from "../types";

interface UnitDraft {
  id: string;
  name: string;
  grams: string;
}

/** Alias (besin hafızası) ekleme/düzenleme. initial null ise yeni kayıt. */
export function AliasForm({ initial, onClose }: { initial: Alias | null; onClose: () => void }) {
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
  // Elle girilebilir barkod alanı. OFF'tan seçilende dolar, elle de girilebilir.
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [offId, setOffId] = useState(initial?.off_id ?? "");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ayrıntılar bölümünde dolu veri var mı?
  const hasDetailsData = Boolean(
    brand.trim() ||
      barcode.trim() ||
      unitDrafts.some((u) => u.name.trim() || u.grams.trim())
  );

  // Yinelenen ifadeyi ele: aynı tetikleyici iki kez kaydedilmesin.
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

  function requestClose() {
    if (saving) return;
    onClose();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);

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
        name: name.trim(),
        brand: brand.trim() || null,
        serving_g: parseNum(servingG),
        nutrition: fromDraft(draft),
        units: validUnits,
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        ...(offId.trim() ? { off_id: offId.trim() } : {}),
      });
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Besini düzenle" : "Yeni besin"} onClose={requestClose}>
      <div className="flex flex-col gap-3">
        {/* Open Food Facts arama girişi */}
        <div>
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-expanded={searchOpen}
            className="w-full rounded-chip border border-line bg-white/[0.03] px-3 py-2 text-left text-xs font-semibold text-ink-secondary transition hover:text-ink-primary"
          >
            {searchOpen ? "− " : "+ "}
            Open Food Facts'ten getir (arama veya barkod)
          </button>
          {searchOpen && (
            <div className="mt-2">
              <OffSearch onPick={applyOffFood} />
            </div>
          )}
        </div>

        {/* İfadeler */}
        <label className="block">
          <Label>İfadeler (virgülle ayır)</Label>
          <input
            className={fieldCls}
            value={triggers}
            placeholder="yoğurt, aynı yoğurt, süzme yoğurt"
            onChange={(e) => setTriggers(e.target.value)}
          />
        </label>

        {triggerList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {triggerList.map((t) => (
              <span key={t} className="rounded-pill bg-memory/15 px-2.5 py-1 text-[11px] font-semibold text-memory">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Besin adı & Porsiyon */}
        <TextField label="Besin adı" value={name} onChange={setName} placeholder="örn. Süzme yoğurt %0" />
        <NumField label="Porsiyon" suffix="g" value={servingG} onChange={setServingG} />

        {/* Ayrıntılar (Marka, Barkod, Özel Birimler) */}
        <div className="rounded-chip border border-line bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
                Ayrıntılar (Marka, Birimler, Barkod)
              </span>
              {hasDetailsData && (
                <span className="rounded-pill bg-memory/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-memory">
                  dolu
                </span>
              )}
            </span>
            <span className="font-mono text-xs text-ink-tertiary">{detailsOpen ? "−" : "+"}</span>
          </button>
          {detailsOpen && (
            <div className="flex flex-col gap-3 border-t border-line p-3">
              <TextField label="Marka (opsiyonel)" value={brand} onChange={setBrand} placeholder="örn. Auchan" />
              <TextField label="Barkod (opsiyonel)" value={barcode} onChange={setBarcode} placeholder="örn. 8690000000000" />

              {/* Özel Birimler */}
              <div className="flex flex-col gap-2 rounded-chip border border-line/40 bg-white/[0.02] p-3">
                <span className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
                  Özel Birimler (opsiyonel)
                </span>
                {unitDrafts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {unitDrafts.map((u) => (
                      <div key={u.id} className="flex items-end gap-2">
                        <div className="flex-1">
                          <TextField
                            label="Birim adı"
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
                          className="mb-1 rounded-chip border border-line p-2 text-xs text-ink-tertiary transition hover:border-danger/40 hover:text-danger"
                          title="Birimi sil"
                        >
                          ✕
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
                  className="w-full rounded-chip border border-line bg-white/[0.03] py-1.5 text-center text-xs font-semibold text-ink-secondary transition hover:text-ink-primary"
                >
                  + Birim ekle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 5 makro + mikro alanları */}
        <div>
          <p className="mb-2 text-[11px] text-ink-tertiary">
            Aşağıdaki makrolar <strong className="text-ink-secondary">{parseNum(servingG) || 0} g</strong> için
            geçerlidir; öğün eklerken miktara göre otomatik ölçeklenir.
          </p>
          <NutritionFields draft={draft} onChange={setDraft} />
        </div>
      </div>

      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={requestClose} onSave={save} saving={saving} disabled={!canSave} />
    </Modal>
  );
}
