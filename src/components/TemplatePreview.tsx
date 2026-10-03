// Şablon önizlemesi + DÜZENLEYİCİ: çipe dokununca kör uygulamadan önce
// içindekiler açılır; kalem eklenir/silinir/gramajı değişir/swap edilir.
// "Şablonu da güncelle" işaretliyse değişiklik tanıma da yazılır, işaretli
// değilse yalnızca bu güne eklenir.
//
// Saf kurallar `lib/ingredientDraft.ts`'te; burada yalnızca çizim var.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";
import { FormActions, NutrientSummaryLine, NumField, TextField } from "./FormBits";
import type { MealTemplate } from "../lib/templates";
import type { Alias, Nutrition } from "../types";
import { addNutrition } from "../lib/nutrition";
import { ZERO_NUTRITION } from "../types";
import {
  addDraftLine,
  draftLineFromAlias,
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
function initialDraftLines(template: MealTemplate, aliases: Alias[]): DraftLine[] {
  const byId = new Map(aliases.map((a) => [a.id, a]));
  return template.items.map((item, i) => {
    const src = item.sources?.[0];
    const alias = src ? byId.get(src.aliasId) : undefined;
    if (src && alias) {
      const line = draftLineFromAlias(alias, String(src.qty), src.unit, item.nutrition);
      if (line) return line;
    }
    return {
      key: `draft-manual-${i}-${item.name}`,
      aliasId: null,
      name: item.name,
      qty: "",
      unit: "g",
      grams: 0,
      nutrition: item.nutrition,
      preserved: true,
    };
  });
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

  // Farklı şablon açılırsa sıfırla (bileşen yeniden mount olmayabilir).
  useEffect(() => {
    setLines(initialDraftLines(template, aliases));
    setSwapKey(null);
    setUpdateTemplate(false);
  }, [template]);

  const total = useMemo(
    () =>
      roundNutrition(
        lines.reduce<Nutrition>((a, l) => addNutrition(a, l.nutrition), { ...ZERO_NUTRITION }),
      ),
    [lines],
  );

  function aliasOf(line: DraftLine): Alias | undefined {
    return line.aliasId ? aliases.find((a) => a.id === line.aliasId) : undefined;
  }

  function patch(key: string, next: DraftLine) {
    setLines((prev) => prev.map((l) => (l.key === key ? next : l)));
  }

  /** "Malzeme ekle": aliases boşsa elle satır (yoksa ekleyecek isim yok). */
  function addLine() {
    const fresh = newDraftLine(aliases[0]);
    setLines((prev) => addDraftLine(prev, fresh));
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
          disabled={busy || lines.length === 0}
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
                          çıkış yolunu sunar: besine bağla. Korunmuş satırın
                          miktar alanı kilitli olduğu için bu ONUN çıkış
                          yoludur — bağlanınca `swapDraftLine` `preserved`'ı
                          düşürür ve alan açılır. */}
                      {alias || (line.preserved && aliases.length > 0) ? (
                        <button
                          type="button"
                          onClick={() => setSwapKey(line.key)}
                          className="rounded-pill border border-line px-3 py-2 text-[11px] font-bold text-ink-secondary transition hover:text-ink-primary"
                        >
                          {t("nutrition.swapIngredient")}
                        </button>
                      ) : (
                        <TextField
                          label={t("nutrition.ingredientManualName")}
                          value={line.name}
                          onChange={(v) => patch(line.key, { ...line, name: v })}
                        />
                      )}
                    </div>
                  </div>

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
