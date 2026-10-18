// ============================================================================
// scaleMealNutrition — NutritionSheet'in porsiyon ölçekleyicisi.
//
// Aç-kaydet sözleşmesi: çarpan 1 iken fonksiyon HİÇBİR ŞEYİ yuvarlamamalı —
// `.toFixed(1)` turu 2 ondalıklı makroyu sessizce 1 ondalığa tırnaklar ve
// `fromDraft` o tırnaklanmış değeri DB'ye geri yazar (8.75 → 8.8). Yuvarlama
// yalnızca stepper ölçeklemesinde (m ≠ 1) meşru.
// ============================================================================
import { describe, expect, it } from "vitest";
import {
  addSkeletonLine,
  canEnterManualGrams,
  canRemoveLine,
  isManualDraftLine,
  resetLineState,
  scaleMealNutrition,
} from "./NutritionSheet";
import { ZERO_NUTRITION } from "../types";
import {
  canEditGrams,
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
// satır açılıyor ve seçim o satırda açılıyor (`isManualDraftLine`,
// `canRemoveLine`, `canEnterManualGrams` ile dört dala ayrılan JSX).
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
// REVIEW DÜZELTMESİ 2 — gramaj makro ÖNCESİ yazılırsa oran bozuluyordu (L20).
//
// Tuzak: elle satırda miktar ve makro alanları aynı anda açıksa kullanıcı önce
// gramajı yazabiliyordu. `setDraftGrams` alias-null dalına düşüyor
// (`ingredientDraft.ts:385`), `nutrition`/`nutritionGrams`'a dokunmuyordu,
// `manualMeasured` yazılmıyordu. Sonra makro girilince yalnız `nutrition`
// yazılıyordu: "100 g" + "200 kcal" kayda giriyor, taban 0 kalıyor ve sonraki
// miktar değişiklikleri makroyu HİÇ ölçeklemiyordu.
// Düzeltme: elle satırda miktar alanı makro girilene kadar kilitli.
// ============================================================================
describe("canEnterManualGrams — miktar alanı ne zaman açılır?", () => {
  it("iskelet/elle satırda KAPALI (makro önce girilmeli)", () => {
    const line = skeletonLine();
    expect(canEnterManualGrams(line)).toBe(false);
    // Alan görünür ama kilitli: `NumField disabled` → `onChange` ÇAĞRILMAZ,
    // yani yazdığını sandığı değer sessizce kaybolmaz (FormBits sözleşmesi).
    expect(canEditGrams(line)).toBe(true); // amaç: sıralama kapısı
  });

  it("makro girilince (`manualMeasured`) alan AÇILIR", () => {
    const typed = { ...skeletonLine(), manualMeasured: true };
    // `canEnterManualGrams` elle satırda hep false'tur; alanı açan şey
    // bayraktır, koşul değil (aşağıdaki bileşik kapı testinde doğrulanır).
    expect(canEnterManualGrams(typed)).toBe(false);
    expect(typed.manualMeasured).toBe(true);
  });

  it("hafızaya bağlı satırda AÇIK — taban alias'tan gelir, sıralama gerekmez", () => {
    expect(canEnterManualGrams(swapDraftLine(skeletonLine(), tavuk))).toBe(true);
  });

  it("KAYITTAN gelen satırda AÇIK — gramaj kayıttan ölçülebilir", () => {
    expect(canEnterManualGrams(mealDraftLines(MEAL, ALIASES)![0])).toBe(true);
  });
});

describe("elle satırda miktar → makro ORANI kurulur (L20 sırası)", () => {
  /** Elle satır + kullanıcının yazdığı makro (arayüzün yaptığı patch). */
  const manual = (nutrition: Record<string, number>) => ({
    ...skeletonLine(),
    name: "Ev yapımı sos",
    nutrition: { ...ZERO_NUTRITION, ...nutrition },
    manualMeasured: true,
  });

  it("ÖNERİLEN sıra: makro → miktar. Taban kurulur, oran bütün kalır", () => {
    const first = setDraftGrams(manual({ kcal: 225, protein: 5 }), "100", null);
    expect(first.nutrition.kcal).toBe(225); // kullanıcının yazdığı değer KORUNUR
    expect(first.nutritionGrams).toBe(100); // ilk geçerli gramaj taban olur

    const scaled = setDraftGrams(first, "200", null);
    expect(scaled.nutrition.kcal).toBe(450); // 225 × 200/100
    expect(scaled.nutrition.protein).toBe(10);
  });

  it("TUAZAK: miktar → makro sırası oranı KURAMAZ (bileşik kapı bunu engeller)", () => {
    // Engelleyici koşulun gerekçesi: makro bayrağı OLMADAN önce miktar
    // yazılırsa taban kurulmaz, makro sonradan yazılır ve sonraki miktar
    // değişikliği makroyu 1× bırakır (ölçeklenmez): 200 g'da hâlâ 225 kcal.
    const gramsFirst = setDraftGrams(skeletonLine(), "100", null);
    expect(gramsFirst.manualMeasured).toBe(false);
    expect(gramsFirst.nutritionGrams).toBe(0); // taban kurulMADI

    const withMacro = { ...gramsFirst, nutrition: { ...ZERO_NUTRITION, kcal: 225 } };
    const later = setDraftGrams(withMacro, "200", null);
    expect(later.nutrition.kcal).toBe(225); // 450 DEĞİL — ölçeklenmedi
  });

  it("bileşik kapı: elle satırda miktar alanı ancak makro bayrağı açınca yazılabilir", () => {
    const before = skeletonLine();
    // Arayüzdeki `disabled` koşulu birebir:
    const locked = !canEditGrams(before) || (!before.manualMeasured && !canEnterManualGrams(before));
    expect(locked).toBe(true); // makro girilmeden miktar YAZILAMAZ

    const after = manual({ kcal: 225 });
    const unlocked = !canEditGrams(after) || (!after.manualMeasured && !canEnterManualGrams(after));
    expect(unlocked).toBe(false); // makro girildi → alan açık
  });
});

describe("scaleMealNutrition — aç-kaydet sözleşmesi (m=1 kayıpsız)", () => {
  it("m=1 iken 2 ondalıklı makrolar KORUNUR (8.75 → 8.8 DEĞİL)", () => {
    const out = scaleMealNutrition({ kcal: 320, protein: 12.34, carbs: 8.75, fat: 3.25, fiber: 1.05 }, 1);
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
    const base = { kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2, sodium: 1400, sugar: 12.25 };
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
    const out = scaleMealNutrition({ kcal: 320.4, protein: 12.34, carbs: 8.75, fat: 3.25, fiber: 1.05 }, 2);
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
    const out = scaleMealNutrition({ kcal: 100, protein: 10, carbs: 20, fat: 5, fiber: 2, sodium: 1400 }, 1.5);
    expect(out.sodium).toBe(2100); // Math.round(1400 × 1.5)
  });
});
