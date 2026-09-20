// ============================================================================
// Nutrimind — Etiket/Yemek tarama onay ekranı (UX planı, bölüm D).
//
// `ScanSheet`'in barkod onay ekranıyla AYNI desen: tara → onayla → hem
// hafızaya yaz hem (istenirse) bugüne işle. Farkı: barkod OFF'tan gram
// tabanlı bir ürün getirirken, Gemini yalnızca ad+makro döner (`AIParseItem`'de
// gram/porsiyon alanı YOK) — bu yüzden "hafızaya kaydet" seçilirse alias
// `serving_g:100` + `units:[{name:"porsiyon",grams:100}]` SENTETİK birimiyle
// yazılır (`RecipeBuilder.tsx`'in zaten kullandığı "porsiyon" biriminin aynısı).
//
// "Kaydet" HER ZAMAN direkt güne yazar — `MealForm`'un sepetine hiç uğramaz
// (kullanıcıyla netleşen karar, bkz. plan). Etiket (tek kalem) barkodla
// birebir aynı 3 aksiyonu kullanır; Yemek (çoklu kalem) tek bir "Öğüne ekle"
// aksiyonuyla dahil edilen tüm satırları `addNutrition` ile birleştirir,
// `sources` YOK — v1'de kalem-bazlı hafıza kaydı yok (kullanıcı onayladı).
//
// Bu ekran `ScanSheet`'in KENDİ `<Modal>`'ının içinde, üçüncü bir dal olarak
// mount edilir — yeni bir `pushState`/history girişi YOK, `Modal.tsx` zaten
// sepetin tek history girişini tutuyor. Bu yüzden footer'ı Modal'ın `footer`
// slotu yerine kendi içinde (sticky) taşıyor — state (satırlar, çarpanlar)
// burada yaşıyor, yukarı taşımak gereksiz prop drilling olurdu.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import {
  ErrorText,
  Label,
  NutrientSummaryLine,
  NutritionFields,
  TextField,
  fieldCls,
  fromDraft,
  sectionLabelCls,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { fetchData } from "../lib/api";
import { mealsOf, toPayload } from "../lib/days";
import { MACROS } from "../lib/nutrients";
import { parseNum, scaleNutritionByFactor } from "../lib/nutrition";
import { useTranslation } from "react-i18next";
import {
  combineVisionItems,
  multiplierFromGrams,
  multiplierToGramsText,
  stepVisionMultiplier,
  visionAliasUnitNutrition,
} from "../lib/visionReview";
import { todayISO } from "../lib/format";
import i18n from "../i18n/i18n";
import type { AIParseItem, MealPayload, MealSource, Nutrition, VisionMode } from "../types";

type Saving = "today" | "memory" | "dayOnly" | "add" | null;

interface Row {
  id: string;
  name: string;
  /** AI'ın döndürdüğü, HİÇ değişmeyen taban — porsiyon çarpanı her zaman
   *  BUNDAN yeniden hesaplanır (elle düzenlemeyi ezer — `NutritionSheet`'in
   *  stepper'ıyla aynı davranış: taban sabit, taslak stepper'a göre yenilenir). */
  base: Nutrition;
  multiplier: number;
  draft: NutritionDraft;
  needsReview: boolean;
}

function rowsFromItems(items: AIParseItem[]): Row[] {
  return items.map((it, idx) => ({
    id: `vis-${idx}`,
    name: it.name,
    base: it.nutrition,
    multiplier: 1,
    draft: toDraft(it.nutrition),
    needsReview: it.needsReview === true,
  }));
}

/** Ad + porsiyon stepper + makro alanları — Etiket'te tek satır (kaldırma
 *  YOK), Yemek'te her tespit edilen kalem için bir tane (kaldırma VAR). */
