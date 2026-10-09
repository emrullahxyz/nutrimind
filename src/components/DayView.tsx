import { useEffect, useMemo, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { StatCardCarousel } from "./StatCardCarousel";
import { DayTypeBadge } from "./DayTypeBadge";
import { MealForm } from "./MealForm";
import { TemplateShelf } from "./TemplateShelf";
import {
  ErrorText,
  ExpandableMealName,
  FormActions,
  NutrientSummaryLine,
  TextField,
} from "./FormBits";
import { Modal } from "./Modal";
import { ScanSheet } from "./ScanSheet";
import { SupplementCard } from "./SupplementCard";
import { WaterCard } from "./WaterCard";
import { WeightCard } from "./WeightCard";
import { MealRow } from "./MealRow";
import { MealActionSheet } from "./MealActionSheet";
import { TemplatePreview } from "./TemplatePreview";
import { ExerciseModal } from "./ExerciseModal";
import { NutritionSheet } from "./NutritionSheet";
import { useToast } from "./Toast";
import { formatKcal, todayISO } from "../lib/format";
import { useData } from "../lib/data";
import { afterHistoryBackSettles } from "../lib/backStack";
import { effectiveGoal } from "../lib/goals";
import { dayTotal, mealsOf, sumMeals, toPayload } from "../lib/days";
import { parseTemplatesConfig, newTemplateId, templateItemsToPayload, templateList } from "../lib/templates";
import type { MealTemplate } from "../lib/templates";
import { draftLinesToItems, hasUnnamedItem } from "../lib/ingredientDraft";
import type { DraftLine } from "../lib/ingredientDraft";
import { duplicatePayload, mealToTemplate, mergePayloads } from "../lib/mealActions";
import type { PanelAnchor } from "../lib/anchor";
import { EXERCISE_CONFIG_KEY, burnedKcalFor } from "../lib/exercise";
import type { AIParseItem, MealItem, MealPayload } from "../types";
import { groupMealsByCategory } from "../lib/mealCategory";
import type { MealCategory } from "../types";

/** Kategori başlığı → i18n anahtarı. `mealCategory.ts` saf lib (useTranslation
 *  import edilmez), çeviri çağrı yerinde yapılır. */
const CATEGORY_LABEL_KEY: Record<MealCategory, string> = {
  breakfast: "meal.categoryBreakfast",
  lunch: "meal.categoryLunch",
  dinner: "meal.categoryDinner",
  snack: "meal.categorySnack",
};
import { useTranslation } from "react-i18next";

function MergeModal({
  selectedMeals,
  onConfirm,
  onClose,
  busy,
}: {
  selectedMeals: MealItem[];
  onConfirm: (name: string) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const defaultName = selectedMeals.map((m) => m.label).join(" + ");
  const [name, setName] = useState(defaultName);
  const totalNutrition = sumMeals(selectedMeals);

  return (
    <Modal
      title={t("day.mergeDialogTitle", { count: selectedMeals.length })}
      onClose={onClose}
      footer={
        <FormActions
          onCancel={onClose}
          onSave={() => onConfirm(name.trim() || defaultName)}
          saving={busy}
          disabled={!name.trim()}
          saveLabel={t("day.mergeSave")}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t("day.mergeNameLabel")}
          value={name}
          onChange={setName}
          placeholder={t("day.mergeNamePlaceholder")}
        />
        <div className="rounded-chip border border-line bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-semibold text-ink-secondary">
            {t("day.mergeListHeader")}:
          </p>
          <ul className="space-y-1.5 text-xs text-ink-tertiary">
            {selectedMeals.map((m) => (
              <li key={m.id} className="flex justify-between items-baseline gap-2">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span className="flex-none">•</span>
                  <ExpandableMealName name={m.label} className="min-w-0 text-ink-tertiary" />
                </div>
                <span className="font-mono flex-none">{formatKcal(m.computed.kcal)}</span>
              </li>
            ))}
          </ul>
          <NutrientSummaryLine
            nutrition={totalNutrition}
            kcal="total"
            className="mt-3 border-t border-line pt-2 font-mono text-xs text-accent"
          />
        </div>
      </div>
    </Modal>
  );
}

/** Bir günün besin görselleri (halka + barlar + öğün katkısı)
 *  ve öğün ekleme/düzenleme/silme/birleştirme kontrolleri.
 *
 *  `enableScan`: Faz S3'ün "Tara" giriş noktalarından biri (Bugün ekranı).
 *  BİLEREK varsayılan false — DayView Geçmiş'in gün detayında da yeniden
 *  kullanılıyor (`HistoryPage.tsx`) ve brief'in iki giriş noktası (Bugün,
 *  Hafıza) dışına taşmasın diye yalnızca `DailyPage` bunu true geçiyor.
 *  ScanSheet'in kendisi HER ZAMAN bugüne yazar (`todayISO()`), hangi tarihin
 *  gösterildiğine bakmaz — bu yüzden prop yalnızca düğmenin görünürlüğünü
 *  kontrol eder, davranışını değil. */

export function DayView({
  date,
  emptyLabel,
  enableScan = false,
  triggerAddMeal,
  onResetTriggerAddMeal,
  triggerScan,
  onResetTriggerScan,
  triggerExercise,
  onResetTriggerExercise,
  showWeightCard = true,
  showTemplates = true,
  onOpenSupplementSettings,
  onOpenWaterSettings,
  resetKey = 0,
}: {
  date: string;
  emptyLabel?: string;
  // emptyLabel verilmezse `day.emptyLabel` kullanılır (Geçmiş gün detayında TR kalma hatası)
  // — DailyPage kendi özelleştirilmiş `empty.dayView` metnini geçmeye devam eder.

  enableScan?: boolean;
  triggerAddMeal?: boolean;
  onResetTriggerAddMeal?: () => void;
  triggerScan?: boolean;
  onResetTriggerScan?: () => void;
  triggerExercise?: boolean;
  onResetTriggerExercise?: () => void;
  onOpenSupplementSettings?: () => void;
  /** Su kartının dişli simgesi — takviyeyle AYNI yol (Ayarlar alt-görünümü). */
  onOpenWaterSettings?: () => void;
  showWeightCard?: boolean;
  /** Şablon çipleri: yalnızca Bugün'de gösterilir (Geçmiş gün detayında değil).
   *  `enableScan`den AYRI — o bayrak tarama giriş noktası içindi ve Bugün'de
   *  artık hiç geçilmiyor; şablonlar bu yüzden erişilemez kalmıştı. */
  showTemplates?: boolean;
  resetKey?: number;
}) {
  const { t } = useTranslation();
  const { goals, days, setDayMeals, config, updateConfig, aliases, offline, templateUsageIndex } = useData();
  const { showToast } = useToast();
  const goal = effectiveGoal(goals, date);
  const meals = mealsOf(days, date);
  const total = dayTotal(days, date);
  const hasData = meals.length > 0;
  const templates = parseTemplatesConfig(config);

  const burnedKcal = burnedKcalFor(config[EXERCISE_CONFIG_KEY], date);

  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [selectedMealForSheet, setSelectedMealForSheet] = useState<{
    meal: MealItem;
    index: number;
  } | null>(null);

  const [editIndex, setEditIndex] = useState<number | null | undefined>(undefined);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  /** Uzun-bas menüsü hangi öğün için açık (index = o anki gün içi sıra). */
  // `anchor`: menünün demirleneceği satır + menüyü doğuran basış (çapa noktası
  // ve basış kapısının işaretçisi — bkz. `lib/pressGate.ts`).
  const [menuFor, setMenuFor] = useState<{
    meal: MealItem;
    index: number;
    anchor: PanelAnchor;
  } | null>(null);
  /** "Yeni Şablon" — boş kalem listesiyle şablon oluşturma taslağı. */
  const [newTemplateDraft, setNewTemplateDraft] = useState<MealTemplate | null>(null);

  useEffect(() => {
    if (resetKey > 0) {
      setSelectedMealForSheet(null);
      setEditIndex(undefined);
      setShowExerciseModal(false);
      setShowMergeModal(false);
      setMenuFor(null);
      setPreviewTemplateId(null);
      setNewTemplateDraft(null);
    }
  }, [resetKey]);
  const [showScan, setShowScan] = useState(false);
  const [pendingAIItems, setPendingAIItems] = useState<AIParseItem[] | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRatio, setShowRatio] = useState(true);
  const toggleRatio = () => setShowRatio(!showRatio);

  async function handleSaveFromNutritionSheet(updatedMeal: MealItem, index: number) {
    if (busy) return;
    setBusy(true);
    try {
      const updatedMeals = [...meals];
      updatedMeals[index] = updatedMeal;
      await setDayMeals(date, toPayload(updatedMeals));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (triggerAddMeal) {
      setEditIndex(null);
      onResetTriggerAddMeal?.();
    }
  }, [triggerAddMeal, onResetTriggerAddMeal]);

  useEffect(() => {
    if (triggerScan) {
      setShowScan(true);
      onResetTriggerScan?.();
    }
  }, [triggerScan, onResetTriggerScan]);

  /** FAB > "Egzersiz Kaydet" (Bugün sekmesi): App.tsx'in `todayISO()`'ya
   *  sabitlenmiş global modalı yerine bu bileşenin KENDİ (`date` prop'una,
   *  yani WeekStrip'te seçili güne bağlı) egzersiz modalını açar. */
  useEffect(() => {
    if (triggerExercise) {
      setShowExerciseModal(true);
      onResetTriggerExercise?.();
    }
  }, [triggerExercise, onResetTriggerExercise]);

  function toggleSelect(index: number) {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  }

  async function removeMeal(index: number) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await setDayMeals(date, toPayload(meals.filter((_, i) => i !== index)));
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** Şablon çipi artık kör uygulamaz: önizleme açılır, kalemler + swap
   *  gösterilir, onayla eklenir. `previewTemplate` açık sheet'i tutar.
   *
   *  KİMLİK tutulur, nesne değil: `templates.list` her render'da yeniden
   *  parse edilir (`parseTemplatesConfig` memo'lu değil), nesne tutulsaydı
   *  her render'da yeni referans alır ve `TemplatePreview`'in
   *  `useEffect([template])`'i sonsuz kurma döngüsü kurardı. */
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const previewTemplate = useMemo(
    () => templates.list.find((t) => t.id === previewTemplateId) ?? null,
    [templates.list, previewTemplateId],
  );

  /** Sıfırdan çoklu kalemli şablon kaydeder. Yalnız şablon yazılır — bugüne
   *  öğün EKLENMEZ (kullanıcı kararı); uygulama yolu ayrı: şablona dokun. */
  async function saveNewTemplate(name: string, lines: DraftLine[]) {
    const trimmed = name.trim();
    if (busy || !trimmed) return;
    // Adı boş malzeme `parseTemplatesConfig`'te sessizce düşer ve tüm
    // şablonu listeden çıkarır; listede olmayan da sonraki full-replace ile
    // sunucudan silinir. Kapı `TemplatePreview`'de de var — burası savunmacı.
    const items = draftLinesToItems(lines);
    if (hasUnnamedItem(items)) return;
    setErr(null);
    setBusy(true);
    try {
      await updateConfig("templates", {
        list: [...templateList(config), { id: newTemplateId(), name: trimmed, items }],
      });
      setNewTemplateDraft(null);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate(lines: DraftLine[], updateTemplate: boolean) {
    const t = previewTemplate;
    if (busy || !t) return;
    setErr(null);
    setBusy(true);
    try {
      // Kalemler TEK öğün olarak girer (`templateItemsToPayload`) — öğün,
      // malzemelerinin toplamıdır; N kalem N satır değil.
      const items = draftLinesToItems(lines);
      const payload = templateItemsToPayload(items, t.id);
      if (payload) await setDayMeals(date, [...toPayload(meals), payload]);
      if (updateTemplate) {
        await updateConfig("templates", {
          list: templateList(config).map((x) => (x.id === t.id ? { ...x, items } : x)),
        });
      }
      setPreviewTemplateId(null);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** Şablon kaydetme — v0.26.2'de kaldırılan aksiyonun geri dönüşü; tek fark
   *  adın artık menüdeki isim diyaloğundan gelmesi. */
  async function saveAsTemplate(meal: MealItem, name: string) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await updateConfig("templates", { list: [...templateList(config), mealToTemplate(meal, name)] });
      showToast(t("mealMenu.templateSaved"), "success");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** "Aynısını bugüne ekle": hangi güne bakılırsa bakılsın BUGÜNE yazar,
   *  görüntülenen güne dokunmaz (Geçmiş'te dünün öğününe bakarken de doğru). */
  async function duplicateMeal(meal: MealItem) {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const today = todayISO();
      await setDayMeals(today, [...toPayload(mealsOf(days, today)), duplicatePayload(meal)]);
      showToast(t("mealMenu.duplicateDone"), "success");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** Menüden MODAL açan aksiyonlar: sheet kapanışının `history.back()`'i
   *  asenkron; yeni modalı hemen açmak geçmişte "zombi" girdi bırakır — bkz.
   *  `afterHistoryBackSettles` (FAB menüsü → modal geçişiyle aynı desen). */
  function openMealForm(index: number) {
    setMenuFor(null);
    afterHistoryBackSettles(() => setEditIndex(index));
  }

  /** Menüden "Seç": mevcut seçim moduna girer, bu öğün işaretli gelir. */
  function selectMeal(index: number) {
    setMenuFor(null);
    setSelectMode(true);
    setSelectedIndices([index]);
  }

  async function handleMergeConfirm(mergedName: string) {
    if (busy || selectedIndices.length < 2) return;
    setErr(null);
    setBusy(true);
    try {
      const selectedMeals = selectedIndices.map((i) => meals[i]);
      const mergedMeal: MealPayload = mergePayloads(selectedMeals, mergedName);

      const firstIndex = Math.min(...selectedIndices);
      const selectedSet = new Set(selectedIndices);

      const nextPayload: MealPayload[] = [];
      meals.forEach((m, idx) => {
        if (idx === firstIndex) {
          nextPayload.push(mergedMeal);
        } else if (!selectedSet.has(idx)) {
          nextPayload.push(toPayload([m])[0]);
        }
      });

      await setDayMeals(date, nextPayload);
      setSelectedIndices([]);
      setSelectMode(false);
      setShowMergeModal(false);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  function closeForm() {
    setEditIndex(undefined);
    setErr(null);
    setPendingAIItems(undefined);
  }

  function requestCloseMerge() {
    if (busy) return;
    setShowMergeModal(false);
  }

  const selectedMeals = selectedIndices.map((i) => meals[i]).filter(Boolean);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <DayTypeBadge date={date} />

      <StatCardCarousel
        total={total}
        goal={goal}
        burnedKcal={burnedKcal}
        showRatio={showRatio}
        onToggleRatio={toggleRatio}
        onOpenExercise={() => setShowExerciseModal(true)}
      />

      {/* Su kartı takviyenin ÜSTÜNDE: kullanıcı geri bildirimi "göremiyorum"du,
          yani keşfedilebilirlik kartın konumuna bağlı. */}
      <WaterCard date={date} onOpenSettings={onOpenWaterSettings} />
      <SupplementCard date={date} onOpenSettings={onOpenSupplementSettings} />
      {showWeightCard && <WeightCard date={date} />}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-secondary">{t("day.recentMeals")}</h3>

          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                {selectedIndices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIndices([])}
                    className="rounded-pill border border-line bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-ink-tertiary transition hover:text-ink-primary"
                  >
                    {t("day.clearSelection")}
                  </button>
                )}
                {selectedIndices.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setShowMergeModal(true)}
                    disabled={busy}
                    className="rounded-pill bg-memory px-3 py-1.5 text-xs font-bold text-memory-ink transition hover:opacity-90 disabled:opacity-40"
                  >
                    🔗 {t("day.merge")} ({selectedIndices.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIndices([]);
                  }}
                  className="rounded-pill border border-memory/40 bg-white/[0.09] px-3 py-1.5 text-xs font-bold text-ink-primary transition hover:bg-white/[0.15]"
                >
                  {t("day.done")}
                </button>
              </>
            ) : (
              hasData && (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary"
                >
                  {t("day.select")}
                </button>
              )
            )}
            {enableScan && (
              <button
                type="button"
                onClick={() => setShowScan(true)}
                disabled={busy}
                className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary disabled:opacity-40"
              >
                📷 {t("day.scan")}
              </button>
            )}
          </div>
        </div>

        {err && <ErrorText>{err}</ErrorText>}

        {showTemplates && (
          <>
            {/* Başlık + "Yeni Şablon": sıfırdan çoklu kalemli şablon kurmanın
                yolu. Koşul `list.length > 0` DEĞİL: o zaman düğme tam olarak
                şablonsuz durumda kaybolur ve ilk şablon yine kurulamaz.
                Vurgulu da değil — şablonlar ikincil, gözü yormasın diye
                `border-line` + `text-ink-secondary`. */}
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-ink-secondary">{t("day.templates")}</h3>
              <button
                type="button"
                onClick={() => setNewTemplateDraft({ id: "", name: "", items: [] })}
                className="rounded-pill border border-line bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-memory/40 hover:bg-white/[0.09] hover:text-ink-primary"
              >
                + {t("aliasPage.newTemplate")}
              </button>
            </div>
            {templates.list.length > 0 && (
              <TemplateShelf
                templates={templates.list}
                usage={templateUsageIndex}
                busy={busy}
                onPick={(id) => setPreviewTemplateId(id)}
              />
            )}
          </>
        )}

        {hasData ? (
          <>
            <button
              type="button"
              onClick={() => setEditIndex(null)}
              disabled={busy}
              /* Rehberin 2. adımı: gün dolu olduğunda görünen tek ekleme kapısı
                 (boş gündeki büyük CTA ile AYNI işaret — ikisi asla birlikte
                 render edilmez, bkz. aşağıdaki `hasData` dalı). */
              data-guide-target="add-meal"
              className="self-start rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink transition hover:opacity-90 disabled:opacity-40"
            >
              + {t("day.addMeal")}
            </button>
            <div className="flex flex-col gap-4">
              {groupMealsByCategory(meals).map(({ category, items }) => (
                <div key={category} className="flex flex-col gap-2.5 sm:gap-3">
                  <h4 className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
                    {category === "other" ? t("day.other") : t(CATEGORY_LABEL_KEY[category])}
                  </h4>
                  <ul className="flex flex-col gap-2.5 sm:gap-3">
                    {items.map(({ meal: m, index: i }) => (
                      <MealRow
                        key={m.id}
                        meal={m}
                        index={i}
                        selectMode={selectMode}
                        isSelected={selectedIndices.includes(i)}
                        onToggleSelect={() => toggleSelect(i)}
                        onEdit={() => setSelectedMealForSheet({ meal: m, index: i })}
                        onOpenMenu={(anchor) => setMenuFor({ meal: m, index: i, anchor })}
                        busy={busy}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditIndex(null)}
            disabled={busy}
            /* Rehberin 2. adımı — boş günün "ilk öğün" CTA'sı (bkz. yukarıdaki
               dolu-gün dalındaki aynı işaret). */
            data-guide-target="add-meal"
            className="anim-fadeup flex flex-col items-center justify-center gap-3 rounded-card bg-calCard border border-calBorder shadow-card px-4 py-8 text-center transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-icon-well text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="text-sm text-ink-tertiary">{emptyLabel ?? t("day.emptyLabel")}</span>
            <span className="rounded-pill bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink">
              + {t("day.addMeal")}
            </span>
          </button>
        )}
      </section>

      {editIndex !== undefined && (
        <MealForm
          date={date}
          editIndex={editIndex}
          onClose={closeForm}
          initialAIItems={pendingAIItems}
        />
      )}

      {showMergeModal && (
        <MergeModal
          selectedMeals={selectedMeals}
          onConfirm={handleMergeConfirm}
          onClose={requestCloseMerge}
          busy={busy}
        />
      )}

      {menuFor && (
        <MealActionSheet
          meal={menuFor.meal}
          anchor={menuFor.anchor}
          busy={busy}
          offline={offline}
          isToday={date === todayISO()}
          onClose={() => setMenuFor(null)}
          onSaveTemplate={(name) => {
            const meal = menuFor.meal;
            setMenuFor(null);
            void saveAsTemplate(meal, name);
          }}
          onDuplicate={() => {
            const meal = menuFor.meal;
            setMenuFor(null);
            void duplicateMeal(meal);
          }}
          onEdit={() => openMealForm(menuFor.index)}
          onSelect={() => selectMeal(menuFor.index)}
          onDelete={() => {
            const index = menuFor.index;
            setMenuFor(null);
            void removeMeal(index);
          }}
        />
      )}

      {newTemplateDraft && (
        <TemplatePreview
          template={newTemplateDraft}
          aliases={aliases}
          busy={busy}
          onClose={() => setNewTemplateDraft(null)}
          onApply={(lines, _update, name) => void saveNewTemplate(name, lines)}
        />
      )}

      {previewTemplate && (        <TemplatePreview
          template={previewTemplate}
          aliases={aliases}
          busy={busy}
          onClose={() => setPreviewTemplateId(null)}
          onApply={(lines, update) => void applyTemplate(lines, update)}
        />
      )}

      {showScan && (
        <ScanSheet
          onClose={() => setShowScan(false)}
          onVisionResult={(items) => {
            setPendingAIItems(items);
            setShowScan(false);
            setEditIndex(null);
          }}
        />
      )}

      <ExerciseModal
        isOpen={showExerciseModal}
        onClose={() => setShowExerciseModal(false)}
        date={date}
      />

      <NutritionSheet
        isOpen={!!selectedMealForSheet}
        onClose={() => setSelectedMealForSheet(null)}
        meal={selectedMealForSheet?.meal ?? null}
        onSave={(updated) => {
          if (selectedMealForSheet) {
            handleSaveFromNutritionSheet(updated, selectedMealForSheet.index);
          }
        }}
        onDelete={(_id) => {
          if (selectedMealForSheet) {
            removeMeal(selectedMealForSheet.index);
          }
        }}
      />
    </div>
  );
}
