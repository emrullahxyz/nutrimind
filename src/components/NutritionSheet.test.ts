// ============================================================================
// scaleMealNutrition — NutritionSheet'in porsiyon ölçekleyicisi.
//
// Aç-kaydet sözleşmesi: çarpan 1 iken fonksiyon HİÇBİR ŞEYİ yuvarlamamalı —
// `.toFixed(1)` turu 2 ondalıklı makroyu sessizce 1 ondalığa tırnaklar ve
// `fromDraft` o tırnaklanmış değeri DB'ye geri yazar (8.75 → 8.8). Yuvarlama
// yalnızca stepper ölçeklemesinde (m ≠ 1) meşru.
// ============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  addSkeletonLine,
  canRemoveLine,
  isManualDraftLine,
  lineUpdateFor,
  resetLineState,
  scaleMealNutrition,
  setManualAmount,
} from "./NutritionSheet";
import { ZERO_NUTRITION } from "../types";
import {
  canEditGrams,
  draftGramHint,
  draftLineFromAlias,
  draftLinesToItems,
  mealDraftLines,
  setDraftGrams,
  swapDraftLine,
} from "../lib/ingredientDraft";
import type { Alias, MealItem } from "../types";
import type { DraftLine } from "../lib/ingredientDraft";

// ============================================================================
// "Malzeme ekle" state kurulumu — `addSkeletonLine` + `resetLineState`.
//
// Hata: `addRow()` `newDraftLine(aliases[0])` çağırıyordu, yani kullanıcıya
// HAFIZANIN İLK BESİNİ dayatılıyordu; seçim ekranı yoktu. Artık boş iskelet
// satır açılıyor ve seçim o satırda açılıyor. Satırın dört dalı saf
// fonksiyonlarla karar veriyor: `isManualDraftLine` (elle satır mı),
// `canRemoveLine` (silme düğmesi), `lineUpdateFor` (gramaj hangi yola gider).
// ============================================================================

const tavuk: Alias = {
  id: "a1",
  triggers: ["tavuk"],
  name: "Tavuk",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
};

const pilav: Alias = {
  id: "a2",
  triggers: ["pilav"],
  name: "Pilav",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 130, protein: 4, carbs: 28, fat: 0.4, fiber: 0.6 },
};

const ALIASES: Alias[] = [tavuk, pilav];

/** Kırılımı olan tek kalemli öğün — `mealDraftLines` null döndürmesin. */
const MEAL: MealItem = {
  id: "m1",
  label: "Akşam",
  computed: { kcal: 330, protein: 62, carbs: 56, fat: 7.2, fiber: 1.2 },
  sources: [{ aliasId: "a1", qty: 200, unit: "g" }],
};

/** "Malzeme ekle" sonrası iskelet satır (picker açık, içerik yok). */
function skeletonLine(): DraftLine {
  const { lines } = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
  return lines[lines.length - 1];
}

/** Kaydedilmiş ELLE kalem: `sources` yok → `itemsToDraftLines` kayıt yolu
 *  (`fromRecord: true`, `nutritionGrams = items[].grams`). */
const SAVED_MANUAL: MealItem = {
  id: "m3",
  label: "Akşam",
  computed: { ...ZERO_NUTRITION, kcal: 225 },
  items: [{ name: "Ev yapımı sos", nutrition: { ...ZERO_NUTRITION, kcal: 225 }, grams: 100 }],
};

