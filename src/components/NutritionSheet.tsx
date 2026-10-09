import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Flame, Beef, Wheat, Droplet, Trash2, Plus } from "lucide-react";
import { ZERO_NUTRITION } from "../types";
import type { Alias, MealCategory, MealItem, Nutrition } from "../types";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useModalHistory } from "../hooks/useModalHistory";
import { useModalExit } from "../hooks/useModalExit";
import { addNutrition, scaleMealSources } from "../lib/nutrition";
import {
  addDraftLine,
  aliasOfLine,
  draftLinesToItems,
  mealDraftLines,
  newDraftLine,
  removeDraftLine,
  roundNutrition,
  setDraftGrams,
  sumLineNutrition,
  swapDraftLine,
  unattributedNutrition,
} from "../lib/ingredientDraft";
import type { DraftLine } from "../lib/ingredientDraft";
import { EditableStat, toDraft, fromDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { NutrientSummaryLine, NumField } from "./FormBits";
import { MEAL_CATEGORIES, categoryForHour } from "../lib/mealCategory";
import { useData } from "../lib/data";
import { AliasPicker } from "./AliasPicker";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  meal: MealItem | null;
  onSave?: (updatedMeal: MealItem) => void;
  onDelete?: (mealId: string) => void;
}

/** `multiplier`'la ölçeklenmiş besin değeri — hem render'da hem `handleStep`
 *  içinde (yeni çarpanın taslağını kurmak için) kullanılıyor, tek yerde. */
export function scaleMealNutrition(computed: Nutrition | undefined, multiplier: number): Nutrition {
  // Çarpan 1 iken HİÇBİR ŞEYE dokunma: `.toFixed(1)` turu, aç-kaydet akışında
  // 2 ondalığı sessizce 1 ondalığa tırnaklar (8.75 → 8.8). Kayıt `fromDraft`
  // ile gösterilen değeri geri yazar, yani taslağın saklananla birebir olması
  // şart. Yuvarlama yalnızca stepper ölçeklemesinde (m ≠ 1) isteniyor.
  if (multiplier === 1) return { ...(computed ?? ZERO_NUTRITION) };
  return {
    kcal: Math.round((computed?.kcal ?? 0) * multiplier),
    protein: Number(((computed?.protein ?? 0) * multiplier).toFixed(1)),
    carbs: Number(((computed?.carbs ?? 0) * multiplier).toFixed(1)),
    fat: Number(((computed?.fat ?? 0) * multiplier).toFixed(1)),
    fiber: Number(((computed?.fiber ?? 0) * multiplier).toFixed(1)),
    sugar: computed?.sugar !== undefined ? Number((computed.sugar * multiplier).toFixed(1)) : undefined,
    satFat: computed?.satFat !== undefined ? Number((computed.satFat * multiplier).toFixed(1)) : undefined,
    sodium: computed?.sodium !== undefined ? Math.round(computed.sodium * multiplier) : undefined,
  };
}

