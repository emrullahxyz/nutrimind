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
import { useData } from "../lib/data";
import { parseNum } from "../lib/nutrition";
import type { Alias } from "../types";

/** Alias (besin hafızası) ekleme/düzenleme. initial null ise yeni kayıt. */
export function AliasForm({ initial, onClose }: { initial: Alias | null; onClose: () => void }) {
  const { upsertAlias } = useData();

  const [triggers, setTriggers] = useState(initial ? initial.triggers.join(", ") : "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [servingG, setServingG] = useState(String(initial?.serving_g ?? 100));
  const [draft, setDraft] = useState<NutritionDraft>(initial ? toDraft(initial.nutrition) : EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Yinelenen ifadeyi ele: aynı tetikleyici iki kez kaydedilmesin (çip listesinde de key çakışırdı).
  const triggerList = [
    ...new Set(
      triggers
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const canSave = triggerList.length > 0 && name.trim().length > 0 && parseNum(servingG) > 0;

  /** Kayıt uçarken kapanmayı engelle: yazma sunucuya düşerken vazgeçilmiş sanılmasın. */
  function requestClose() {
    if (saving) return;
    onClose();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await upsertAlias({
        ...(initial ? { id: initial.id } : {}),
        triggers: triggerList,
        name: name.trim(),
        brand: brand.trim() || null,
        serving_g: parseNum(servingG),
        nutrition: fromDraft(draft),
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

        <TextField label="Besin adı" value={name} onChange={setName} placeholder="örn. Süzme yoğurt %0" />
        <TextField label="Marka (opsiyonel)" value={brand} onChange={setBrand} placeholder="örn. Auchan" />
        <NumField label="Porsiyon" suffix="g" value={servingG} onChange={setServingG} />

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
