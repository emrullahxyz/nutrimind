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
import { AliasPicker } from "./AliasPicker";
import { AiError, aiErrorMessage, parseWithAI } from "../lib/ai";
import { FormActions, NutrientSummaryLine, NumField, NutritionFields, TextField, fromDraft, toDraft } from "./FormBits";
import type { MealTemplate } from "../lib/templates";
import type { AIParseItem, Alias } from "../types";
import {
  addDraftLine,
  aliasOfLine,
  draftGramHint,
  draftLineFromAlias,
  draftLinesToItems,
  hasUnnamedItem,
  newDraftLine,
  removeDraftLine,
  roundNutrition,
  setDraftGrams,
  sumLineNutrition,
  swapDraftLine,
} from "../lib/ingredientDraft";
import type { DraftLine, GramEditHint } from "../lib/ingredientDraft";

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
/** `Nutrition` ↔ `NutritionDraft` dönüşümleri `FormBits`'ten (`toDraft`/`fromDraft`) içe
 *  aktarılır — burada kopyalanmaz. Kopya, orijinalden saptı ve mikrobesinleri
 *  kaybetti: kullanıcı elle satırda sodyum giriyordu, kayıtta görünmüyordu. */
const draftFromNutrition = toDraft;
const nutritionFromDraft = fromDraft;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function initialDraftLines(
  template: MealTemplate,
  aliases: Alias[],
  isNew = false,
): DraftLine[] {
  // Yeni şablon: kullanıcı boş ekranla değil, HAFIZA PICKER'I AÇIK tek bir
  // iskelet satırla başlar (addLine ile aynı deneyim). `blank: true` olduğu
  // için `draftLinesToItems` onu düşürür — doldurulmadan kaydedilemez.
  if (isNew) return [newDraftLine(undefined)];

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
      // `item.grams`: `sources`ı olmayan kalemin gramajı. Miktar alanında
      // GÖSTERİLMEDEN önce buraya konduğu için `preserved` doğru: miktar
      // ölçülebilir değil (alias yok), ama kayıttan geldiği için korunur.
      qty: item.grams !== undefined ? String(item.grams) : "",
      unit: "g",
      grams: item.grams ?? 0,
      nutrition: item.nutrition,
      // `item.grams` doluysa kayıttaki makro O gramaja aittir — miktar
      // değişince oranlama tabanı bu. `grams` yoksa 0: gramaj bilinmiyor,
      // ölçekleme yapılamaz (eskiden davranış).
      nutritionGrams: item.grams ?? 0,
      preserved: true,
      manualMeasured: false,
      blank: false, // kayıttan gelen kalem: iskelet değil, kayda girer
      // `fromRecord`: bu satır ŞABLONDAN geldi. Gramaj yazılınca `preserved`
      // düşer ama satır hâlâ kayıttandır — elle alanları açılmaz. (ÖLÇÜLEN
      // HATA: iki kaynaklı kaleme gramaj yazılınca satır elle satıra döndü ve
      // kullanıcının girmediği kayıt adı elle alana düştü.)
      fromRecord: true,
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
  /** `name` boş olan geçici şablon "yeni şablon" modudur: boş kalem listesiyle
   *  açılır ve kullanıcı adını kendisi yazar. Gerçek şablonlarda `name`
   *  doludur ve alan görünmez (ad kayıttan gelir). */
  template: MealTemplate;
  aliases: Alias[];
  busy: boolean;
  onClose: () => void;
  /** lines: güncel kalem satırları, updateTemplate: tanıma da yazılsın mı,
   *  name: yeni şablonda kullanıcının yazdığı ad (kayıtlı şablonda `template.name`). */
  onApply: (lines: DraftLine[], updateTemplate: boolean, name: string) => void;
}) {
  const { t } = useTranslation();
  const isNew = template.name === "";
  const [name, setName] = useState(template.name);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    initialDraftLines(template, aliases, isNew),
  );
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [updateTemplate, setUpdateTemplate] = useState(false);
  // AI: öğün ekleme ekranındaki sekmeyle AYNI akış (metin + kamera).
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  /** "Malzeme ekle" → AÇILAN İSKELE SATIRINA yönlendiren picker anahtarı.
   *  Seçim yapılmadan kapanırsa satır, ad + makro alanları açık elle satır
   *  olarak kalır. Açık satır yoksa (satır silinmiş) picker açılmaz. */
  const [pickerFor, setPickerFor] = useState<string | null>(() =>
    isNew ? (lines[0]?.key ?? null) : null,
  );
  /** Miktar değişikliğinin kullanıcıya gösterilecek sonucu. Satırın anahtarıyla
   *  tutulur — ipucu hangi satıra ait olmalı? */
  const [hint, setHint] = useState<{ key: string; hint: GramEditHint } | null>(null);

  // Farklı şablon açılırsa sıfırla (bileşen yeniden mount olmayabilir).
  useEffect(() => {
    const fresh = initialDraftLines(template, aliases, isNew);
    setName(template.name);
    setLines(fresh);
    // Yeni şablonda ilk satır picker'AÇIK gelir: kullanıcı adı yazmadan
    // besin aramaya başlar. Kayıtlı şablonda picker kapalıdır.
    setPickerFor(isNew ? (fresh[0]?.key ?? null) : null);
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
  // Adı boş kalem `templates.ts` parse'ında sessizce düşer ve şablonu
  // listeden tamamen çıkarır — kaydet bu yüzden kapalı kalmalı (bkz.
  // `hasUnnamedItem`).
  const hasUnnamed = hasUnnamedItem(savableItems);
  const total = useMemo(
    () => roundNutrition(sumLineNutrition(savableItems)),
    [savableItems],
  );

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
        // AI makrosu `baseAmount` gramajı içindir — kullanıcı miktarı
        // değiştirince ORANLANSIN, yoksa "değer gir" uyarısı yanlış çıkardı
        // (AI besin değerini zaten biliyor). Gramaj gelmediyse taban yok:
        // ölçeklemenin nereye göre yapılacağı bilinmiyor.
        nutritionGrams: hasAmount ? (it.baseAmount as number) : 0,
        // Gramaj geldiyse bu bir ÖLÇÜM (ölçülebilir satır); gelmediyse
        // makro gerçek ama miktar bilinmiyor → korunmuş satır.
        preserved: !hasAmount,
        manualMeasured: false,
        // AI besini hafızaya BAĞLI değildir (isim eşleşmesi ölçüm değildir);
        // `blank` FALSE — içeriği gerçek, iskelet değil, kayda girer.
        blank: false,
        // `fromRecord` FALSE: AI satırı kullanıcının girdiği değil, AI'ın
        // döndürdüğü — ama yine de KAYIT değil. Elle alanları AÇIK kalır ki
        // kullanıcı makroları düzeltebilsin.
        fromRecord: false,
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

  /** "Malzeme ekle": BOŞ elle satır açar VE İSKELE SATIRINDA HAFIZA
   *  PICKER'INI AÇAR — "boş ekran geldi, hafızadan seçemiyorum" şikayetinin
   *  asıl kökü, picker'ın yalnız gizli "Malzemeyi değiştir" düğmesinin
   *  arkasında kalmasıydı. Kullanıcı açılışta aradığı besini yazar seçer;
   *  açarsa ad + makro alanları açık elle satır olarak kalır (satır kapanmaz).
   *
   *  Önceden `newDraftLine(aliases[0])` ile hafızanın ilk besini rastgele
   *  atılıyordu; sonra iskelet satırı + gizli swap düğmesi vardı. */
  function addLine() {
    const line = newDraftLine(undefined);
    setLines((prev) => addDraftLine(prev, line));
    setPickerFor(line.key);
  }

  return (
    <Modal
      title={isNew ? t("aliasPage.newTemplate") : template.name}
      onClose={onClose}
      footer={
        <FormActions
          onCancel={onClose}
          onSave={() => onApply(lines, updateTemplate, name.trim() || template.name)}
          saving={busy}
          // `lines.length` YETMEZ: satır var ama gramajı boşaltıldığı için
          // kaydedilemez durumda olabilir (`draftLinesToItems` onu düşürür).
          // O durumda düğme etkin görünür ve hiçbir şey yapmazdı.
          // Yeni şablonda AD da zorunlu — isimsiz şablon kaydedilmez.
          // Adı boş MALZEME de kaydedilemez: parse onu düşürür, hepsi
          // düşerse şablon listeden çıkar ve sonraki kayıt siler.
          disabled={busy || savableItems.length === 0 || hasUnnamed || (isNew && !name.trim())}
          saveLabel={isNew ? t("templatePreview.saveTemplate") : t("day.addMeal")}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {/* Yeni şablonda ad alanı — kayıtlı şablonda ad kayıttan gelir, alan
            gösterilmez. */}
        {isNew && (
          <TextField
            label={t("aliasPage.templateNameLabel")}
            value={name}
            onChange={setName}
            placeholder={t("aliasPage.templateNamePlaceholder")}
          />
        )}
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
              const alias = aliasOfLine(aliases, line);
              // ELLE satırı: kullanıcı ad + makroyu kendi giriyor (hafızadan değil).
              //
              // "Elle satır mı" sorusu `aliasId === null` ile yanıtlanır —
              // `manualMeasured` DEĞİL. Bayrak, satırın kayda girmesini sağlar
              // ama alanların AÇIK kalmasıyla ilgisi yoktur: `onChange` makro
              // alanına ilk dokunuşta bayrağı yükseltir, bayrak da alanları
              // kapatırsa kullanıcı protein/karb/yağ/lif'i de giremez olur
              // (ölçüldü: adı yazar yazar alanlar kayboldu).
              //
              // `fromRecord` hariç: kayıttan gelen kalemdir, elle girilen değil —
              // makrosu kullanıcının değil kaydın gerçeğidir, kullanıcı yalnızca
              // miktar yazar ya da besini değiştirir. `preserved` TEK BAŞINA
              // yetmez: korunmuş kaleme gramaj yazılınca `preserved` düşer ve
              // satır `aliasId: null` olduğu için elle sayılırdı — kayıttaki gerçek
              // ad "MALZEME ADI" alanına düşüyordu (ÖLÇÜLEN HATA).
              const isManualRow = line.aliasId === null && !line.preserved && !line.fromRecord;
              return (
                <li
                  key={line.key}
                  className="rounded-chip border border-line bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    {pickerFor === line.key ? (
                      // "Malzeme ekle"nin açtığı İSKELE satırında hafıza
                      // seçici — satırın ALTINDA değil YERİNDE. Seçim yapılırsa
                      // `aliasId` dolar ve `blank` düşer; "Elle gir"e
                      // basılırsa picker kapanır, satır ad + makro alanları
                      // açık elle satır olur (iskelet kayda girmez).
                      <div className="flex-1">
                        <AliasPicker
                          aliases={aliases}
                          selectedAliasId={""}
                          onSelectAlias={(id) => {
                            const next = aliases.find((a) => a.id === id);
                            setPickerFor(null);
                            if (!next) return;
                            // `swapDraftLine` gramajı KORUR, besini bağlar —
                            // iskelet satırda gramaj 0, korunacak değer yok,
                            // ve makro alias'tan ölçeklenir. `blank` düşer.
                            patch(line.key, swapDraftLine(line, next));
                          }}
                          label={t("meal.memorySelectLabel")}
                        />
                        <button
                          type="button"
                          onClick={() => setPickerFor(null)}
                          className="mt-1.5 w-full rounded-pill border border-line px-3 py-1.5 text-[11px] font-bold text-ink-secondary transition hover:text-ink-primary"
                        >
                          {t("recipeBuilder.manualMode")}
                        </button>
                      </div>
                    ) : swapKey === line.key ? (
                      <div className="flex-1">
                        <AliasPicker
                          aliases={aliases}
                          selectedAliasId={line.aliasId ?? ""}
                          onSelectAlias={(id) => {
                            const next = aliases.find((a) => a.id === id);
                            if (next) patch(line.key, swapDraftLine(line, next));
                            setSwapKey(null);
                          }}
                          onDismiss={() => setSwapKey(null)}
                          autoFocus
                        />
                      </div>
                    ) : isManualRow && !swapKey ? (
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
                        suffix={line.unit}
                        value={line.qty}
                        onChange={(v) => {
                          // Önceki satır GÖVDEDE okunur: `setHint` içinde
                          // state updater'ı kullanmak StrictMode'da iki kez
                          // çalışır (bkz. NutritionSheet.tsx:149-163).
                          const onceki = lines.find((l) => l.key === line.key) ?? null;
                          const sonraki = setDraftGrams(line, v, alias ?? null);
                          setHint({ key: line.key, hint: draftGramHint(sonraki, alias ?? null, onceki) });
                          patch(line.key, sonraki);
                        }}
                      />
                      {/* Korunan kalem: gramajı kayıttan geldiği için varsa gösterilir,
                          yoksa BİLİNMİYOR (0 g değil) — makrosu gerçek.
                          Alan KİLİTLİ DEĞİLDİR: `TemplateItem.grams` gramajı
                          alias olmadan da saklar.

                          DIKKAT — alias'sız satırda gramaj ÖLÇEK değildir.
                          `setDraftGrams`'ın elle dalı makroyu BİLEREK
                          değiştirmez: kullanıcının yazdığı 200 kcal, "100 g'da
                          kaç kalori var" bilgisinin karşılığı değildir —
                          ölçeklemek uydurma bir dönüşüm olurdu. İkisi
                          bağımsız gerçeklerdir: makro ne kadar, gramaj ne kadar.

                          ALIAS'ı OLAN korunmuş satırda: `swapDraftLine`
                          korunmuş bir satıra besin bağladığında `aliasId` dolar ve
                          ölçülebilir bir taban (`serving_g`) gelir. `swapDraftLine`
                          bayrağı koruduğu için bayrak tek başına kilitli görünür;
                          kilidin kalkması için BİRİKİMİ olması gerekir. Aksi halde
                          korunmuş satır kalıcı olarak yalnızca silinebilir olurdu:
                          ne ölçülebilir ne düzeltilebilir. */}
                      {/* "Miktar bilinmiyor" YALNIZCA gramaj gerçekten yokken. Kayıttan
                          `item.grams` ile gelen satırda miktar BİLİNİYOR
                          (100 g), ama gramajı ölçülemediği için `preserved`
                          taşıyor — etiket bu satırda yanlış olurdu. */}
                      {line.preserved && line.grams <= 0 && (
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
                      {/* Hafızaya bağlama düğmesi HER SATIRDA görünür —
                          korunmuş satırda çıkış yoludur; YENİ elle satırda
                          da çıkış yoludur: kullanıcı "Malzeme ekle" dedi,
                          ad + makro yazacaktı ama hafızada zaten var —
                          aranıp bağlanabileceğini görmesini istiyoruz.
                          Önceden koşul `alias || (preserved && aliases.length)`
                          idi; yeni elle satırda (aliasId null, preserved false)
                          düğme YOKTU — hafızadaki domates bile elle yeniden
                          yazılıyordu, makroları sıfır kalıyordu. */}
                      {(alias || (line.preserved && aliases.length > 0) || isManualRow) &&
                      swapKey !== line.key ? (
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
                  {isManualRow && (
                    <div className="mt-2">
                      <NutritionFields
                        draft={draftFromNutrition(line.nutrition)}
                        onChange={(d) =>
                          patch(line.key, { ...line, nutrition: nutritionFromDraft(d), manualMeasured: true })
                        }
                      />
                    </div>
                  )}

                  {/* Kalem başına besin değeri. `kcal="inline"` ile KALORI DE
                      GÖSTERİLİR: yalnız makrolar (P/K/Y/L) yazınca "besin
                      değeri görünmüyor" gibi duruyordu. */}
                  <NutrientSummaryLine
                    as="span"
                    nutrition={line.nutrition}
                    kcal="inline"
                    className="mt-2 block font-mono text-[11px] text-ink-tertiary"
                  />

                  {/* Miktar değişikliğinin sonucu. Hafızaya bağlı satırda
                      besin değerleri ölçeklendi (şeffaf onay); bağlı olmayanda
                      DEĞİŞMEZ ve kullanıcı bunu bilmeliydi — "miktarı
                      azaltamıyorum" şikâyetinin kaynağı buydu. */}
                  {hint?.key === line.key && hint.hint?.kind === "scaled" && (
                    <p className="mt-1 text-[11px] text-memory">
                      {t("nutrition.ingredientRescaled", {
                        from: round1(hint.hint.fromGrams),
                        to: round1(hint.hint.toGrams),
                      })}
                    </p>
                  )}
                  {hint?.key === line.key && hint.hint?.kind === "noNutrition" && (
                    <p className="mt-1 text-[11px] text-amber-300">
                      {t("nutrition.ingredientNoNutrition")}
                    </p>
                  )}
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

        {hasUnnamed && (
          <p className="text-[11px] text-danger">{t("nutrition.itemNameRequired")}</p>
        )}

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

        {/* Yeni şablonda "şablonu da güncelle" anlamsız — zaten şablon
            oluşturuluyor, güncelleme değil. */}
        {!isNew && (
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={updateTemplate}
              onChange={(e) => setUpdateTemplate(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/10"
            />
            {t("templatePreview.updateTemplate")}
          </label>
        )}
      </div>
    </Modal>
  );
}