/** Miktar alanı KİLİTLİ mi?
 *
 *  İki AYRI iddia birleşiyor:
 *   • `preserved` — bu satırın miktarı BİLİNMIYOR (kayıttan geldi, ölçülemedi).
 *   • `!alias`   — ölçecek bir taban yok (`MealItem.sources` miktarı ancak bir
 *     `aliasId` ile saklar; alias yoksa yazılan sayı kayda giremezdi).
 *
 *  İkisi birden gerekir. Yalnız `preserved`'a bakmak, besine BAĞLANMIŞ ama
 *  miktarı hâlâ bilinmeyen satırı kilitli bırakır ve kullanıcı hiçbir işlem
 *  yapamadan satırı yalnızca silebilir — `swapDraftLine` korunmuş bir satırda
 *  bayrağı DÜŞÜRMEZ (bayrak düşseydi kayıttan gelen gerçek miktar uydurulurdu),
 *  dolayısıyla kilidi kaldıran tek şey `alias`'ın gelmesidir. Bu koşul
 *  `TemplatePreview`'daki `disabled={line.preserved && !alias}` ile AYNIDIR.
 *
 *  ŞU AN MÜMKÜN DEĞİL ve kilit kodunun kendisi de ölü: `mealDraftLines`'in
 *  YA HİÇ ya da HİÇBİRİ kuralı yüzünden oraya ulaşan HER satırın alias'ı
 *  canlıdır, dolayısıyla bu fonksiyon hep `false` döner ve miktar alanı hiç
 *  kilitlenmez. Bu bir gizli varsayım değil, TÜM-ORA-HİÇBİRİ kuralının DOĞAL
 *  SONUCUDUR. Kod yine de tutuluyor çünkü tek kurtarma yolu bu: kural
 *  gevşetilirse kilitli alan, "girilebilir ama kaydedilemez" 2. tur hatasının
 *  bir daha oluşmasını engeller. Silinirse tuzak sessizce yeniden açılır.
 *  Bakım notu: kilidi kaldırırsanız `mealDraftLines`'in ya-hiç-ya-hiçbiri
 *  kuralını da (`lib/ingredientDraft.ts`) gözden geçirin.
 *
 *  JSX içine gömülü bırakılırsa test edilemez; bu yüzden dışa açıktır
 *  (`NutritionSheet.test.ts` — jsdom'suz, saf fonksiyon). */
export function isAmountLocked(line: DraftLine, alias: Alias | undefined): boolean {
  return line.preserved && !alias;
}

/** Kaydın çözülebilen kalem satırları + tam düzenleme (ekle/sil/gramaj/swap).
 *  Saf kurallar `lib/ingredientDraft.ts`'te. */