describe("addSkeletonLine — rastgele besin yerine boş iskelet", () => {
  it("eklenen satır blank + aliasId null (hafızanın ilk besini DOLDURULMAZ)", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);
    const added = lines[lines.length - 1];

    expect(added.blank).toBe(true);
    expect(added.aliasId).toBeNull();
    expect(added.name).toBe("");
    // Eski hata buradaydı: aliases[0] (tavuk) otomatik gelirdi.
    expect(added.aliasId).not.toBe(tavuk.id);
  });

  it("satır KAYDA girmez — iskelet malzeme değildir (draftLinesToItems düşürür)", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);
    const added = lines[lines.length - 1];
    const withoutAdded = lines.filter((l) => l.key !== added.key);

    expect(draftLinesToItems([added])).toHaveLength(0);
    // Mevcut kalemler etkilenmez: iskelet eklenince kayıt aynı kalır.
    expect(draftLinesToItems(lines)).toEqual(draftLinesToItems(withoutAdded));
  });

  it("mevcut satırlara dokunmaz, sona ekler", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);

    expect(lines).toHaveLength(base.length + 1);
    expect(lines.slice(0, base.length)).toEqual(base);
  });

  it("pickerFor, YENİ satırın key'idir (seçim ekranı o satırda açılır)", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines, pickerFor } = addSkeletonLine(base);
    const added = lines[lines.length - 1];

    expect(pickerFor).toBe(added.key);
    expect(pickerFor).not.toBe(base[0].key);
  });

  it("her eklemede YENİ key (picker eski satırda kalmaz)", () => {
    const once = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    const twice = addSkeletonLine(once.lines);

    expect(twice.pickerFor).not.toBe(once.pickerFor);
    expect(twice.lines).toHaveLength(once.lines.length + 1);
  });

  it("iskelet satır EKLEMEK alias'sız satırın üstüne de aynı sözleşmeyi korur", () => {
    const once = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    const twice = addSkeletonLine(once.lines);
    const added = twice.lines[twice.lines.length - 1];

    expect(added.blank).toBe(true);
    expect(added.aliasId).toBeNull();
    expect(twice.pickerFor).toBe(added.key);
  });
});

describe("resetLineState — öğün değişince satır içi ekranlar kapanır", () => {
  it("pickerFor null'a döner (açık seçim yeni öğüne sızmaz)", () => {
    const afterAdd = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    expect(afterAdd.pickerFor).not.toBeNull();

    const fresh = resetLineState(MEAL, ALIASES);
    expect(fresh.pickerFor).toBeNull();
  });

  it("swapKey de sıfırlanır", () => {
    const fresh = resetLineState(MEAL, ALIASES);
    expect(fresh.swapKey).toBeNull();
  });

  it("satırlar yeni öğünden türetilir (kayıttan gelir, elle eklenenler gider)", () => {
    const { lines } = addSkeletonLine(mealDraftLines(MEAL, ALIASES)!);
    expect(lines).toHaveLength(2); // kayıt kalemi + iskelet

    const fresh = resetLineState(MEAL, ALIASES);
    expect(fresh.lines).toHaveLength(1);
    expect(fresh.lines![0].aliasId).toBe("a1");
  });

  it("kırılımsız öğünde satır null kalır (bölüm çizilmez, mevcut kural)", () => {
    const sourcesuz: MealItem = { id: "m2", label: "Su", computed: { ...ZERO_NUTRITION } };
    expect(resetLineState(sourcesuz, ALIASES).lines).toBeNull();
  });
});

describe("iskelet satırın ölçülebilir tabanı yoktur (elle satır kuralları)", () => {
  it("alias'sız iskelet makro olarak boştur — uydurma besin değeri taşımaz", () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines } = addSkeletonLine(base);
    const added = lines[lines.length - 1];

    expect(added.nutrition).toEqual(ZERO_NUTRITION);
    expect(added.grams).toBe(0);
    expect(added.preserved).toBe(false);
    expect(added.manualMeasured).toBe(false);
  });
});

