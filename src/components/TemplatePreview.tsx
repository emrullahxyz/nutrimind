// Şablon önizlemesi + DÜZENLEYİCİ: çipe dokununca kör uygulamadan önce
// içindekiler açılır; kalem eklenir/silinir/gramajı değişir/swap edilir.
// "Şablonu da güncelle" işaretliyse değişiklik tanıma da yazılır, işaretli
// değilse yalnızca bu güne eklenir.
//
// Saf kurallar `lib/ingredientDraft.ts`'te; burada yalnızca çizim var.
import { useEffect, useMemo, useState } from "react";
import { Camera, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { ScanSheet } from "./ScanSheet";
import { AiError, aiErrorMessage, parseWithAI } from "../lib/ai";
import { FormActions, NutrientSummaryLine, NumField, NutritionFields, TextField } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import type { MealTemplate } from "../lib/templates";
import type { AIParseItem, Alias, Nutrition } from "../types";
import { addNutrition, parseNum } from "../lib/nutrition";
import { NUTRIENT_KEYS } from "../lib/nutrients";
import { ZERO_NUTRITION } from "../types";
import {
  addDraftLine,
  draftLineFromAlias,
  draftLinesToItems,
  newDraftLine,
  removeDraftLine,
  roundNutrition,
  setDraftGrams,
  swapDraftLine,
} from "../lib/ingredientDraft";
import type { DraftLine } from "../lib/ingredientDraft";

/** Şablon kalemlerini düzenlenebilir satırlara çevirir.
 *
 *  Hafızada çözülebilen kalemler alias'a bağlanır (gramaj/swap açılır).
 *  Çözülemeyen kalem — alias silinmiş ya da birim artık tanınmıyor —
 *  SİLİNMEZ: kayıttaki adı ve makrosu korunur, hafıza bağlantısı kesilir
 *  (elle satır). Bu ekranın kayıt yolu şablonun TAMAMINI yeniden yazdığı
 *  için düşen bir satır, kullanıcının kayıtlı şablonundan sessizce silinmiş
 *  bir malzeme olurdu (bkz. lessons.md L21). Yanlışlık bedeli: kullanıcının
 *  elle yeniden bağlayacağı, görünür bir satır — düzeltilebilir.
 *
 *  `preserved: true` satırı "kayıttan geldi ama gramajı ölçülemedi" olarak
 *  işaretler: gramaj alanı boş kalır, ekranda ayrıca etiketlenir, ama
 *  `draftLinesToItems` onu ATMAZ (bkz. `preserved` alanının dokümanı). */
/** Makroların hepsi sıfır mı? `newDraftLine(undefined)` (elle satır) tam
 *  olarak böyle bir satır kurar; kullanıcı bir alana dokununca artık değildir. */
function isZeroNutrition(n: Nutrition): boolean {
  return n.kcal === 0 && n.protein === 0 && n.carbs === 0 && n.fat === 0 && n.fiber === 0;
}

/** `NutritionDraft` (metin tabanlı, form alanları) ↔ `Nutrition` (sayı tabanlı).
 *  `FormBits.NutritionFields` metin bekler, `DraftLine.nutrition` sayı tutar. */
function draftFromNutrition(n: Nutrition): NutritionDraft {
  const out = {} as NutritionDraft;
  for (const key of NUTRIENT_KEYS) out[key] = n[key] === undefined ? "" : String(n[key]);
  return out;
}

function nutritionFromDraft(d: NutritionDraft): Nutrition {
  const out = {} as Nutrition;
  for (const key of NUTRIENT_KEYS) {
    const v = parseNum(d[key] ?? "");
    if (v > 0) out[key] = v;
  }
  return out;
}

function initialDraftLines(template: MealTemplate, aliases: Alias[]): DraftLine[] {
  const byId = new Map(aliases.map((a) => [a.id, a]));
  const out: DraftLine[] = [];
  for (const [i, item] of template.items.entries()) {
    const sources = item.sources ?? [];
    const src = sources[0];
    const alias = src ? byId.get(src.aliasId) : undefined;
    const measured = src && alias ? draftLineFromAlias(alias, String(src.qty), src.unit, item.nutrition) : null;

    if (measured && sources.length === 1) {
      out.push(measured);
      continue;
    }

    // Kalem tek kaynaklı DEĞİLSE ya da kaynağı çözülemiyorsa, olduğu gibi
    // korunur: miktarı bilinmeyen, kayda alınan bir elle satır.
    //
    // Çok kaynaklı kalemde neden ölçülen pay kullanılmıyor: `mealToTemplate`
    // (`lib/mealActions.ts`) kalemin `nutrition`'ı olarak öğünün TOPLAM'ını
    // ve TÜM `sources`'ını kopyalar. Yalnız `sources[0]` ölçülürse ikinci
    // kalemin makroları ekrandan VE kayıttan düşer — "Şablonu da güncelle"
    // işaretliyse şablon kalıcı olarak tek kaleme düşer (sessiz, geri
    // alınamaz). Toplamı kaynak sayısına bölmek de çözüm değil: uydurma
    // dağılım. `NutritionSheet.mealDraftLines` tüm kaynakları gezdiği için
    // iki yüzey burada ayrışıyordu.
    out.push({
      key: `draft-manual-${i}-${item.name}`,
      aliasId: null,
      name: item.name,
      qty: "",
      unit: "g",
      grams: 0,
      nutrition: item.nutrition,
      preserved: true,
      manualMeasured: false,
    });
  }
  return out;
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
  /** lines: güncel kalem satırları, updateTemplate: tanıma da yazılsın mı. */
  onApply: (lines: DraftLine[], updateTemplate: boolean) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<DraftLine[]>(() => initialDraftLines(template, aliases));
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [updateTemplate, setUpdateTemplate] = useState(false);
  // AI: öğün ekleme ekranındaki sekmeyle AYNI akış (metin + kamera).
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Farklı şablon açılırsa sıfırla (bileşen yeniden mount olmayabilir).
  useEffect(() => {
    setLines(initialDraftLines(template, aliases));
    setSwapKey(null);
    setUpdateTemplate(false);
    setAiText("");
    setAiError(null);
  }, [template]);

  // Toplam KAYIT YOLUNDAN hesaplanır — `lines` üzerinden DEĞİL (L20).
  // `draftLinesToItems` gramajı boşaltılmış ölçülebilir satırları DÜŞÜRÜR
  // (kullanıcı malzemeyi sildi); ham `lines` üzerinden toplam alırsak o
  // malzeme ekranda kalır ama kayda girmez. Kutu işaretliyse bu, kayıtlı
  // şablonun malzemelerini `items: []` ile SİLMEK demek — geri alınamaz.
  // `NutritionSheet` aynı düzeltmeyi aldığında (b4a60ae) buraya yansımadı;
  // iki yüzey aynı kurallı olduğu için aynı toplamı kullanmalı.
  const savableItems = useMemo(() => draftLinesToItems(lines), [lines]);
  const total = useMemo(
    () =>
      roundNutrition(
        savableItems.reduce<Nutrition>((a, item) => addNutrition(a, item.nutrition), { ...ZERO_NUTRITION }),
      ),
    [savableItems],
  );

  function aliasOf(line: DraftLine): Alias | undefined {
    return line.aliasId ? aliases.find((a) => a.id === line.aliasId) : undefined;
  }

  /** AI'nın bulduğu malzemeyi bir satıra çevirir.
   *
   *  MİKTAR: `baseAmount` varsa o değer kullanılır — sunucu besin değerlerinin
   *  hangi miktara dayandığını etiketten okuyup gönderir (100 g ya da "30 g'lik
   *  1 porsiyon"). Yoksa miktar UYDURMA 100 g yazılmaz: satır gramajsız kurulur
   *  ve `preserved` ile korunur. Makro zaten geldiği için toplam doğru kalır,
   *  kullanıcı isterse miktarı sonradan yazar.
   *
   *  `aliasId` bilinçli olarak `null`: AI besini hafızadaki bir kayıtla eşleşmiş
   *  olabilir ama isim eşleşmesi bir ölçüm değildir. Hafızaya bağlarsak
   *  `sources` yazılır ve gramaj `baseAmount`'tan gelir; bu, kullanıcının
   *  henüz doğrulamadığı bir miktarı kayda ölçüm gibi geçirirdi. Kullanıcı
   *  isterse "Malzemeyi değiştir" ile hafızaya bağlar ve miktar o zaman ölçülür. */
  function addAIItems(items: AIParseItem[]) {
    if (items.length === 0) return;
    const fresh = items.map((it, i): DraftLine => {
      const base = newDraftLine(undefined);
      const hasAmount = typeof it.baseAmount === "number" && it.baseAmount > 0;
      return {
        ...base,
        key: `draft-ai-${Date.now()}-${i}`,
        name: it.name,
        qty: hasAmount ? String(it.baseAmount) : "",
        grams: hasAmount ? (it.baseAmount as number) : 0,
        unit: "g",
        nutrition: it.nutrition,
        // Gramaj geldiyse bu bir ÖLÇÜM (ölçülebilir satır); gelmediyse
        // makro gerçek ama miktar bilinmiyor → korunmuş satır.
        preserved: !hasAmount,
        manualMeasured: false,
      };
    });
    setLines((prev) => fresh.reduce((acc, l) => addDraftLine(acc, l), prev));
  }

  async function analyzeWithAI() {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await parseWithAI(aiText.trim());
      if (result.items.length === 0) setAiError(t("meal.aiEmpty"));
      else {
        addAIItems(result.items);
        setAiText("");
      }
    } catch (e) {
      setAiError(
        e instanceof AiError ? aiErrorMessage(e.status, e.message, e.retryAfter) : String((e as Error)?.message ?? e),
      );
    } finally {
      setAiLoading(false);
    }
  }

  function patch(key: string, next: DraftLine) {
    setLines((prev) => prev.map((l) => (l.key === key ? next : l)));
  }

  /** "Malzeme ekle": BOŞ elle satır açar — kullanıcı ad ve makroları kendi
   *  girer, ya da hafızadan besin seçmek için "Malzemeyi değiştir"e basar.
   *
   *  Önceden `newDraftLine(aliases[0])` ile hafızanın ilk besini rastgele
   *  atılıyordu: kullanıcı istediği besini seçmek için ekledikten sonra
   *  ayrıca değiştirmek zorundaydı, ve ekleme anında ekranda anlamsız bir
   *  besin beliriyordu. */
  function addLine() {
    setLines((prev) => addDraftLine(prev, newDraftLine(undefined)));
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
          // `lines.length` YETMEZ: satır var ama gramajı boşaltıldığı için
          // kaydedilemez durumda olabilir (`draftLinesToItems` onu düşürür).
          // O durumda düğme etkin görünür ve hiçbir şey yapmazdı.
          disabled={busy || savableItems.length === 0}
          saveLabel={t("day.addMeal")}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {/* NOT: boş-durum dalı BİLEREK YOK. Çöp kutusu yalnız
            `lines.length > 1` iken görünür, yani son satır silinemez ve
            `lines.length === 0` hiç oluşmaz. Son satırın silinememesi
            bilinçli: malzemesi olmayan bir "yemek" kaydedilmemeli, kullanıcı
            her an "Malzeme ekle" ile yenisini açabilir. `nutrition.
            emptyIngredients` anahtarı da bu yüzden kaldırıldı — ulaşılamayan
            UI ve ulaşılamayan i18n ölü koddur. Son satırı silmek istenirse
            tek yapılacak koşulu gevşetmek; o zaman dal ve anahtar geri gelir. */}
        <ul className="space-y-2">
          {lines.map((line) => {
              const alias = aliasOf(line);
              // YENİ eklenen elle satır: kullanıcı "Malzeme ekle" dedi ve henüz ne ad ne
              // makro girdi. `preserved` DEĞİL (o, kayıttan gelip ölçülemeyen
              // kalem) — ayırt eden, boş ad + makrosu sıfır olması. Bu satır
              // için beş makro alanı açılır: hafızadan olmayan bir besin için
              // gramaj tek başına YETMEZ, "100 g'da kaç kalori var" bilgisi
              // ancak makroyla gelir.
              const isManualDraft =
                !alias && !line.preserved && !line.manualMeasured && line.name.trim() === "" && isZeroNutrition(line.nutrition);
              return (
                <li
                  key={line.key}
                  className="rounded-chip border border-line bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    {swapKey === line.key ? (
                      <select
                        autoFocus
                        aria-label={t("nutrition.swapIngredient")}
                        className="w-full rounded-xl bg-field px-3 py-2 text-xs font-bold text-white focus:outline-none"
                        value={line.aliasId ?? ""}
                        onChange={(e) => {
                          const next = aliases.find((a) => a.id === e.target.value);
                          if (next) patch(line.key, swapDraftLine(line, next));
                          setSwapKey(null);
                        }}
                      >
                        {aliases.map((a) => (
                          <option key={a.id} value={a.id} className="bg-field text-white">
                            {a.name} · {a.nutrition.kcal} kcal/{a.serving_g}g
                          </option>
                        ))}
                      </select>
                    ) : isManualDraft ? (
                      <div className="flex-1">
                        <TextField
                          label={t("nutrition.ingredientManualName")}
                          value={line.name}
                          onChange={(v) => patch(line.key, { ...line, name: v })}
                        />
                      </div>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink-primary">
                        {line.name}
                      </span>
                    )}
                    {swapKey !== line.key && lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => removeDraftLine(prev, line.key))}
                        aria-label={t("nutrition.ingredientRemove")}
                        title={t("nutrition.ingredientRemove")}
                        className="p-1 text-ink-tertiary transition hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <NumField
                        label={t("nutrition.ingredientGrams")}
                        suffix="g"
                        value={line.qty}
                        onChange={(v) => patch(line.key, setDraftGrams(line, v, alias ?? null))}
                        disabled={line.preserved && !alias}
                      />
                      {/* Korunan kalem: gramajı BİLİNMIYOR (0 g değil), makrosu
                          gerçek. Miktar alanı yalnız ALIAS'ı olmayan korunmuş
                          satırda kilitlidir — `TemplateItem` miktarı ancak bir
                          `sources` içinde, yani bir `aliasId` ile saklar;
                          bağlantı yoksa yazılan sayı sessizce kaybolurdu.

                          ALIAS'ı OLAN korunmuş satırda alan AÇIKTIR: `swapDraftLine`
                          korunmuş bir satıra besin bağladığında `aliasId` dolar ve
                          ölçülebilir bir taban (`serving_g`) gelir. `swapDraftLine`
                          bayrağı koruduğu için bayrak tek başına kilitli görünür;
                          kilidin kalkması için BİRİKİMİ olması gerekir. Aksi halde
                          korunmuş satır kalıcı olarak yalnızca silinebilir olurdu:
                          ne ölçülebilir ne düzeltilebilir. */}
                      {line.preserved && (
                        <p className="mt-1 text-[11px] text-amber-300">
                          {t("nutrition.ingredientAmountUnknown")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-end justify-end">
                      {/* Hafızaya bağlı satır (alias'lı) VE korunmuş satır aynı
                          çıkış yolunu sunar: besine bağla. Bu, alias'ı OLMAYAN
                          korunmuş satırın çıkış yoludur — miktar alanı
                          `preserved && !alias` yüzünden kilitlidir ve yalnız
                          `alias` gelince açılır. `swapDraftLine` bayrağı
                          KORUR (düşürseydi kayıttan gelen gerçek miktarı
                          uydurmuş olurdu); alanı açılan şey bayrak değil,
                          bağlanan besindir. Alanı açıp ölçülebilir hale getiren
                          tek eylem, miktarı YAZMAKTIR. */}
                      {alias || (line.preserved && aliases.length > 0) ? (
                        <button
                          type="button"
                          onClick={() => setSwapKey(line.key)}
                          className="rounded-pill border border-line px-3 py-2 text-[11px] font-bold text-ink-secondary transition hover:text-ink-primary"
                        >
                          {t("nutrition.swapIngredient")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Elle satır: ad + beş makro. Gramaj TEK BAŞINA yetmez —
                      hafızadan olmayan bir besin için "100 g'da kaç kalori var"
                      bilgisi ancak makroyla gelir. Kaydetme kapısı
                      `hasManualNutrition` kuralıyla aynı: `kcal > 0 ||
                      protein > 0` (`MealForm.tsx:427`).
                      `nutritionFromDraft` boş alanı `undefined` yapar, 0
                      DEĞİL — "bilinmiyor" ile "sıfır" farkı korunur. */}
                  {isManualDraft && (
                    <div className="mt-2">
                      <NutritionFields
                        draft={draftFromNutrition(line.nutrition)}
                        onChange={(d) =>
                          patch(line.key, { ...line, nutrition: nutritionFromDraft(d), manualMeasured: true })
                        }
                      />
                    </div>
                  )}

                  <NutrientSummaryLine
                    as="span"
                    nutrition={line.nutrition}
                    className="mt-2 block font-mono text-[11px] text-ink-tertiary"
                  />
                </li>
              );
            })}
        </ul>

        <button
          type="button"
          onClick={addLine}
          className="flex w-full items-center justify-center gap-1.5 rounded-pill border border-line bg-white/[0.04] px-3 py-2.5 text-xs font-bold text-ink-secondary transition hover:text-ink-primary"
        >
          <Plus className="h-3.5 w-3.5" /> {t("nutrition.ingredientAdd")}
        </button>

        {/* AI: öğün ekleme ekranındaki sekmeyle AYNI akış — serbest metin ya da
            kamera. Bulunan malzemeler doğrudan yukarıdaki satırlara düşer,
            ayrı bir "sepete ekle" adımı yoktur.
            Anahtar i18n metinleri `meal.*`'ten ALINIR (kopyalanmaz): aynı
            özellik iki yerde farklı metin göstermemeli. */}
        <div className="rounded-chip border border-line bg-white/[0.03] p-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-ink-secondary">{t("meal.aiPromptLabel")}</span>
            <textarea
              className="w-full min-h-[72px] rounded-xl bg-black/30 border border-white/10 text-sm text-white focus:outline-none focus:border-accent resize-none"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={t("meal.aiPromptPlaceholder")}
            />
          </label>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              disabled={aiLoading}
              aria-label={t("templatePreview.aiCamera")}
              title={t("templatePreview.aiCamera")}
              className="rounded-pill border border-line px-3 py-2 text-ink-secondary transition hover:text-ink-primary disabled:opacity-40"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={analyzeWithAI}
              disabled={aiLoading || !aiText.trim()}
              className="rounded-full bg-accent px-4 py-2 text-xs font-extrabold text-accent-ink transition hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiLoading ? t("meal.aiAnalyzing") : t("meal.aiAnalyze")}
            </button>
          </div>

          {aiError && <p className="mt-2 text-[11px] text-danger">{aiError}</p>}
        </div>

        {scanOpen && (
          <ScanSheet
            onClose={() => setScanOpen(false)}
            onVisionResult={(items) => {
              setScanOpen(false);
              addAIItems(items);
            }}
          />
        )}

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