function IngredientLines({
  meal,
  aliases,
  resetKey,
  onCommit,
}: {
  meal: MealItem;
  aliases: Alias[];
  resetKey: unknown;
  onCommit: (lines: DraftLine[]) => void;
}) {
  const { t } = useTranslation();
  // `key` yerine iç state: parent farklı öğünde resetKey değiştirir.
  const [lines, setLines] = useState<DraftLine[] | null>(() => mealDraftLines(meal, aliases));
  const [swapKey, setSwapKey] = useState<string | null>(null);

  // Farklı öğün açılınca sıfırla (aynı sheet yeniden mount edilmiyor).
  // meal/aliases doğrudan deps'e konmaz: resolve her render yeni dizi
  // üretir, effect döngüye girer. resetKey parent'tan gelir.
  useEffect(() => {
    setLines(mealDraftLines(meal, aliases));
    setSwapKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Kaynaksız/çözülemez öğün: kırılım yok, bölüm hiç çizilmez (ölçülmüş regresyon).
  if (!lines || lines.length === 0) return null;

  /** Satırları hem yerel state'e yazar hem parent'a bildirir — ana kartın
   *  toplamı kaydedilenle aynı kalmalı (L20): yalnız kaydet anında değil,
   *  düzenleme ANINDA da eşitlenir.
   *
   *  `onCommit` BİLEREK `setLines` updater'ının DIŞINDA çağrılır. Parent bu
   *  çağrıda kendi `setState`'lerini çalıştırır (`setSwappedLines`, `setBasis`,
   *  `setDraft`); updater'ın içinde çağırmak parent setState'lerini bir React
   *  updater'ının içine sokardı — StrictMode (`main.tsx:22`) updater'ları
   *  geliştirmede iki kez çağırdığı için yan etki iki kez koşardı.
   *
   *  `lines` bu bileşenin tek doğruluk kaynağı (`:130`), bu yüzden `prev`'den
   *  okumak yerine doğrudan `lines`'ten türetmek bir yarış koşulu yaratmaz.
   *  `null` kapatma durumudur (`:143`) — oysa `patch`/`removeRow`/`addRow`
   *  yalnız KAPALI bir listeden çağrılır; `commit` tek giriş noktası olduğu
   *  için daraltmayı burada bir kez toparlıyoruz. */
  function commit(updated: DraftLine[] | null) {
    if (!updated) return;
    setLines(updated);
    onCommit(updated);
  }

  function patch(key: string, next: DraftLine) {
    commit(lines?.map((l) => (l.key === key ? next : l)) ?? null);
  }

  function removeRow(key: string) {
    commit(lines ? removeDraftLine(lines, key) : null);
  }

  function addRow() {
    commit(lines ? addDraftLine(lines, newDraftLine(aliases[0])) : null);
  }

  // Başlık toplamı, kayıt YOLUNDAN hesaplanır — `lines`'ten DEĞİL.
  //
  // L20: gösterilen = kaydedilen. `draftLinesToItems` gramajı boşaltılmış
  // ölçülebilir satırları DÜŞÜRÜR (kullanıcı malzeme silmiştir); ham `lines`
  // üzerinden toplam alırsak o satırın makrosu ekranda kalır ama kayda girmez.
  // Ölçüldü: 150 g tavuk + 100 g pilav, pilavın gramajı temizlenince başlık
  // 377.5 kcal, kayıt 247.5 kcal — kalıcı 130 kcal fark.
  //
  // `draftLinesToItems` `roundNutrition`'ı KENDİ uygular, ama toplama
  // SONRASI da uygulanmalı: satır toplamının yuvarlanmamış hâli ekrana
  // (2 ondalık) kayda (1 ondalık) ayrışmasın diye.
  const total = roundNutrition(sumLineNutrition(draftLinesToItems(lines)));

  return (
    <div className="space-y-2.5 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white/90">{t("nutrition.ingredientsTitle")}</span>
        <span className="font-mono text-[11px] text-white/50">{total.kcal} kcal</span>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => {
          const alias = aliasOfLine(aliases, line);
          const locked = isAmountLocked(line, alias);
          return (
            <li
              key={line.key}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs sm:text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                {swapKey === line.key ? (
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
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-semibold text-white/90">
                      {line.name}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(line.key)}
                        aria-label={t("nutrition.ingredientRemove")}
                        title={t("nutrition.ingredientRemove")}
                        className="p-1 text-ink-tertiary transition hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="mt-2 flex items-end gap-2">
                <div>
                  <NumField
                    label={t("nutrition.ingredientGrams")}
                    suffix={line.unit}
                    value={line.qty}
                    onChange={(v) => patch(line.key, setDraftGrams(line, v, alias ?? null))}
                    disabled={locked}
                  />
                  {locked && (
                    <p className="mt-1 text-[11px] text-amber-300">
                      {t("nutrition.ingredientAmountUnknown")}
                    </p>
                  )}
                </div>
                {alias && swapKey !== line.key && (
                  <button
                    type="button"
                    onClick={() => setSwapKey(line.key)}
                    className="mb-1 rounded-pill border border-white/15 px-3 py-2 text-[11px] font-bold text-amber-300 transition hover:text-amber-200"
                  >
                    {t("nutrition.swapIngredient")}
                  </button>
                )}
              </div>

              {/* `kcal="inline"` — kalori de gösterilir. Yalnız makrolar
                  (P/K/Y/L) yazınca "besin değeri görünmüyor" gibi duruyordu;
                  `TemplatePreview`'deki kalem satırıyla aynı gösterim. */}
              <NutrientSummaryLine
                as="span"
                nutrition={line.nutrition}
                kcal="inline"
                className="mt-2 block font-mono text-[11px] text-white/50"
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={addRow}
        className="flex w-full items-center justify-center gap-1.5 rounded-pill border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[11px] font-bold text-ink-secondary transition hover:text-ink-primary"
      >
        <Plus className="h-3.5 w-3.5" /> {t("nutrition.ingredientAdd")}
      </button>
    </div>
  );
}

export function NutritionSheet({ isOpen, onClose, meal, onSave, onDelete }: Props) {
  // Lock background body scroll when modal is open
  useBodyScrollLock(isOpen);
  const { t } = useTranslation();
  const { aliases } = useData();

  const [label, setLabel] = useState(meal?.label ?? "");
  const [category, setCategory] = useState<MealCategory>(
    meal?.category ?? categoryForHour(new Date().getHours())
  );
  const [multiplier, setMultiplier] = useState(1);
  // Kartların kendisi düzenlenebilir alan — `draft` her zaman gösterilen değer.
  // "Miktar her zaman kazanır": stepper her basıldığında draft yeniden ölçeklenmiş
  // değerle kurulur ve `basis` "quantity"ye döner; bir alana doğrudan yazmak
  // `basis`'i "manual" yapar (kaydederken `sources` koparılır).
  const [basis, setBasis] = useState<"quantity" | "manual">("quantity");
  const [draft, setDraft] = useState<NutritionDraft>(() => toDraft(scaleMealNutrition(meal?.computed, 1)));

  // Sync state when meal prop changes
  useEffect(() => {
    if (meal) {
      setLabel(meal.label);
      setCategory(meal.category ?? categoryForHour(new Date().getHours()));
      setMultiplier(1);
      setBasis("quantity");
      setDraft(toDraft(scaleMealNutrition(meal.computed, 1)));
    }
  }, [meal]);

  // Geri tuşu/kaydırma/X entegrasyonu — bkz. `useModalHistory` (7 bileşende
  // elle kopyalanmış aynı deseni tek yere topluyor; bu dosyadaki eski sürüm
  // kapanışta `replaceState` kullanıyordu, bu da her açılışta geçmiş
  // yığınında boş bir girdi bırakıyordu — hook `history.back()` kullanıyor).
  // Blur çağrısı `onClose`'un içinde: odaklı bir `EditableStat` alanındaki
  // metin seçiliyse mobil "kes/kopyala" balonu input DOM'dan kalksa bile
  // ekranda asılı kalıyordu — kapanmadan önce blur ile seçimi bırakmak
  // balonu da kapatıyor (hem geri tuşu hem X/backdrop yolunda gerekli).
  const { requestClose: handleUserClose } = useModalHistory({
    active: isOpen && !!meal,
    onClose: () => {
      (document.activeElement as HTMLElement | null)?.blur();
      onClose();
    },
  });
  const { closing, beginClose } = useModalExit(handleUserClose);

  /** Tam-ekran diyalog: `aria-modal="true"` iddiası artık Tab tuzağı ve
   *  kapanışta odak iadesiyle karşılanıyor (bkz. `useDialogFocus`). Odak
   *  kapanışta açan öğeye döner — kapanış anında sheet İÇİNDEKİ alanın blur'u
   *  (yukarıdaki `onClose`) yine önce çalışır, kes/kopyala balonu asılı kalmaz. */
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogFocus({
    containerRef: rootRef,
    active: isOpen && !!meal && !closing,
    onEscape: beginClose,
    autoFocus: "container",
  });

  // Swap sonrası kalemler: Kaydet'e basılana kadar bekler, basılınca
  // sources + computed birlikte güncellenir (gösterilen = kaydedilen).
  // Hook sırası: erken return'dan ÖNCE (hook kuralı).
  const [swappedLines, setSwappedLines] = useState<DraftLine[] | null>(null);
  useEffect(() => {
    setSwappedLines(null);
  }, [meal]);

  if (!isOpen || !meal) return null;

  const scaledSources = scaleMealSources(meal.sources, multiplier);
  // Çarpan hem toplamı hem satırları aynı oranda büker → kalan da ölçeklenir.
  const scaledMeal: MealItem = {
    ...meal,
    computed: scaleMealNutrition(meal.computed, multiplier),
    sources: scaledSources,
  };
  const remainder = unattributedNutrition(scaledMeal, aliases);

  function updateField(key: keyof NutritionDraft, value: string) {
    setBasis("manual");
    // Elle makro = sources kopar (swap da geçersiz kalır).
    setSwappedLines(null);
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const handleStep = (delta: number) => {
    // Porsiyon değiştirmek, KAYITTAN türetilen satırları geçersiz kılar:
    // çarpan yeni bir ölçüm uygular, kullanıcının kalem düzenlemeleriyle
    // birleştirilemez.
    //
    // Uyarı KAPSAMI önemli: yalnız `basis === "manual"`'a bakmak, malzeme
    // düzenlemelerini sessizce yutuyordu. Malzeme düzenlendiğinde `basis`
    // `"quantity"`'ya çevrilir, dolayısıyla eski uyarı tetiklenmiyordu —
    // ekranda düzenlenmiş satırlar görünürken kaydet tıklandığında hepsi
    // düşüyordu. `swappedLines` doluysa da uyar.
    if (basis === "manual" || swappedLines) {
      if (!window.confirm(t("nutrition.manualOverrideWarning"))) return;
    }
    setSwappedLines(null);
    // Miktar her zaman kazanır: porsiyon çarpanı değiştiğinde önceki elle
    // düzenlenmiş makro değerleri geçersiz kılınır, taslak yeniden ölçeklenmiş
    // değerle kurulur.
    const nextMultiplier = Math.max(0.25, Number((multiplier + delta).toFixed(2)));
    setMultiplier(nextMultiplier);
    setBasis("quantity");
    setDraft(toDraft(scaleMealNutrition(meal.computed, nextMultiplier)));
  };

  const handleApplySave = () => {
    if (!onSave) return;
    // Porsiyon çarpanı `sources[].qty`'yi de ölçeklemeli — aksi halde `computed`
    // iki katına çıkar ama kaynak miktar eski değerde kalır, `usualQuantity`nin
    // ("geçmişe dayalı miktar tahmini") temel aldığı veri bozulur. Bir alan elle
    // düzenlendiyse (`basis==="manual"`) hafıza bağlantısı koparılır.
    // Swap edildiyse kalemler kazanır (stepper/manuel dokunuş ayrıca basis'i
    // değiştirir; swap sonrası elle makro yazmak sources'u koparır).
    if (swappedLines && basis === "quantity") {
      const items = draftLinesToItems(swappedLines);
      const nutrition = sumLineNutrition(items);
      const collected = items.flatMap((i) => i.sources ?? []);
      const updated: MealItem = {
        ...meal,
        label,
        category,
        // `remainder` yoksa satır düzenlemesi kaynaksız kalemin besinini
        // sessizce siler (yukarıdaki `unattributedNutrition`).
        computed: roundNutrition(addNutrition(nutrition, remainder)),
        // `sources` DAİMA yazılır — koşullu yayılım (`collected.length > 0`)
        // yazılmayan durumda `...meal`'den gelen ESKİ kaynakları kayıtta
        // bırakırdı: kullanıcı malzemeleri silmiş olsa bile öğün eski
        // kaynaklarıyla kaydedilirdi. Toplam `computed` ile tutarsız kalırdı.
        sources: collected,
      };
      onSave(updated);
      beginClose();
      return;
    }
    const finalNutrition = fromDraft(draft);
    const finalSources = basis === "manual" ? undefined : scaledSources;
    // `...meal` yayılımı `sources`'u da getirir. Koşullu yayılım
    // (`...(finalSources ? … : {})`) `undefined`'da HİÇBİR ŞEY yazmadığı için
    // eski kaynaklar kayıtta kalırdı — `basis === "manual"` (kullanıcı makroyu
    // elle yazdı) hafıza bağlantısını kopyalayacağı halde bağlantı KOPMUŞ
    // olarak kaydedilirdi. Boş dizi de yanlış cevap: "ölçtüm, malzeme yok"
    // der. Doğru cevap alanı YOKSUN kılmak, o yüzden `meal`'den DESTRUCTURE
    // edilip ayrıca konur. `!== undefined` yazmak yetmezdi: o da `undefined`
    // için bir şey yazmıyordu (ölçüldü: her iki biçim de eski kaynakları
    // koruyordu).
    const { sources: _ignored, ...mealWithoutSources } = meal;
    const updated: MealItem = {
      ...mealWithoutSources,
      label,
      category,
      computed: finalNutrition,
      ...(finalSources !== undefined ? { sources: finalSources } : {}),
    };
    onSave(updated);
    beginClose();
  };

  return (
    <div
      ref={rootRef}
      data-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label={t("nutrition.title")}
      tabIndex={-1}
      className={`fixed inset-0 z-[9999] flex flex-col bg-app text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe glass-screen ${
        closing ? "glass-screen-out" : ""
      }`}
    >
      {/* Top Header */}
      {/* `pad-safe-t`: iPhone'da başlık status bar'ın altında kalmasın (geri düğmesi). */}
      <div className="pad-safe-t flex items-center justify-between px-4 py-3.5 sm:px-6 border-b border-white/10 flex-none bg-app">
        <button
          type="button"
          onClick={beginClose}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-95"
          aria-label={t("meal.back")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-extrabold text-white tracking-wide">
          {t("nutrition.title")}
        </h2>

        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t("nutrition.confirmDelete"))) return;
              onDelete(meal.id);
              beginClose();
            }}
            className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition active:scale-95"
            title={t("nutrition.deleteMeal")}
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        ) : (
          <div className="w-10 h-10" />
        )}
      </div>

      {/* Main Scrollable Content Area */}
      {/* `pb-[calc(…var(--kb))]`: iOS klavyesi açılınca odaklanılan alan klavyenin
          altında kalmasın (bkz. hooks/useKeyboardInset). */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-[calc(1rem_+_var(--kb))]">
        {/* Meal Name Input Field (Besin Adı) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80 block">
            {t("nutrition.foodName")}
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/20 text-sm font-semibold text-white focus:outline-none focus:border-white/40"
            placeholder={t("nutrition.foodName")}
          />
        </div>

        {/* Category Selector Pills */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white/80 block">{t("meal.categoryLabel")}</label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {MEAL_CATEGORIES.map((c) => {
              const isSelected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                    isSelected
                      ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                      : "border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
                  }`}
                >
                  {t(`meal.category${c.charAt(0).toUpperCase() + c.slice(1)}`)}
                </button>
              );
            })}
          </div>
        </div>


        {/* Serving Amount Stepper (Porsiyon Miktarı) */}
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm font-semibold text-white/90">
            {t("nutrition.servingAmount")}
          </span>
          <div className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/[0.04] px-4 py-2.5 min-w-[130px] justify-between">
            <button
              type="button"
              onClick={() => handleStep(-0.25)}
              className="text-white/70 hover:text-white text-lg font-bold transition active:scale-90 w-6 h-6 flex items-center justify-center"
            >
              —
            </button>
            <span className="font-extrabold text-white text-base min-w-[28px] text-center tabular-nums">
              {multiplier}
            </span>
            <button
              type="button"
              onClick={() => handleStep(0.25)}
              className="text-white/70 hover:text-white text-lg font-bold transition active:scale-90 w-6 h-6 flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        {/* Calories Hero Card — tıklayınca direkt düzenlenebilir */}
        <label htmlFor="macro-kcal" className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex items-center justify-between cursor-text">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-medium text-white/50">{t("nutrition.calories")}</div>
              <EditableStat
                id="macro-kcal"
                value={draft.kcal ?? ""}
                onChange={(v) => updateField("kcal", v)}
                className="text-2xl font-black text-white tabular-nums tracking-tight w-24"
              />
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 font-mono">kcal</div>
        </label>

        {/* 3 Main Macros Grid (Protein, Karbonhidrat, Yağ) */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Protein */}
          <label htmlFor="macro-protein" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px] cursor-text">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Beef className="w-3.5 h-3.5 text-protein-bright" />
              <span>{t("nutrition.protein")}</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <EditableStat
                id="macro-protein"
                value={draft.protein ?? ""}
                onChange={(v) => updateField("protein", v)}
                className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight w-12"
              />
              <span className="text-base sm:text-lg font-black text-white">g</span>
            </div>
          </label>

          {/* Karbonhidrat */}
          <label htmlFor="macro-carbs" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px] cursor-text">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Wheat className="w-3.5 h-3.5 text-carb-bright" />
              <span>{t("nutrition.carbs")}</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <EditableStat
                id="macro-carbs"
                value={draft.carbs ?? ""}
                onChange={(v) => updateField("carbs", v)}
                className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight w-12"
              />
              <span className="text-base sm:text-lg font-black text-white">g</span>
            </div>
          </label>

          {/* Yağ */}
          <label htmlFor="macro-fat" className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 flex flex-col justify-between min-h-[80px] cursor-text">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <Droplet className="w-3.5 h-3.5 text-fat-bright" />
              <span>{t("nutrition.fat")}</span>
            </div>
            <div className="flex items-baseline gap-0.5 mt-1">
              <EditableStat
                id="macro-fat"
                value={draft.fat ?? ""}
                onChange={(v) => updateField("fat", v)}
                className="text-base sm:text-lg font-black text-white tabular-nums tracking-tight w-12"
              />
              <span className="text-base sm:text-lg font-black text-white">g</span>
            </div>
          </label>
        </div>

        {meal && (
          <IngredientLines
            // Ölçeklenmiş kopya: porsiyon çarpanı `sources[].qty`'ye de
            // uygulanmalı, aksi halde satırlar çarpanı göstermezken ana kart
            // gösterirdi (gösterilen ≠ kaydedilen). Aynı sebeple stepper
            // bastığında `swappedLines` sıfırlanır: çarpan KAYITTAN türetilen
            // ölçümleri değiştirir, kullanıcının kalem düzenlemeleriyle
            // birleştirilemez — bu yüzden `handleStep` uyarı sorar.
            meal={scaledMeal}
            aliases={aliases}
            resetKey={`${meal.id}:${multiplier}`}
            onCommit={(next) => {
              setSwappedLines(next);
              // Gösterim kaydedilenle AYNI olmalı (L20): ana kart eski toplamı
              // göstermeye devam ederse kullanıcı "225 → 175 gördüm ama
              // 418 yazıyor" diye kaydeder.
              const items = draftLinesToItems(next);
              const nutrition = sumLineNutrition(items);
              setBasis("quantity");
              // Kaynaksız kalemin payı (`remainder`) eklenmezse satır
              // düzenlemek o kalemin besinini sessizce siler.
              setDraft(toDraft(roundNutrition(addNutrition(nutrition, remainder))));
            }}
          />
        )}

        {/* Other Nutrition Facts List (Diğer Besin Değerleri) */}
        <div className="space-y-2.5 pt-2">
          <div className="text-sm font-bold text-white/90">{t("nutrition.otherNutrients")}</div>
          <p className="text-[11px] text-white/40">{t("nutrition.emptyMeansUnknown")}</p>
          <div className="space-y-2">
            {/* Doymuş Yağ */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.satFat")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.satFat ?? ""}
                  onChange={(v) => updateField("satFat", v)}
                  placeholder="—"
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">g</span>
              </div>
            </div>
            {/* Sodyum */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.sodium")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.sodium ?? ""}
                  onChange={(v) => updateField("sodium", v)}
                  placeholder="—"
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">mg</span>
              </div>
            </div>
            {/* Lif */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.fiber")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.fiber ?? ""}
                  onChange={(v) => updateField("fiber", v)}
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">g</span>
              </div>
            </div>
            {/* Şeker */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 flex items-center justify-between text-xs sm:text-sm">
              <span className="font-medium text-white/80">{t("nutrition.sugar")}</span>
              <div className="flex items-center gap-1">
                <EditableStat
                  value={draft.sugar ?? ""}
                  onChange={(v) => updateField("sugar", v)}
                  placeholder="—"
                  className="font-extrabold text-white text-right w-14"
                />
                <span className="font-extrabold text-white/40">g</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Width Bottom Save Button */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-app flex-none">
        <button
          type="button"
          onClick={handleApplySave}
          className="w-full py-4 rounded-full bg-white text-black font-extrabold text-base hover:bg-white/90 transition shadow-xl active:scale-[0.98]"
        >
          {t("meal.save")}
        </button>
      </div>
    </div>
  );
}