function VisionReviewRow({
  name,
  onNameChange,
  draft,
  onDraftChange,
  multiplier,
  onStep,
  onSetMultiplier,
  needsReview,
  onRemove,
}: {
  name: string;
  onNameChange: (v: string) => void;
  draft: NutritionDraft;
  onDraftChange: (d: NutritionDraft) => void;
  multiplier: number;
  onStep: (delta: number) => void;
  onSetMultiplier: (m: number) => void;
  needsReview: boolean;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const [gramsText, setGramsText] = useState(() => multiplierToGramsText(multiplier));
  const gramsInputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);

  // Dışarıdan multiplier değişince (stepper) gramaj text'ini güncelle.
  // Ama input focus'taysa ATLA — kullanıcı tam yazma ortasındayken
  // multiplier'dan gelen güncelleme text'i ezip bozmasın.
  useEffect(() => {
    if (!focusedRef.current) {
      setGramsText(multiplierToGramsText(multiplier));
    }
  }, [multiplier]);

  function handleGramsChange(raw: string) {
    // Yalnızca local text'i güncelle — yazarken multiplier'a dokunma.
    // Multiplier'a blur'da commit ediyoruz, böylece ara değerler (örn. "1"
    // → parseNum=1 → 0.01→0.25) text'i ezemiyor.
    setGramsText(raw);
  }

  function handleGramsFocus() {
    focusedRef.current = true;
    gramsInputRef.current?.select();
  }

  function handleGramsBlur() {
    focusedRef.current = false;
    const g = parseNum(gramsText);
    if (g >= 1) {
      const m = multiplierFromGrams(g);
      onSetMultiplier(m);
      setGramsText(multiplierToGramsText(m));
    } else {
      // Geçersiz/boş giriş — eski multiplier'dan gramajı geri yükle
      setGramsText(multiplierToGramsText(multiplier));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-chip border border-line bg-white/[0.03] p-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <TextField label={t("vision.nameLabel")} value={name} onChange={onNameChange} />
        </div>
        {needsReview && (
          <span
            title={t("vision.unsureTitle")}
            className="mt-6 h-2 w-2 flex-none rounded-full bg-amber-400"
          />
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("vision.removeItem")}
            className="mt-5 flex-none rounded-pill border border-line px-2.5 py-2 text-xs font-semibold text-ink-tertiary transition hover:border-danger/60 hover:text-danger"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className={sectionLabelCls}>{t("vision.portionLabel")}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-chip border border-line bg-white/[0.04] px-2 py-1.5">
            <button
              type="button"
              onClick={() => onStep(-0.25)}
              className="flex h-6 w-6 items-center justify-center text-lg font-bold text-ink-secondary transition active:scale-90 hover:text-ink-primary"
            >
              —
            </button>
            <span className="min-w-[28px] text-center font-mono text-sm font-extrabold tabular-nums text-ink-primary">
              {multiplier}
            </span>
            <button
              type="button"
              onClick={() => onStep(0.25)}
              className="flex h-6 w-6 items-center justify-center text-lg font-bold text-ink-secondary transition active:scale-90 hover:text-ink-primary"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-1.5 rounded-chip border border-line bg-white/[0.04] px-2.5 py-1.5">
            <input
              ref={gramsInputRef}
              inputMode="decimal"
              value={gramsText}
              onFocus={handleGramsFocus}
              onClick={handleGramsFocus}
              onBlur={handleGramsBlur}
              onChange={(e) => handleGramsChange(e.target.value)}
              className="w-14 bg-transparent text-center font-mono text-sm font-extrabold tabular-nums text-ink-primary outline-none placeholder:text-ink-faint"
            />
            <span className="text-xs font-semibold text-ink-tertiary">g</span>
          </div>
        </div>
      </div>

      <NutritionFields draft={draft} onChange={onDraftChange} />
    </div>
  );
}

export function VisionReviewScreen({
  mode,
  items,
  onBack,
  onClose,
  onSavingChange,
}: {
  mode: VisionMode;
  items: AIParseItem[];
  /** Tarama ekranına geri döner, sonuçları atar (barkodun `backToScan`'ıyla aynı fikir). */
  onBack: () => void;
  /** ScanSheet'i BÜTÜNÜYLE kapatır — başarılı kayıttan sonra da "Vazgeç"te de kullanılır. */
  onClose: () => void;
  /** ScanSheet'in üst Modal'ı kapanışı bir yazma sürerken engelleyebilsin diye. */
  onSavingChange?: (saving: boolean) => void;
}) {
  const { t } = useTranslation();
  const { upsertAlias, setDayMeals } = useData();
  const [rows, setRows] = useState<Row[]>(() => rowsFromItems(items));
  const [triggers, setTriggers] = useState("");
  const [saving, setSaving] = useState<Saving>(null);
  const [err, setErr] = useState<string | null>(null);

  function setSavingState(v: Saving) {
    setSaving(v);
    onSavingChange?.(v !== null);
  }

  function stepRow(id: string, delta: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const multiplier = stepVisionMultiplier(r.multiplier, delta);
        return { ...r, multiplier, draft: toDraft(scaleNutritionByFactor(r.base, multiplier)) };
      }),
    );
  }

  function setRowMultiplier(id: string, multiplier: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, multiplier, draft: toDraft(scaleNutritionByFactor(r.base, multiplier)) };
      }),
    );
  }

  function setRowDraft(id: string, draft: NutritionDraft) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, draft } : r)));
  }

  function setRowName(id: string, name: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const triggerList = [
    ...new Set(
      triggers
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  // ===== Etiket (tek kalem) — barkod onay ekranıyla birebir aynı 3 aksiyon =====
  const row = rows[0];
  const finalNutrition = row ? fromDraft(row.draft) : null;
  const finalName = row?.name.trim() || t("scan.scannedFood");
  const canSaveAlias = triggerList.length > 0;
  const canLogWithMemory = canSaveAlias && finalNutrition !== null;
  const canLogOnly = finalNutrition !== null;

  function labelAliasPayload() {
    if (!row || !finalNutrition) return null;
    return {
      triggers: triggerList,
      name: finalName,
      brand: null,
      serving_g: 100,
      nutrition: visionAliasUnitNutrition(finalNutrition, row.multiplier),
      units: [{ name: "porsiyon", grams: 100 }],
      defaultUnit: "porsiyon",
    };
  }

  async function saveOnly() {
    const payload = labelAliasPayload();
    if (!payload || !canSaveAlias || saving) return;
    setSavingState("memory");
    setErr(null);
    try {
      await upsertAlias(payload);
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSavingState(null);
    }
  }

  /** Yalnızca bugüne ekler — hafızaya HİÇBİR ŞEY yazmaz, `sources` YOK
   *  (bkz. ScanSheet'in `logOnly`'sindeki aynı gerekçe). */
  async function logOnly() {
    if (!row || !finalNutrition || saving) return;
    setSavingState("dayOnly");
    setErr(null);
    try {
      const date = todayISO();
      const fresh = await fetchData();
      const existing = toPayload(mealsOf(fresh.days, date));
      const entry: MealPayload = { name: finalName, nutrition: finalNutrition };
      await setDayMeals(date, [...existing, entry]);
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSavingState(null);
    }
  }

  async function saveAndLog() {
    const payload = labelAliasPayload();
    if (!payload || !canLogWithMemory || !finalNutrition || !row || saving) return;
    setSavingState("today");
    setErr(null);

    let aliasId: string;
    try {
      aliasId = await upsertAlias(payload);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSavingState(null);
      return;
    }

    try {
      const date = todayISO();
      const fresh = await fetchData();
      const existing = toPayload(mealsOf(fresh.days, date));
      const source: MealSource = { aliasId, qty: row.multiplier, unit: "porsiyon" };
      const entry: MealPayload = {
        name: finalName,
        nutrition: finalNutrition,
        sources: [source],
      };
      await setDayMeals(date, [...existing, entry]);
      onClose();
    } catch (e) {
      setErr(t("scan.savedButNotAdded", { error: String((e as Error)?.message ?? e) }));
    } finally {
      setSavingState(null);
    }
  }

  // ===== Yemek (çoklu kalem) — tek "Öğüne ekle" aksiyonu =====
  const includedNutritions = rows.map((r) => fromDraft(r.draft));
  const combinedNutrition = combineVisionItems(includedNutritions);
  const combinedName = rows
    .map((r) => r.name.trim())
    .filter(Boolean)
    .join(" + ");
  const canAddMeal = rows.length > 0;

  /** `sources` bilerek YOK: kalemler birleşip tek bir kalem olduğu için tek bir
   *  alias'a işaret edemez; v1'de kalem-bazlı hafıza kaydı da yok. */
  async function addCombinedMeal() {
    if (!canAddMeal || saving) return;
    setSavingState("add");
    setErr(null);
    try {
      const date = todayISO();
      const fresh = await fetchData();
      const existing = toPayload(mealsOf(fresh.days, date));
      // Insan tarafından görülebilen son çare ad — kaydedilen VERİ olduğu için
      // aktif dilde üretilir ve kullanıcı düzenleyebilir.
      const entry: MealPayload = {
        name: combinedName || i18n.t("vision.untitledMeal"),
        nutrition: combinedNutrition,
      };
      await setDayMeals(date, [...existing, entry]);
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSavingState(null);
    }
  }

  const footerCls =
    "sticky bottom-0 left-0 right-0 -mx-4 -mb-4 mt-2 border-t border-line-faint bg-bar px-4 py-3 pad-safe-b-sm sm:-mx-5 sm:-mb-5 sm:px-5 sm:py-3.5";

  if (mode === "food_label") {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={!!saving}
          className="self-start text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
        >
          {t("scan.retake")}
        </button>

        {row && (
          <VisionReviewRow
            name={row.name}
            onNameChange={(v) => setRowName(row.id, v)}
            draft={row.draft}
            onDraftChange={(d) => setRowDraft(row.id, d)}
            multiplier={row.multiplier}
            onStep={(delta) => stepRow(row.id, delta)}
            onSetMultiplier={(m) => setRowMultiplier(row.id, m)}
            needsReview={row.needsReview}
          />
        )}

        <label className="block">
          <Label>{t("scan.triggersLabel")}</Label>
          <input
            className={fieldCls}
            value={triggers}
            placeholder={t("vision.triggersPlaceholder")}
            onChange={(e) => setTriggers(e.target.value)}
          />
        </label>
        {triggerList.length > 0 ? (
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
        ) : (
          <p className="text-[11px] text-ink-tertiary">
            {t("scan.memoryHint", { memory: t("scan.memoryWord") })}
          </p>
        )}

        {err && <ErrorText>{err}</ErrorText>}

        <div className={footerCls}>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={saveAndLog}
              disabled={!canLogWithMemory || !!saving}
              className="w-full rounded-pill bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
            >
              {saving === "today" ? "…" : t("scan.saveToDayAndMemory")}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={logOnly}
                disabled={!canLogOnly || !!saving}
                className="rounded-pill border border-line bg-white/[0.04] px-4 py-2 text-sm font-bold text-ink-primary transition hover:bg-white/[0.08] disabled:opacity-40"
              >
                {saving === "dayOnly" ? "…" : t("scan.saveToDayOnly")}
              </button>
              <button
                type="button"
                onClick={saveOnly}
                disabled={!canSaveAlias || !!saving}
                className="rounded-pill border border-memory bg-memory/10 px-4 py-2 text-sm font-bold text-memory transition hover:bg-memory hover:text-memory-ink disabled:opacity-40"
              >
                {saving === "memory" ? "…" : t("scan.saveToMemoryOnly")}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!!saving}
              className="self-center text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Yemek (food_photo) =====
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={!!saving}
        className="self-start text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
      >
        {t("scan.retake")}
      </button>

      {rows.length === 0 ? (
        <p className="rounded-chip border border-line bg-white/[0.03] p-3 text-[11px] text-ink-tertiary">
          {t("scan.allItemsRemoved")}
        </p>
      ) : (
        rows.map((r) => (
          <VisionReviewRow
            key={r.id}
            name={r.name}
            onNameChange={(v) => setRowName(r.id, v)}
            draft={r.draft}
            onDraftChange={(d) => setRowDraft(r.id, d)}
            multiplier={r.multiplier}
            onStep={(delta) => stepRow(r.id, delta)}
            onSetMultiplier={(m) => setRowMultiplier(r.id, m)}
            needsReview={r.needsReview}
            onRemove={() => removeRow(r.id)}
          />
        ))
      )}

      {rows.length > 0 && (
        <NutrientSummaryLine
          nutrition={combinedNutrition}
          defs={MACROS}
          kcal="total"
          className="rounded-chip border border-line bg-white/[0.03] p-3 text-[11px] text-ink-secondary"
        />
      )}

      {err && <ErrorText>{err}</ErrorText>}

      <div className={footerCls}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={addCombinedMeal}
            disabled={!canAddMeal || !!saving}
            className="w-full rounded-pill bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
          >
            {saving === "add" ? "…" : t("vision.addToMeal")}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={!!saving}
            className="self-center text-[11px] font-semibold text-ink-tertiary underline transition hover:text-ink-primary disabled:opacity-40"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