// ============================================================================
// Dört dallı satır ekranının KARAR MANTIĞI — `isManualDraftLine`.
//
// Render'ın kendisi test edilemez (projede jsdom yok); ekranın hangi dalı
// çizeceğine karar veren koşul saflaştırılıp burada doğrudan sınanıyor.
// Kaynak: `TemplatePreview.tsx:287` — aynı koşul, aynı gerekçe.
// ============================================================================
describe("isManualDraftLine — hangi satır elle?", () => {
  /** Dört bayrağın dört kombinasyonu: elle / hafızaya bağlı. */
  const row = (
    aliasId: string | null,
    preserved: boolean,
    fromRecord: boolean,
  ): Pick<DraftLine, "aliasId" | "preserved" | "fromRecord"> => ({
    aliasId,
    preserved,
    fromRecord,
  });

  it("aliasId null + korunmamış + kayıttan değil = ELLE (ad + makro alanları açılır)", () => {
    expect(isManualDraftLine(row(null, false, false))).toBe(true);
  });

  it("hafızaya bağlı satır elle DEĞİLDİR (ad + 5 alan açılmaz, kayıt adı korunur)", () => {
    expect(isManualDraftLine(row(tavuk.id, false, false))).toBe(false);
  });

  it("korunmuş satır elle DEĞİLDİR (kayıttan geldi, gramajı çözülemedi)", () => {
    expect(isManualDraftLine(row(null, true, false))).toBe(false);
  });

  it("KAYITTAN gelen satır elle DEĞİLDİR — `preserved` düşse bile", () => {
    // Ölçülen hata: korunmuş kaleme gramaj yazılınca `preserved` düşer,
    // `aliasId` zaten null olduğu için satır elle sayılır ve kayıttaki gerçek
    // ad "MALZEME ADI" alanına düşer.
    expect(isManualDraftLine(row(null, false, true))).toBe(false);
  });
});

