import { useState } from "react";
import { Modal } from "./Modal";
import { ErrorText, FormActions, NutritionFields, fromDraft, toDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { parseNum } from "../lib/nutrition";

/** Günlük kalori/makro hedeflerini düzenler. */
export function GoalsForm({ onClose }: { onClose: () => void }) {
  const { goals, updateGoals } = useData();
  const [draft, setDraft] = useState<NutritionDraft>(toDraft(goals));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Kalori halkası hedefe bölerek yüzde hesaplar: kcal <= 0 sıfıra bölme /
  // sonsuz "aşım" gösterir. Diğer makrolar negatif olmamalı (bar genişliği
  // negatife düşmesin) ama 0 geçerli (ör. kullanıcı lif hedefi takip etmiyor).
  const kcal = parseNum(draft.kcal);
  const macrosNonNegative = [draft.protein, draft.carbs, draft.fat, draft.fiber].every((v) => parseNum(v) >= 0);
  const canSave = kcal > 0 && macrosNonNegative;

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
      await updateGoals(fromDraft(draft));
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  return (
    <Modal title="Günlük hedefler" onClose={requestClose}>
      <p className="mb-3 text-[11px] text-ink-tertiary">
        Kalori halkası ve makro barları bu hedeflere göre doldurulur.
      </p>
      <NutritionFields draft={draft} onChange={setDraft} />
      {err && <ErrorText>{err}</ErrorText>}
      <FormActions onCancel={requestClose} onSave={save} saving={saving} disabled={!canSave} />
    </Modal>
  );
}