describe("dört dallı satır ekranı — iskelet satırın geçişleri", () => {
  /** "Malzeme ekle" sonrası iskelet satır. */
  const skeleton = () => {
    const base = mealDraftLines(MEAL, ALIASES)!;
    const { lines, pickerFor } = addSkeletonLine(base);
    return { lines, pickerFor, line: lines[lines.length - 1] };
  };

  it("'Elle gir' (picker kapanır) iskeleti elle satıra çevirir — alanlar açılır", () => {
    const { line } = skeleton();
    // `setPickerFor(null)` render'ın dalını değiştirir; bayraklara dokunmaz.
    expect(isManualDraftLine(line)).toBe(true);
    // Kullanıcı henüz bir şey yazmadı: kayda giremez (iskelet malzeme değil).
    expect(draftLinesToItems([line])).toHaveLength(0);
  });

  it("elle satıra AD yazmak tek başına kayda yeterli DEĞİLDİR (makro da gerekir)", () => {
    const { line } = skeleton();
    const named = { ...line, name: "Ev yapımı sos" };

    // Ad yazıldı, `blank` bayrağı DURUYOR: besin hafıza ile BAĞLANMADI.
    expect(named.blank).toBe(true);
    expect(isManualDraftLine(named)).toBe(true); // alanlar açık kalır
    expect(draftLinesToItems([named])).toHaveLength(0);
  });

  it("makro girmek satırı kayda sokar (`manualMeasured` blank'i kırar)", () => {
    const { line } = skeleton();
    const typed = {
      ...line,
      name: "Ev yapımı sos",
      nutrition: { ...ZERO_NUTRITION, kcal: 200, protein: 4 },
      manualMeasured: true,
    };

    const items = draftLinesToItems([typed]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Ev yapımı sos");
    expect(items[0].nutrition.kcal).toBe(200);
    // `aliasId` null → uydurma gramaj YAZILMAZ.
    expect(items[0].sources).toBeUndefined();
    expect(items[0].grams).toBeUndefined();
  });

  it("picker'dan besin seçmek iskeleti bağlar: `blank` düşer, elle alanları kapanır", () => {
    const { line } = skeleton();
    const bound = swapDraftLine(line, tavuk);

    expect(bound.blank).toBe(false);
    expect(bound.aliasId).toBe(tavuk.id);
    expect(bound.name).toBe(tavuk.name);
    // Bağlanan satır elle satır DEĞİLDİR — "ad + 5 makro" alanları kapanır.
    expect(isManualDraftLine(bound)).toBe(false);
    // Gramaj henüz yazılmadı: ölçülebilir kalem DEĞİLDİR, kayda girmez
    // (eskiden olduğu gibi `aliases[0]` gelirdi ve kayda uydurma besin yazardı).
    expect(draftLinesToItems([bound])).toHaveLength(0);
  });

  it("bağlanan iskelet satır gramaj alanı AÇIKTIR (ölçülebilir taban kurulur)", () => {
    const { line } = skeleton();
    const bound = swapDraftLine(line, tavuk);

    expect(canEditGrams(bound)).toBe(true);
    // Miktar girilince satır kayda girer ve makro `serving_g`'ye (100 g)
    // oranlanır: 165 kcal × 200/100 = 330.
    const measured = setDraftGrams(bound, "200", tavuk);
    expect(measured.nutrition.kcal).toBe(330);

    const items = draftLinesToItems([measured]);
    expect(items).toHaveLength(1);
    expect(items[0].sources).toEqual([{ aliasId: tavuk.id, qty: 200, unit: bound.unit }]);
  });
});

// ============================================================================
// REVIEW DÜZELTMESİ 1 — elle satır SİLİNEMİYORDU.
//
// Çöp düğmesi metin dalının `<>` fragment'inin İÇİNDE kalmıştı. Elle satırın
// `aliasId`'si kalıcı olarak null'dur, yani satır kalıcı olarak elle daldadır ve
// düğmeye asla ulaşamazdı: `removeRow` çalışır, düğme ÇİZİLMEZ.
// Düğme artık dal zincirinin KARDEŞİ; görünürlük kuralı `canRemoveLine`.
// ============================================================================
describe("canRemoveLine — silme düğmesi hangi satırda görünür?", () => {
  const row = { key: "l1" };
  const other = { key: "l2" };

  it("elle satırda da görünür (ad + makro girildikten sonra erişilebilir kalmalı)", () => {
    // `aliasId: null` + `blank: false` → tam elle satır. Düğme YOKSA yanlış
    // kalem kullanıcı tarafından hiçbir zaman silinemez.
    const typed = { ...skeletonLine(), name: "Ev yapımı sos", manualMeasured: true };
    expect(typed.aliasId).toBeNull();
    expect(isManualDraftLine(typed)).toBe(true);
    expect(canRemoveLine(typed, null, 2)).toBe(true);
  });

  it("düz metin satırında görünür", () => {
    expect(canRemoveLine(row, null, 2)).toBe(true);
  });

  it("başka satırın swap ekranı açıkken de görünür (koruma satıra özeldir)", () => {
    expect(canRemoveLine(row, other.key, 2)).toBe(true);
  });

  it("kendi satırının swap ekranı açıkken GİZLER (picker yerini almıştır)", () => {
    expect(canRemoveLine(row, row.key, 2)).toBe(false);
  });

  it("son satır SİLİNEMEZ — malzemesiz 'yemek' kaydedilmemeli", () => {
    expect(canRemoveLine(row, null, 1)).toBe(false);
  });
});

// ============================================================================
// REVIEW DÜZELTMESİ 2 (round 2) — elle satırda gramaj ÖLÇEKLEME PATLAMASI.
//
// İlk düzeltme (kilitle) yanlıştı: "önce makro, sonra miktar" sırası dayatırken
// `setDraftGrams` elle daldaki tuş-başına patlamayı yeniden açtı. ÖLÇÜLEN kırılma
// (225 kcal / 5 protein, elle satır):
//
//     qty=1    nutritionGrams=1  kcal=225    protein=5
//     qty=10   nutritionGrams=1  kcal=2250   protein=50
//     qty=100  nutritionGrams=1  kcal=22500  protein=500   ← "100 g" yazdı
//
// `setDraftGrams` ilk geçerli gramajı taban yapıp tabanı değiştirmiyor
// (`ingredientDraft.ts:366-384`), sonraki tuşlar `base > 0` dalına düşüyor.
// Bu, `ingredientDraft.ts:372-374`'te belgelenen canlı bug'ın aynısı.
// Doğru davranış: elle girilen makro NİHAİDİR — gramaj yalnız etikettir.
// ============================================================================
describe("setManualAmount — elle satırda gramaj ETİKETTİR, makroya dokunmaz", () => {
  /** Elle satır + kullanıcının yazdığı makro (arayüzün yaptığı patch). */
  const manual = () => ({
    ...skeletonLine(),
    name: "Ev yapımı sos",
    nutrition: { ...ZERO_NUTRITION, kcal: 225, protein: 5 },
    manualMeasured: true,
  });

  it("gramaj girmek makroyu DEĞİŞTİRMEZ (100 g yazınca hâlâ 225 kcal)", () => {
    const next = setManualAmount(manual(), "100");

    expect(next.nutrition.kcal).toBe(225);
    expect(next.nutrition.protein).toBe(5);
    // Taban kurulMAZ → ölçekleme için referans yok → sonraki tuşlar da çarpamaz.
    expect(next.nutritionGrams).toBe(0);
    expect(next.manualMeasured).toBe(true);
    expect(next.grams).toBe(100);
  });

  it("TUŞ-BAŞINA PATLAMA YOK — 1 → 10 → 100 yazınca değer sabit kalır", () => {
    // Patlamanın kendisi `setManualAmount` dokümanında kayıtlıdır; burada
    // yalnız DOĞRU davranış sabitlenir. `setDraftGrams`'ın hatalı çıktısını
    // (225 → 2250 → 22500) beklenen değer olarak yazmak KİLTTİ — ileride o
    // bug gerçekten düzeltilirse doğru davranış "regresyon" gibi görünürdü.
    const after1 = setManualAmount(manual(), "1");
    const after10 = setManualAmount(after1, "10");
    const after100 = setManualAmount(after10, "100");

    expect([after1.nutrition.kcal, after10.nutrition.kcal, after100.nutrition.kcal]).toEqual([
      225, 225, 225,
    ]);
    expect([
      after1.nutrition.protein,
      after10.nutrition.protein,
      after100.nutrition.protein,
    ]).toEqual([5, 5, 5]);
    expect(after100.grams).toBe(100); // etiket doğru
    expect(after100.nutritionGrams).toBe(0); // ama ölçekleme tabanı HİÇ kurulmadı
  });

  it("yazdığını sandığı değer kaybolmaz — ekranda ne varsa kayda o girer (L20)", () => {
    const next = setManualAmount(manual(), "100");
    const items = draftLinesToItems([next]);

    expect(items).toHaveLength(1);
    // `draftLinesToItems` elle satırda `grams`'ı `items[].grams` olarak yazar.
    expect(items[0].grams).toBe(100);
    expect(items[0].nutrition.kcal).toBe(225);
    // `sources` yazılmaz (`aliasId` null) → uydurma hafıza bağı yok.
    expect(items[0].sources).toBeUndefined();
  });

  it("geçersiz/boş gramaj gramajı 0 yapar, makro yine DEĞİŞMEZ", () => {
    for (const text of ["", "abc", "-5", "0"]) {
      const next = setManualAmount(manual(), text);
      expect(next.grams).toBe(0);
      expect(next.nutrition.kcal).toBe(225);
      expect(next.qty).toBe(text); // yarım yazım korunur, titreme yok
    }
  });

  it("virgüllü gramaj tr-TR ayrımını parseNum çözer (150,5 g)", () => {
    expect(setManualAmount(manual(), "150,5").grams).toBe(150.5);
  });
});

// ============================================================================
// RE-REVIEW DÜZELTMESİ 1 — JSX BAĞLANTISININ REGRESYON TESTİ YOKTU.
//
// `onChange` içindeki ternary testler tarafından GÖRÜLMEZ: JSX elle dalda
// `setDraftGrams`'a geri dönerse patlama sessizce gelir ve testler yeşil
// kalır (ölçüldü — 1314 test yeşil kaldı). Dal seçimi artık saf fonksiyonda:
// `lineUpdateFor`. JSX `onChange` yalnız onu çağırır.
// ============================================================================
describe("lineUpdateFor — gramaj değişikliği hangi yola gider?", () => {
  /** Taze elle satır + kullanıcının yazdığı makro. */
  const manual = () => ({
    ...skeletonLine(),
    name: "Ev yapımı sos",
    nutrition: { ...ZERO_NUTRITION, kcal: 225, protein: 5 },
    manualMeasured: true,
  });

  it("elle satır → setManualAmount yolu: gramaj yazılır, `nutrition` DEĞİŞMEZ", () => {
    const next = lineUpdateFor(manual(), "100", null);

    expect(next.grams).toBe(100);
    expect(next.qty).toBe("100");
    expect(next.nutrition.kcal).toBe(225); // ölçeklenmedi
    expect(next.nutrition.protein).toBe(5);
    expect(next.nutritionGrams).toBe(0); // taban kurulmadı → patlama imkânsız
  });

  it("elle satır: 1 → 10 → 100 dizgisi makroyu SABİT tutar (patlama regresyonu)", () => {
    const a = lineUpdateFor(manual(), "1", null);
    const b = lineUpdateFor(a, "10", null);
    const c = lineUpdateFor(b, "100", null);

    expect(c.nutrition.kcal).toBe(225);
    expect(c.nutrition.protein).toBe(5);
    expect(c.grams).toBe(100);
  });

  it("alias satırı → setDraftGrams yolu: gramaj ÖLÇEKLER", () => {
    // `draftLineFromAlias` 100 g/serving → 165 kcal taban.
    const bound = draftLineFromAlias(tavuk, "100", "g")!;
    const next = lineUpdateFor(bound, "200", tavuk);

    expect(next.grams).toBe(200);
    expect(next.nutrition.kcal).toBe(330); // 165 × 200/100
  });

  it("alias'sız ama KAYITTAN gelen satır → setDraftGrams yolu (ölçekleme çalışır)", () => {
    // Bilinçli AYRIM: aynı ekranda iki davranış. Taze iskelet gramaja
    // duyarsız, kayıtlı elle kalem duyarlı (round-trip).
    const saved = mealDraftLines(SAVED_MANUAL, ALIASES)![0];
    expect(isManualDraftLine(saved)).toBe(false);

    const next = lineUpdateFor(saved, "200", null);
    expect(next.nutrition.kcal).toBe(450); // 225 × 200/100
  });
});

// ============================================================================
// REGRESYON — AYNI PATLAMA İKİ YÜZEYDE YAŞADI (`TemplatePreview`).
//
// Ölçülen: şablon önizlemesi `setDraftGrams`'ı DOĞRUDAN çağırıyordu, elle
// satır koşulu da satır satır kopyalanmıştı (`line.aliasId === null && …`).
// Sonuç: gün öğününde çözülmüş patlama ŞABLONDA sessizce canlıydı —
//   225 kcal elle satır → qty=1 → 225 · qty=10 → 2250 · qty=100 → 22500
//
// Saf-fonksiyon testleri JSX'in hangi yola BAĞLANDIĞINI görmüyor; o yüzden
// aşağıdaki kapı HEM saf seçiciyi hem de TemplatePreview'ın kaynağını tarar:
// ikisinden biri eski kalırsa (elle dalda `setDraftGrams`, kopya koşul)
// patlama ürüne çıkamaz.
// ============================================================================
const TEMPLATE_PREVIEW_SRC = readFileSync(
  join(process.cwd(), "src", "components", "TemplatePreview.tsx"),
  "utf8",
);

describe("TemplatePreview yüzeyi — patlama regresyonu (NutritionSheet ile ortak seçici)", () => {
  /** Şablon ekranının elle satırı: iskelet + kullanıcının yazdığı makro.
   *  NutritionSheet testindekiyle AYNI veri — iki yüzey de aynı satırı
   *  aynı kuralla yönetmeli. */
  const manual = () => ({
    ...skeletonLine(),
    name: "Ev yapımı sos",
    nutrition: { ...ZERO_NUTRITION, kcal: 225, protein: 5 },
    manualMeasured: true,
  });

  it("elle satır → makro SABİT: 1 → 10 → 100 dizgisi patlatmaz", () => {
    const a = lineUpdateFor(manual(), "1", null);
    const b = lineUpdateFor(a, "10", null);
    const c = lineUpdateFor(b, "100", null);

    expect([a.nutrition.kcal, b.nutrition.kcal, c.nutrition.kcal]).toEqual([225, 225, 225]);
    expect([a.nutrition.protein, b.nutrition.protein, c.nutrition.protein]).toEqual([5, 5, 5]);
    expect(c.grams).toBe(100);
    // Patlamayı mümkün kılan şey tabanın kurulmasıydı — kurulmuyor.
    expect(c.nutritionGrams).toBe(0);
  });

  it("elle satır: kayda giren değer gramajla tutarlı (L20)", () => {
    const items = draftLinesToItems([lineUpdateFor(manual(), "100", null)]);
    expect(items[0].grams).toBe(100);
    expect(items[0].nutrition.kcal).toBe(225);
  });

  it("alias satırı → gramaj ÖLÇEKLER (elle dalı tüm satırlara yayılmıyor)", () => {
    const bound = draftLineFromAlias(tavuk, "100", "g")!;
    expect(lineUpdateFor(bound, "200", tavuk).nutrition.kcal).toBe(330);
  });

  it("ŞABLON EKRANI da ortak seçiciyi kullanıyor (`lineUpdateFor`, doğrudan `setDraftGrams` DEĞİL)", () => {
    // JSX `onChange`'in gövdesi: `lineUpdateFor(line, …)` çağrısı ŞART.
    expect(TEMPLATE_PREVIEW_SRC).toContain("lineUpdateFor(line, v, alias ?? null)");
    // Elle satırın doğrudan ölçekleyiciye gitmesi patlamanın kendisidir.
    expect(TEMPLATE_PREVIEW_SRC).not.toMatch(/setDraftGrams\s*\(\s*line\s*,/);
  });

  it("ŞABLON EKRANI elle satır koşulunu KOPYALAMIYOR (`isManualDraftLine` kullanıyor)", () => {
    expect(TEMPLATE_PREVIEW_SRC).toContain("isManualDraftLine(line)");
    // Koşul satır satır kopyalanırsa iki yüzey sessizce ayrışır (oldu).
    expect(TEMPLATE_PREVIEW_SRC).not.toMatch(/aliasId\s*===\s*null\s*&&\s*!\s*line\.preserved/);
  });

  it("elle satırda 'ölçeklendi' ipucu GÖSTERİLMEZ (makro ölçeklenmiyor)", () => {
    // `draftGramHint` elle satırda ölçekleme bildirmemeli: 100 g yazıldığı
    // halde 225 kcal sabit kalıyorsa "ölçeklendi" yazmak hatayı görünür kılar.
    // Makrosu dolu olduğu için "besin değerini gir" uyarısı da yanlış olur —
    // o da bir geri bildirim uydurması, o yüzden SESSİZ kalır.
    const onceki = lineUpdateFor(manual(), "10", null);
    const sonraki = lineUpdateFor(onceki, "100", null);
    expect(draftGramHint(sonraki, null, onceki)).toBeNull();
    // Makrosu henüz olmayan elle satırda uyarı DOĞRU: değer girilmeli.
    expect(draftGramHint(lineUpdateFor(skeletonLine(), "100", null), null, skeletonLine())).toEqual(
      {
        kind: "noNutrition",
      },
    );
    // Kayıttan gelen elle kalem ise ÖLÇEKLER ve ipucu "scaled" olur.
    const saved = mealDraftLines(SAVED_MANUAL, ALIASES)![0];
    expect(draftGramHint(lineUpdateFor(saved, "200", null), null, saved)).toEqual({
      kind: "scaled",
      fromGrams: 100,
      toGrams: 200,
    });
  });
});

describe("elle satır sadece YENİ eklenen iskeletlerdir (kayıt karışmaz)", () => {
  it("kayıttan gelen ELLE kalem `fromRecord` taşır → elle dalına GİRMEZ", () => {
    const saved = mealDraftLines(SAVED_MANUAL, ALIASES)![0];
    expect(saved.fromRecord).toBe(true);
    expect(saved.aliasId).toBeNull();
    expect(saved.nutrition.kcal).toBe(225);
    // Kritik: kayıtlı elle kalem `setManualAmount` yoluna GİRMEZ, eski
    // ölçeklemeli yoldan geçer — kayıt davranışı korunur.
    expect(isManualDraftLine(saved)).toBe(false);
  });

  it("kayıtlı elle kalemin gramajı zaten ölçülebilir (ölçekleme referansı var)", () => {
    const saved = mealDraftLines(SAVED_MANUAL, ALIASES)![0];
    // `nutritionGrams = items[].grams` → 200 g yazılınca makro ölçeklenir.
    expect(saved.nutritionGrams).toBe(100);
    expect(canEditGrams(saved)).toBe(true);
    expect(setDraftGrams(saved, "200", null).nutrition.kcal).toBe(450); // 225 × 2
  });

  it("iskelet satır `fromRecord` taşımaz → yeni yol burada çalışır", () => {
    const line = skeletonLine();
    expect(line.fromRecord).toBe(false);
    expect(isManualDraftLine(line)).toBe(true);
  });
});

describe("scaleMealNutrition — aç-kaydet sözleşmesi (m=1 kayıpsız)", () => {
  it("m=1 iken 2 ondalıklı makrolar KORUNUR (8.75 → 8.8 DEĞİL)", () => {
    const out = scaleMealNutrition(
      { kcal: 320, protein: 12.34, carbs: 8.75, fat: 3.25, fiber: 1.05 },
      1,
    );
    expect(out.carbs).toBe(8.75);
    expect(out.fat).toBe(3.25);
    expect(out.protein).toBe(12.34);
    expect(out.fiber).toBe(1.05);
    expect(out.kcal).toBe(320);
  });

  it("m=1 iken girilmemiş mikro 'bilinmiyor' kalır (undefined → 0 değil)", () => {
    const base = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2 };
    const out = scaleMealNutrition(base, 1);
    expect(out.sodium).toBeUndefined();
    expect(out.sugar).toBeUndefined();
    expect(out.satFat).toBeUndefined();
  });

  it("m=1 iken girilmiş mikro korunur", () => {
    const base = {
      kcal: 100,
      protein: 10,
      carbs: 20,
      fat: 5,
      fiber: 2,
      sodium: 1400,
      sugar: 12.25,
    };
    const out = scaleMealNutrition(base, 1);
    expect(out.sodium).toBe(1400);
    expect(out.sugar).toBe(12.25);
  });

  it("m=1 ve computed yoksa ZERO_NUTRITION döner (çekirdek 0, mikro yok)", () => {
    const out = scaleMealNutrition(undefined, 1);
    expect(out).toEqual(ZERO_NUTRITION);
  });
});

describe("scaleMealNutrition — stepper ölçeklemesi (m ≠ 1)", () => {
  it("m=2 makroyu 1 ondalığa yuvarlar, kcal'i Math.round'lar", () => {
    const out = scaleMealNutrition(
      { kcal: 320.4, protein: 12.34, carbs: 8.75, fat: 3.25, fiber: 1.05 },
      2,
    );
    expect(out.kcal).toBe(641); // Math.round(320.4 × 2)
    expect(out.protein).toBe(24.7); // 24.68 → toFixed(1)
    expect(out.carbs).toBe(17.5);
    expect(out.fat).toBe(6.5);
  });

  it("m=0.75 ondalıklı çarpanı 1 ondalığa yuvarlar", () => {
    const out = scaleMealNutrition({ kcal: 100, protein: 10, carbs: 8.75, fat: 5, fiber: 2 }, 0.75);
    expect(out.carbs).toBe(6.6); // 8.75 × 0.75 = 6.5625 → 6.6
    expect(out.kcal).toBe(75); // Math.round(100 × 0.75)
  });

  it("m ≠ 1 iken mikro ölçeklenir ve sodyum yuvarlanır", () => {
    const out = scaleMealNutrition(
      { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2, sodium: 1400 },
      1.5,
    );
    expect(out.sodium).toBe(2100); // Math.round(1400 × 1.5)
  });
});
