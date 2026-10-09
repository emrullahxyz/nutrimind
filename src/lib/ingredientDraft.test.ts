import { describe, expect, it } from "vitest";
import {
  __setDraftFlag,
  addDraftLine,
  aliasOfLine,
  draftGramHint,
  draftLineFromAlias,
  draftLinesToItems,
  hasUnnamedItem,
  mealToBasketSeed,
  newDraftLine,
  removeDraftLine,
  resolveDraftUnit,
  setDraftGrams,
  sumLineNutrition,
  swapDraftLine,
} from "./ingredientDraft";
import type { DraftLine } from "./ingredientDraft";
import type { Alias, MealItem, Nutrition } from "../types";

const tavuk: Alias = {
  id: "a1",
  triggers: ["tavuk"],
  name: "Tavuk",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
};

const tofu: Alias = {
  id: "a2",
  triggers: ["tofu"],
  name: "Tofu",
  brand: null,
  serving_g: 100,
  nutrition: { kcal: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3 },
};

// M1: hedef alias'ın KENDİ özel birimi olsun ki swap'in gram→birim çevrimi
// gerçekten sınansın. İki de "g" ise dönüşüm aritmetiği silinse de test geçer.
// Birim adı BÜYÜK harfle ("Dilim"): hem defaultUnit hem eşleştirme tr-TR küçük
// harfe inmeden bu test kırmızıya döner (Q1'in asıl kanıtı).
const ekmekDilim: Alias = {
  id: "a3",
  triggers: ["ekmek"],
  name: "Ekmek",
  brand: null,
  serving_g: 50,
  units: [{ name: "Dilim", grams: 25 }],
  defaultUnit: "Dilim",
  nutrition: { kcal: 250, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7 },
};

/** Çözülebilen birimle çağrıların satır döndürdüğünü doğrular. */
function line(result: DraftLine | null): DraftLine {
  expect(result).not.toBeNull();
  return result as DraftLine;
}

describe("resolveDraftUnit", () => {
  it("alias'ın kendi birimini kanonik adıyla döner", () => {
    expect(resolveDraftUnit(ekmekDilim, "Dilim")).toEqual({ name: "Dilim", grams: 25 });
  });

  it("yalnız büyük/küçük harf ve boşluk farkını normalleştirir", () => {
    expect(resolveDraftUnit(ekmekDilim, " dilim ")).toEqual({ name: "Dilim", grams: 25 });
  });

  it("gram her zaman seçenektedir", () => {
    expect(resolveDraftUnit(tavuk, "G")).toEqual({ name: "g", grams: 1 });
  });

  // Q1 (fix round 2): bilinmeyen ad TAHMİN EDİLMEZ.
  it("bilinmeyen birim adını null döner (varsayılana düşmez)", () => {
    expect(resolveDraftUnit(ekmekDilim, "kase")).toBeNull();
  });

  it("boş birim adını null döner", () => {
    expect(resolveDraftUnit(ekmekDilim, "   ")).toBeNull();
  });

  // Sessiz varsayılan ölçümün geri gelmesini engelleyen asıl test.
  //
  // Fixture seçimi önemli: `ekmekDilim`in varsayılanı "Dilim", bu yüzden
  // onunla "grama düşmez" demek hiçbir şey kanıtlamaz — sessiz düşüş de
  // "Dilim" döndürür. `tavuk`un özel birimi YOK, yani varsayılanı gerçekten
  // "g"; düşüş geri gelirse burada {name:"g"} çıkar ve test kırılır.
  it("varsayılanı 'g' olan alias'ta bile gram OLARAK çözülmez", () => {
    expect(resolveDraftUnit(tavuk, "kase")).toBeNull();
  });

  // Aynı ayrım, özel birimli alias üzerinden: sessiz düşüş "Dilim" verirdi.
  it("bilinmeyen ad, alias'ın varsayılanına da düşmez", () => {
    expect(resolveDraftUnit(ekmekDilim, "kase")).toBeNull();
    expect(resolveDraftUnit(ekmekDilim, "kase")).not.toEqual({ name: "Dilim", grams: 25 });
  });
});

describe("newDraftLine", () => {
  it("alias verilirse ondan satır üretir", () => {
    const l = newDraftLine(tavuk);
    expect(l.aliasId).toBe("a1");
    expect(l.name).toBe("Tavuk");
    expect(l.unit).toBe("g");
  });

  it("alias yoksa elle satır üretir (aliasId null, makro sıfır)", () => {
    const l = newDraftLine(undefined);
    expect(l.aliasId).toBeNull();
    expect(l.name).toBe("");
    expect(l.qty).toBe("");
    expect(l.grams).toBe(0);
    expect(l.nutrition.kcal).toBe(0);
  });

  // `blank`: "Malzeme ekle" düğmesi bunu açar — henüz HİÇBİR BESİNE bağlı
  // olmayan, kaydedilemeyen bir iskelet. Ad yazmak bağı değildir.
  it("alias yoksa blank TRUE'dur (isimsiz iskelet kayda giremez)", () => {
    expect(newDraftLine(undefined).blank).toBe(true);
    expect(newDraftLine(undefined).manualMeasured).toBe(false);
  });

  it("ad yazılmış boş elle satır bile blank kalır (isim bağlamaz)", () => {
    const named = { ...newDraftLine(undefined), name: "Peynir" };
    expect(named.blank).toBe(true);
  });

  it("alias'lı satır blank FALSE'dur", () => {
    expect(newDraftLine(tavuk).blank).toBe(false);
  });

  // Boş miktar ölçülmediği için redde düşmez; satır alias'ın varsayılan birimini alır.
  it("alias'ın varsayılan özel birimini boş satırda da kullanır", () => {
    const l = newDraftLine(ekmekDilim);
    expect(l.unit).toBe("Dilim");
    expect(l.grams).toBe(0);
  });
});

describe("draftLineFromAlias", () => {
  it("miktarı grama çevirir ve makroyu ölçekler", () => {
    const l = line(draftLineFromAlias(tavuk, "150", "g"));
    expect(l.grams).toBe(150);
    expect(l.nutrition.kcal).toBe(247.5);
  });

  it("tr-TR virgülü de kabul eder", () => {
    expect(line(draftLineFromAlias(tavuk, "12,5", "g")).grams).toBe(12.5);
  });

  it("geçersiz gramaj mevcut makroyu SIFIRLAMAZ (yazma sırasında titreme)", () => {
    const base = line(draftLineFromAlias(tavuk, "150", "g"));
    const typed = setDraftGrams(base, "", tavuk);
    expect(typed.grams).toBe(0);
    expect(typed.nutrition.kcal).toBe(247.5);
  });

  // Q3: `fallback` gerçek bir parametre — Task 2 çağırıyor.
  it("geçersiz gramajda fallback makroyu korur (ZERO_NUTRITION DEĞİL)", () => {
    const onceki: Nutrition = { kcal: 330, protein: 62, carbs: 0, fat: 7.2, fiber: 0 };
    const l = line(draftLineFromAlias(tavuk, "", "g", onceki));
    expect(l.grams).toBe(0);
    expect(l.nutrition).toEqual(onceki);
  });

  it("geçersiz gramajda fallback verilmediyse ZERO_NUTRITION", () => {
    expect(line(draftLineFromAlias(tavuk, "", "g")).nutrition.kcal).toBe(0);
  });

  it("özel birimde miktarı gramaj çevirir", () => {
    const l = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    expect(l.grams).toBe(100);
    expect(l.nutrition.kcal).toBe(500); // 250 kcal / 50 g × 100 g
  });

  // Q1'in yarısı kaldı: normalleşme. Büyük/küçük harf + boşluk farkı çözülür.
  it("birim eşleşmesi tr-TR küçük harfe duyarlıdır (' dilim ' == 'Dilim')", () => {
    const l = line(draftLineFromAlias(ekmekDilim, "4", " dilim "));
    expect(l.unit).toBe("Dilim"); // kanonik ad geri yazıldı
    expect(l.grams).toBe(100);
  });

  // ---- fix round 2: sessiz varsayılan ölçümün YERİNE reddetme ----

  // Asıl reddetme testi: `kase`, ekmeğin birimi değil. Ne grama ne dilime
  // düşülür — satır hiç üretilmez (draftLineFromAlias'in null sözleşmesi).
  it("bilinmeyen birimde null döner: gram OLARAK da ÖLÇMEZ", () => {
    expect(draftLineFromAlias(ekmekDilim, "2", "kase")).toBeNull();
  });

  it("bilinmeyen birim ölçülmediği için fallback da KULLANILMAZ", () => {
    const onceki: Nutrition = { kcal: 330, protein: 62, carbs: 0, fat: 7.2, fiber: 0 };
    expect(draftLineFromAlias(ekmekDilim, "2", "kase", onceki)).toBeNull();
  });

  it("bilinmeyen birim, özel birimi olmayan alias'ta da reddedilir", () => {
    expect(draftLineFromAlias(tavuk, "2", "kase-dolusu")).toBeNull();
  });

  it("yalnız normalleşme farkı reddedilmez (küçük harf çözülür)", () => {
    expect(draftLineFromAlias(ekmekDilim, "2", "KASE")).toBeNull(); // gerçekten farklı ad
    expect(draftLineFromAlias(ekmekDilim, "2", "dilim")).not.toBeNull(); // aynı ad
  });
});

describe("setDraftGrams", () => {
  it("yeni gramaja göre makroyu yeniden hesaplar", () => {
    const l = setDraftGrams(line(draftLineFromAlias(tavuk, "150", "g")), "300", tavuk);
    expect(l.grams).toBe(300);
    expect(l.nutrition.kcal).toBe(495);
  });

  it("elle yazılan metni qty olarak korur (virgüllü girilim kaybolmaz)", () => {
    const l = setDraftGrams(line(draftLineFromAlias(tavuk, "100", "g")), "12,5", tavuk);
    expect(l.qty).toBe("12,5");
    expect(l.grams).toBe(12.5);
  });

  // Q1'in yarısı: hesap bu birimle yapıldığı için çözülen ad GÖRÜNÜR.
  it("çözülen birimi satırda görünür kılar", () => {
    const l = setDraftGrams(line(draftLineFromAlias(ekmekDilim, "4", "dilim")), "6", ekmekDilim);
    expect(l.unit).toBe("Dilim");
    expect(l.grams).toBe(150);
    expect(l.nutrition.kcal).toBe(750); // 250 kcal / 50 g × 150 g
  });

  // ---- fix round 2: reddedilen birim ----
  // ---- fix round 3: red HEP-TEK: satır qty dâhil HİÇ değişmez ----

  it("birim çözülemezse satıra HİÇ dokunmaz (qty dâhil)", () => {
    const base = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    base.unit = "kase"; // alias artık tanımıyor (birim silinmiş)
    const after = setDraftGrams(base, "6", ekmekDilim);

    expect(after).toEqual(base); // qty, grams, unit, nutrition — hepsi aynı
    expect(after.qty).toBe("4"); // "6" YAZILMADI (round 2'deki kısmi güncelleme)
    expect(after.grams).toBe(100); // 6 × 25 = 150 DEĞİL — hiç ölçülmedi
    expect(after.nutrition.kcal).toBe(500);
    expect(after.unit).toBe("kase"); // birim UYDURULMADI
  });

  // Round 2'deki asıl bozulma: qty güncellenip makro korunuyordu, ve
  // draftLinesToItems bunu olduğu gibi `sources`'a yazıyordu.
  it("reddedilen birimde qty ile makro AYRI ÖLÇÜM anlatmaz (L20)", () => {
    const base = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    base.unit = "kase";
    const after = setDraftGrams(base, "6", ekmekDilim);
    const [item] = draftLinesToItems([after]);
    // Saklanan qty hâlâ "4" → saklanan makro 4 × 25 g ile tutarlı.
    expect(item.sources).toEqual([{ aliasId: "a3", qty: 4, unit: "kase" }]);
    expect(item.nutrition.kcal).toBe(500); // 250 kcal/50 g × 100 g
  });

  it("birim çözülemezse varsayılan birime düşmez (2 dilim = 50 g DEĞİL)", () => {
    const base = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    base.unit = "kase";
    const after = setDraftGrams(base, "2", ekmekDilim);
    expect(after.grams).not.toBe(50);
    expect(after.grams).not.toBe(2);
    expect(after.grams).toBe(100);
    expect(after.qty).toBe("4");
  });

  it("alias'ın tanımadığı birim, normalleşme değil reddedilir", () => {
    const base = line(draftLineFromAlias(tavuk, "150", "g"));
    base.unit = "KASE"; // farklı ad, sadece büyük harf
    expect(setDraftGrams(base, "2", tavuk).grams).toBe(150);
  });

  // Çağıran reddi önceden görür: gösterim katmanı bu yüzden setDraftGrams'i
  // hiç çağırmaz. Sözleşmenin "tespit edilebilirlik" yarısı.
  it("çağıran reddi resolveDraftUnit ile ÖNCEDEN görebilir", () => {
    const base = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    base.unit = "kase";
    const resolvable = resolveDraftUnit(ekmekDilim, base.unit);
    expect(resolvable).toBeNull();
    // Çözülemiyorsa çağıran uyarır ve setter'ı çağırmaz.
    expect(base.qty).toBe("4");
  });

  // Q2 + Q4: alias yok — elle satır, gram cinsinden ölçülür.
  it("alias null iken makroyu korur, gram cinsinden ölçer", () => {
    const onceki: Nutrition = { kcal: 90, protein: 0, carbs: 0, fat: 10, fiber: 0 };
    const manual = newDraftLine(undefined);
    manual.nutrition = onceki;
    const l = setDraftGrams(manual, "10", null);
    expect(l.qty).toBe("10");
    expect(l.grams).toBe(10); // 1x çarpan YOK: 10 (g)
    expect(l.unit).toBe("g");
    expect(l.nutrition).toEqual(onceki); // bu modül elle satırın makrosunu UYDURMAZ
  });

  // Q2: "adet" gibi elle yazılmış metin 1 g yapılmaz.
  it("alias null iken elle yazılan birim adı 1 g olarak SAYILMAZ", () => {
    const manual = newDraftLine(undefined);
    manual.unit = "adet";
    const l = setDraftGrams(manual, "2", null);
    expect(l.unit).toBe("g");
    expect(l.grams).toBe(2); // "2 adet = 2 g" DEĞİL, 2 birim gram
  });

  // Q4: alias null + geçersiz metin.
  it("alias null ve geçersiz metin: makro yine korunur, grams sıfırlanır", () => {
    const onceki: Nutrition = { kcal: 90, protein: 0, carbs: 0, fat: 10, fiber: 0 };
    const manual = newDraftLine(undefined);
    manual.nutrition = onceki;
    const l = setDraftGrams(manual, "", null);
    expect(l.qty).toBe("");
    expect(l.grams).toBe(0);
    expect(l.nutrition).toEqual(onceki);
  });
});

describe("swapDraftLine", () => {
  it("gramı korur, makroyu yeni besinden hesaplar", () => {
    const l = swapDraftLine(line(draftLineFromAlias(tavuk, "150", "g")), tofu);
    expect(l.grams).toBe(150);
    expect(l.aliasId).toBe("a2");
    expect(l.name).toBe("Tofu");
    expect(l.nutrition.kcal).toBe(114);
  });

  it("miktarı yeni alias'ın varsayılan birimine çevirir", () => {
    const l = swapDraftLine(line(draftLineFromAlias(tavuk, "150", "g")), tofu);
    expect(l.unit).toBe("g");
    expect(l.qty).toBe("150");
  });

  // M1: gerçek gram→birim çevrimi. 150 g = 6 dilim (25 g/dilim).
  it("gramı hedef alias'ın ÖZEL birimine çevirir (150 g = 6 dilim)", () => {
    const l = swapDraftLine(line(draftLineFromAlias(tavuk, "150", "g")), ekmekDilim);
    expect(l.unit).toBe("Dilim");
    expect(l.qty).toBe("6");
    expect(l.grams).toBe(150);
    expect(l.nutrition.kcal).toBe(750);
  });

  // Swap satırın anahtarını korumalı — yerinde değişim, yeniden mount yok.
  it("satır anahtarını korur (yerinde değişim)", () => {
    const base = line(draftLineFromAlias(tavuk, "150", "g"));
    expect(swapDraftLine(base, tofu).key).toBe(base.key);
  });

  // `blank` → false: swap BESİN BAĞLAR (picker'da "Elle gir" ya da hafızadan
  // seçim çıkışının kendisi). blank satırın swap'ı, sayaç satıra "bağlı"
  // der.
  it("blank satırın swap'ı blank'ı düşürür (besin bağlandı)", () => {
    const bos = newDraftLine(undefined);
    const swapped = swapDraftLine(bos, tavuk);
    expect(swapped.aliasId).toBe("a1");
    expect(swapped.blank).toBe(false);
    expect(swapped.preserved).toBe(false);
  });
});

describe("addDraftLine / removeDraftLine", () => {
  // M2: uzunluk tek başına sırayı kanıtlamaz.
  it("add SONA ekler", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    const result = addDraftLine([a], b);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });

  it("remove key ile siler", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    expect(removeDraftLine([a, b], b.key)).toEqual([a]);
  });

  it("remove yabancı key'i etkilemez", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    expect(removeDraftLine([a, b], "yok")).toEqual([a, b]);
  });
});

describe("draftLinesToItems", () => {
  it("alias satırlarını sources ile yazar", () => {
    const items = draftLinesToItems([line(draftLineFromAlias(tavuk, "150", "g"))]);
    expect(items).toHaveLength(1);
    expect(items[0].sources).toEqual([{ aliasId: "a1", qty: 150, unit: "g" }]);
  });

  it("0 gramajlı alias satırını ATAR (anlamsız kayıt)", () => {
    expect(draftLinesToItems([line(draftLineFromAlias(tavuk, "", "g"))])).toHaveLength(0);
  });

  it("elle satır sources ÜRETMEZ", () => {
    const manual = newDraftLine(undefined);
    manual.name = "Zeytinyağı";
    manual.qty = "10";
    manual.grams = 10;
    manual.nutrition = { kcal: 90, protein: 0, carbs: 0, fat: 10, fiber: 0 };
    const items = draftLinesToItems([manual]);
    expect(items[0].sources).toBeUndefined();
    expect(items[0].name).toBe("Zeytinyağı");
  });

  // Kaydedilen qty, kullanıcının gördüğü ham metinden parse edilir.
  it("sources.qty ham metinden parse edilir (virgüllü giriş kaydı)", () => {
    const items = draftLinesToItems([line(draftLineFromAlias(ekmekDilim, "1,5", "Dilim"))]);
    expect(items[0].sources).toEqual([{ aliasId: "a3", qty: 1.5, unit: "Dilim" }]);
  });
});

// ---- preserved: kayıttan gelip ÖLÇÜLEMEYEN kalem ----
// Ruling 2-A'nın amacı: çözülemeyen kalem SİLİNMEZ. `preserved` bunu bir
// alanla yapar; `grams: 0` "ölçüldü ve sıfır" anlamına geldiği için aynı
// satırı hem ölçülmemiş hem kayda girmiş yapmak zorundaydı.
describe("preserved", () => {
  const kayitli: Nutrition = { kcal: 300, protein: 62, carbs: 0, fat: 7.2, fiber: 0 };

  /** TemplatePreview'in 2-A fallback satırının birebir şekli. */
  function korunmus(): DraftLine {
    return {
      key: "draft-manual-0-Tavuk göğsü",
      aliasId: null,
      name: "Tavuk göğsü",
      qty: "",
      unit: "g",
      grams: 0,
      nutrition: kayitli,
      nutritionGrams: 0,
      preserved: true,
      manualMeasured: false,
      blank: false, // korunmuş satır: kayıttan gelir, iskelet değil
      fromRecord: true, // kayıttan geldi (korunmuş)
    };
  }

  it("grams 0 olsa da kayıtta KALIR (ad + makro birebir)", () => {
    const items = draftLinesToItems([korunmus()]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Tavuk göğsü");
    expect(items[0].nutrition).toEqual(kayitli);
  });

  it("kaynak UYDURMAZ — kaydedilen kayıt eskisiyle aynı (yalnız ad + makro)", () => {
    expect(draftLinesToItems([korunmus()])[0].sources).toBeUndefined();
  });

  // Bu, 2-A'nın kendi değişikliğinin koruması: `preserved` koşulu olmadan
  // filtre kullanıcının SİLDİĞİ satırları da kaydetmeye başlardı.
  it("preserved DEĞİLSE 0 gramajlı satır yine ATILIR (kullanıcı sildi)", () => {
    const temizlenmis = line(draftLineFromAlias(tavuk, "150", "g"));
    const sifirlandi = { ...temizlenmis, qty: "", grams: 0 };
    expect(sifirlandi.preserved).toBe(false);
    expect(draftLinesToItems([sifirlandi])).toHaveLength(0);
  });

  // blank: isimsiz iskelet kayda GİRMEZ — "Malzeme ekle" satırı içerik
  // girmeden "şablonu güncelle" kutulu kaydedilirse `name:""` kalemi
  // yazılmaz.
  it("blank (isimsiz elle) satır KAYDA GİRMEZ — iskelet malzeme değil", () => {
    expect(draftLinesToItems([newDraftLine(undefined)])).toHaveLength(0);
    // Ad yazılsa bile blank kalır — tek başına ad bağlamaz.
    const sadeceAd = { ...newDraftLine(undefined), name: "X" };
    expect(draftLinesToItems([sadeceAd])).toHaveLength(0);
  });

  it("AI'ın blank AI satırı da kayda girmez (gramaj yok, blank)", () => {
    const aiBos = { ...newDraftLine(undefined), key: "draft-ai-1", name: "Kayısı" };
    expect(draftLinesToItems([aiBos])).toHaveLength(0);
  });

  // Gerçek `addAIItems`: gramajsız AI bonu `preserved:true` (korunur),
  // blank DEĞİL — içeriği gerçek. İskelet, isimsiz boş satırdır.
  it("gramajsız AI satırı preserved:true, blank:false → KAYDA GİRER", () => {
    const aiKorunan = {
      ...newDraftLine(undefined),
      key: "draft-ai-2",
      name: "Kayısı",
      preserved: true,
      blank: false, // `addAIItems` blank'i false kurar (içerik gerçektir)
    };
    const items = draftLinesToItems([aiKorunan]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Kayısı");
  });

  it("ölçülebilir hale gelince preserved DÜŞER (artık korunan değil, ölçülen)", () => {
    const olculen = setDraftGrams(korunmus(), "200", null);
    expect(olculen.preserved).toBe(false);
    expect(olculen.grams).toBe(200);
    expect(olculen.qty).toBe("200");
  });

  // ---- fromRecord: ölçülen hata (2026-10-03 tarayıcı ölçümü) ----
  // Şablondan gelen iki kaynaklı kalem korunmuş (`preserved: true`) olarak
  // açılır. Kullanıcı gramajı yazar → satır ÖLÇÜLEBİLİR olur, `preserved`
  // düşer. `fromRecord` YAZILMAZSA satır `aliasId: null` + `preserved: false`
  // olur ve `TemplatePreview` onu ELLE sayar: kullanıcının girmediği kayıt
  // adı "MALZEME ADI" alanına düşer, beş makro alanı açılır. Miktar kaybolur.
  it("korunmuş satır gramaj alınca fromRecord KALIR (elle satıra dönmez)", () => {
    const olculen = setDraftGrams(korunmus(), "250", null);
    expect(olculen.fromRecord).toBe(true);
    expect(olculen.preserved).toBe(false);
    expect(olculen.grams).toBe(250);
  });

  it("korunmuş satırın swap'ı fromRecord KORUR (kayıttan gelen kayıttan kalır)", () => {
    const swapped = swapDraftLine(korunmus(), tofu);
    expect(swapped.fromRecord).toBe(true);
    expect(swapped.blank).toBe(false);
  });

  it("elle girilen satır fromRecord:false kalır", () => {
    expect(elleSatir().fromRecord).toBe(false);
    expect(newDraftLine(undefined).fromRecord).toBe(false);
    expect(line(draftLineFromAlias(tavuk, "150", "g")).fromRecord).toBe(false);
  });

  it("newDraftLine / draftLineFromAlias preserved:false üretir", () => {
    expect(newDraftLine(undefined).preserved).toBe(false);
    expect(newDraftLine(tavuk).preserved).toBe(false);
    // alias'lı ÖLÇÜLEN satır korunmuş SAYILMAZ: makrosu ölçülmüş gerçek bir
    // miktardan geliyor, gramajı bilinmiyor değil. (alias dalındaki
    // `preserved: false` mutasyona uğrarsa burada kırılır.)
    const olculen = line(draftLineFromAlias(tavuk, "150", "g"));
    expect(olculen.preserved).toBe(false);
    expect(olculen.grams).toBe(150);
    // ÖLÇÜLEN satırın swap'ı da korunmuşluk üretmez (miktarı var, korunacak
    // bir şey yok). Korunmuş satırın swap'ı ise KORUR — ayrı testte.
    expect(swapDraftLine(olculen, tofu).preserved).toBe(false);
    // Ölçülü satır `blank:FALSE` — bir besine bağlı/ölçülmüş, iskelet değil.
    expect(olculen.blank).toBe(false);
  });

  it("reddedilen birim preserved değiştirmez (satıra hiç dokunulmaz)", () => {
    const base = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    base.unit = "kase";
    expect(setDraftGrams(base, "6", ekmekDilim).preserved).toBe(false);
  });

  // ---- manualMeasured: kullanıcı ELLE ad + makro girdi ----
  // `preserved`'in karşıtı. `preserved` = "kayıttan geldi, gramaj çözülemedi";
  // `manualMeasured` = "kullanıcı ölçtü, gramaj vermedi". İkisi de `grams: 0`
  // taşır ve ikisi de kayda girer, ama anlamları farklı: elle girilen makro
  // için "Miktar bilinmiyor" yazmak YANLIŞ (gramaj sorulmadı, bilinmiyor
  // değil), `sources` yine yazılmaz (ölçülmüş miktar iddiası olurdu).
  const elle: Nutrition = { kcal: 200, protein: 3, carbs: 5, fat: 10, fiber: 0 };

  function elleSatir(): DraftLine {
    return {
      key: "draft-manual-0-Sos",
      aliasId: null,
      name: "Ev yapımı sos",
      qty: "",
      unit: "g",
      grams: 0,
      nutrition: elle,
      nutritionGrams: 0,
      preserved: false,
      manualMeasured: true,
      blank: false, // elle DOLU satır: iskelet değil
      fromRecord: false, // elle girildi
    };
  }

  it("grams 0 olsa da kayıtta KALIR — kullanıcının yazdığı makro kaybolmaz", () => {
    const items = draftLinesToItems([elleSatir()]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Ev yapımı sos");
    expect(items[0].nutrition).toEqual(elle);
  });

  it("kaynak UYDURMAZ (aliasId yok — miktar iddiası olmaz)", () => {
    expect(draftLinesToItems([elleSatir()])[0].sources).toBeUndefined();
  });

  // Mikrobesin korunur mu? `draftLinesToItems` `roundNutrition` uygular;
  // `undefined` ("bilinmiyor") alanları 0'a ÇEVİRMEMELİ — bileşenler arası
  // dönüşüm (TemplatePreview'deki fromDraft) mikrobesinleri kaybetmemeli.
  it("elle satırda mikrobesin (sodyum) korunur — 'bilinmiyor' 0'a düşmez", () => {
    const sodyumlu = {
      ...elleSatir(),
      nutrition: { ...elle, sodium: 400 },
      nutritionGrams: 0,
      key: "draft-manual-1-Sos-tuzlu",
    };
    const items = draftLinesToItems([sodyumlu]);
    expect(items[0].nutrition.sodium).toBe(400);
    expect(items[0].nutrition.fiber).toBe(0); // ana makro: 0 gerçek değer
  });

  it("preserved'in TERSİ: iki bayrak da false ise 0 gramajlı satır ATILIR", () => {
    const hicbiri = { ...elleSatir(), manualMeasured: false };
    expect(draftLinesToItems([hicbiri])).toHaveLength(0);
  });

  // blank düşünce kayıt YAZILIR (blank kayıt kapısı).
  it("blank düşen elle satır kayda girer (manualMeasured kapısı)", () => {
    const dolu = __setDraftFlag({ ...elleSatir(), blank: true }, { manualMeasured: true });
    const items = draftLinesToItems([dolu]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Ev yapımı sos");
  });

  it("gramaj girilince elle-makro bayrağı KORUNUR — miktar alanı elle makroyu geçersiz kılmaz", () => {
    // Ölçüldü: bayrağı burada düşürmek alanları kapatıyordu, kullanıcı
    // protein/karb/yağ/lif'i de giremiyordu (görünür tuzak). Gramajı
    // temizlemek "malzemeyi silmek" değil, sadece miktarı kaldırmaktır.
    const gramajli = setDraftGrams(elleSatir(), "250", null);
    expect(gramajli.manualMeasured).toBe(true);
    expect(gramajli.grams).toBe(250);
    // Miktar alanı boşaltılsa bile satır KAYDA GİRER (elle makro hâlâ geçerli).
    const temizlenmis = setDraftGrams(elleSatir(), "", null);
    expect(temizlenmis.manualMeasured).toBe(true);
    expect(draftLinesToItems([temizlenmis])).toHaveLength(1);
  });

  it("korunmuş satır elle-girilmiş sayılmaz (farklı anlam)", () => {
    expect(korunmus().preserved).toBe(true);
    expect(korunmus().manualMeasured).toBe(false);
  });

  // ---- grams: alias'sız satırın gramajı kayda GİRER ----
  // Gramaj normalde `sources[].qty` içinde yaşar; ama `sources` bir `aliasId`
  // ister ve kullanıcının elle girdiği / AI'ın döndüğü besin hafızada
  // olmayabilir. O satırlarda miktar alanı görünür ama kayda girmiyordu:
  // kullanıcı 100 g yazıp kaydediyor, şablonu açtığında "Miktar bilinmiyor"
  // yazıyordu. `TemplateItem.grams` bu boşluğu kapatır.
  it("alias'sız satır gramajını `grams` olarak yazar (kayıpsız round-trip)", () => {
    const gramajli = setDraftGrams(elleSatir(), "100", null);
    const items = draftLinesToItems([gramajli]);
    expect(items).toHaveLength(1);
    expect(items[0].grams).toBe(100);
    expect(items[0].sources).toBeUndefined();
  });

  it("alias'LI satır `grams` YAZMAZ — miktar zaten `sources[].qty` içinde", () => {
    // İki kopyadan biri güncellenip diğeri eskirse kayıt kendi içinde
    // tutarsızlaşır: kullanıcı 200 g yazdığında `sources.qty` 200 olur,
    // `grams` 100 kalırsa hangisinin doğru olduğu belli olmaz.
    const items = draftLinesToItems([line(draftLineFromAlias(tavuk, "150", "g"))]);
    expect(items[0].sources?.[0]).toEqual({ aliasId: tavuk.id, qty: 150, unit: "g" });
    expect(items[0].grams).toBeUndefined();
  });

  it("grams 0 veya negatifse YAZILMAZ (uydurma miktar)", () => {
    expect(draftLinesToItems([elleSatir()])[0].grams).toBeUndefined();
    const negatif = setDraftGrams(elleSatir(), "0", null);
    expect(draftLinesToItems([negatif])[0].grams).toBeUndefined();
  });

  it("swap elle-makro bayrağını düşürür (besin değişti, ölçüm değişti)", () => {
    expect(swapDraftLine(elleSatir(), tavuk).manualMeasured).toBe(false);
  });

  // Swap, KORUNMUŞ bir satırın miktarını ÖĞRETMEZ. Besin değişir, miktar
  // bilinmemeye devam eder: `preserved` true kalır, `grams` 0 kalır, kayıtlı
  // gerçek makro korunur. Kullanıcı miktarı YAZDIĞINDA satır ölçülebilir olur.
  //
  // Daha önce swap `preserved: false` yazıyordu; filtre satırı düşürüyor ve
  // "korun → besine bağla → kaydet" yolu malzemeyi SİLİYORDU. Preserved
  // alanının var oluş sebebi olan L21 hatası, kendi kurtarma yolumuzda.
  it("swap korunmuş satırı korur: miktar hâlâ bilinmiyor, kayıt KAYBOLMAZ", () => {
    const swapped = swapDraftLine(korunmus(), tofu);
    expect(swapped.preserved).toBe(true); // besin değişti, miktar bilinmiyor
    expect(swapped.aliasId).toBe("a2"); // besin BAĞLANDI
    expect(swapped.name).toBe("Tofu");
    expect(swapped.grams).toBe(0);
    // Makro silinmez: 0 g'den ölçeklemek kayıtlı değerleri 0'a düşürürdü.
    expect(swapped.nutrition).toEqual(kayitli);
    // Asıl önemlisi: kayda giriyor.
    const items = draftLinesToItems([swapped]);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Tofu");
    expect(items[0].nutrition).toEqual(kayitli);
  });

  // Korunmuş bir satır kaydedilirken `sources` YAZMAZ: alias'ı var ama
  // ölçülebilir miktarı yok, dolayısıyla uydurma bir kaynak üretmek yanlış
  // olurdu (miktar bilinmiyor — kaydedilecek bir miktar da yok).
  it("korunmuş satır swap sonrası da sources UYDURMAZ", () => {
    expect(draftLinesToItems([swapDraftLine(korunmus(), tofu)])[0].sources).toBeUndefined();
  });

  // Çıkış yolu hâlâ çalışır: bağlandıktan sonra miktar girilince satır
  // ölçülür, bayrak düşer ve bu kez kaynak gerçekten yazılır.
  it("miktar girilince korunmuş satır ÖLÇÜLÜR ve kaynak yazılır", () => {
    const swapped = swapDraftLine(korunmus(), tofu);
    expect(swapped.preserved).toBe(true); // önce hâlâ korunmuş
    const measured = setDraftGrams(swapped, "150", tofu);
    expect(measured.preserved).toBe(false);
    expect(measured.grams).toBe(150);
    const items = draftLinesToItems([measured]);
    expect(items).toHaveLength(1);
    expect(items[0].sources).toEqual([{ aliasId: "a2", qty: 150, unit: "g" }]);
  });

  // setDraftGrams'in ALIAS dalı `{ ...line }` yayılımı yaptığı için, gelen
  // satır `preserved: true` taşıyorsa yazmazsa DEĞERİYLE taşır. Bu test
  // ölçülen alias satırında alanın AÇIKÇA sıfırlandığını sabitler — yayılım
  // bir gün korunmuş bir satırı taşımaya başlarsa kırılır.
  it("setDraftGrams alias dalı korunmuşluğu AÇIKÇA sıfırlar (yayılıma bırakmaz)", () => {
    const korunmusGibi = { ...korunmus(), aliasId: "a1", unit: "g", qty: "100" };
    expect(korunmusGibi.preserved).toBe(true);
    const olculen = setDraftGrams(korunmusGibi, "150", tavuk);
    expect(olculen.preserved).toBe(false);
    expect(olculen.grams).toBe(150);
  });
});

describe("draftGramHint", () => {
  function aliasliSatir(qty = "90"): DraftLine {
    return draftLineFromAlias(tavuk, qty, "g", undefined) as DraftLine;
  }

  it("hafızaya bağlı satırda miktar değişince ölçeklendiğini bildirir", () => {
    const onceki = aliasliSatir("90");
    const sonraki = setDraftGrams(onceki, "45", tavuk);
    expect(draftGramHint(sonraki, tavuk, onceki)).toEqual({
      kind: "scaled",
      fromGrams: 90,
      toGrams: 45,
    });
  });

  it("elle girilen kalemde 'hafızada yok' uyarısı verir", () => {
    const onceki: DraftLine = {
      key: "k",
      aliasId: null,
      name: "Ev yapımı sos",
      qty: "90",
      unit: "g",
      grams: 90,
      nutrition: { kcal: 225, protein: 1, carbs: 8, fat: 20, fiber: 1 },
      nutritionGrams: 0,
      preserved: false,
      manualMeasured: false,
      blank: false,
      fromRecord: false,
    };
    const sonraki = setDraftGrams(onceki, "45", null);
    // Makro BİLEREK değişmez (ölçeklemek uydurma olurdu) — ipucu bunu söyler.
    expect(sonraki.nutrition.kcal).toBe(225);
    expect(draftGramHint(sonraki, null, onceki)).toEqual({ kind: "noNutrition" });
  });

  it("kayıttan gelip çözülemeyen satırda 'birim tanınmıyor' uyarısı verir", () => {
    const onceki: DraftLine = {
      key: "k",
      aliasId: null,
      name: "Silinmiş besin",
      qty: "90",
      unit: "g",
      grams: 90,
      nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 },
      nutritionGrams: 0,
      preserved: false,
      manualMeasured: false,
      blank: false,
      fromRecord: true,
    };
    expect(draftGramHint(setDraftGrams(onceki, "45", null), null, onceki)).toEqual({
      kind: "noNutrition",
    });
  });

  it("miktar değişmediyse veya yeni satırda sessiz kalır", () => {
    const satir = aliasliSatir("90");
    expect(draftGramHint(satir, tavuk, satir)).toBeNull();
    expect(draftGramHint(satir, tavuk, null)).toBeNull();
  });
});

describe("hafızada olmayan kalemde grama göre ölçekleme", () => {
  /** 100 g için 225 kcal yazılmış, kayıttan gelen korunmuş kalem. */
  function kayitliKalem(): DraftLine {
    return {
      key: "k",
      aliasId: null,
      name: "Ev yapımı sos",
      qty: "100",
      unit: "g",
      grams: 100,
      nutrition: { kcal: 225, protein: 1, carbs: 8, fat: 20, fiber: 1 },
      nutritionGrams: 100,
      preserved: true,
      manualMeasured: false,
      blank: false,
      fromRecord: true,
    };
  }

  it("miktarı yarıya indirince makro da yarıya iner", () => {
    const sonraki = setDraftGrams(kayitliKalem(), "50", null);
    expect(sonraki.grams).toBe(50);
    expect(sonraki.nutrition.kcal).toBe(112.5);
    expect(sonraki.nutrition.fat).toBe(10);
  });

  it("taban KORUNUR: 50'ye inip 100'e dönünce değerler geri gelir", () => {
    const yarisi = setDraftGrams(kayitliKalem(), "50", null);
    const tamami = setDraftGrams(yarisi, "100", null);
    expect(tamami.nutrition.kcal).toBe(225);
  });

  it("elle girilen makronun tabanı ilk geçerli gramajdır (100 g/225 kcal → 200 g/450 kcal)", () => {
    const elle: DraftLine = {
      ...kayitliKalem(),
      qty: "",
      grams: 0,
      nutritionGrams: 0,
      preserved: false,
      manualMeasured: true,
      fromRecord: false,
    };
    const yuz = setDraftGrams(elle, "100", null);
    expect(yuz.nutritionGrams).toBe(100);
    expect(yuz.nutrition.kcal).toBe(225); // kendi değeri korunur

    const ikiYuz = setDraftGrams(yuz, "200", null);
    expect(ikiYuz.nutrition.kcal).toBe(450);
  });

  it("geçersiz gramajda değerler ESKİ kalır (titreme olmaz), satır kayda giremez", () => {
    const satir = kayitliKalem();
    for (const bozuk of ["", "abc", "-5"]) {
      const sonraki = setDraftGrams(satir, bozuk, null);
      expect(sonraki.grams).toBe(0);
      expect(sonraki.nutrition.kcal).toBe(225);
      // Kullanıcının sildiği miktar kayda GİREMEZ.
      expect(draftLinesToItems([sonraki])).toEqual([]);
    }
  });

  it("makrosu olmayan elle satırda gramaj taban kurmaz", () => {
    const bos = newDraftLine(undefined);
    const sonraki = setDraftGrams(bos, "150", null);
    expect(sonraki.nutritionGrams).toBe(0);
    expect(sonraki.nutrition.kcal).toBe(0);
  });

  it("ölçülebilir (alias'lı) satır tabanı alias'tan okur, etkilenmez", () => {
    const satir = draftLineFromAlias(tavuk, "200", "g", undefined) as DraftLine;
    expect(satir.nutritionGrams).toBe(200);
    expect(satir.nutrition.kcal).toBe(330);
    const yuz = setDraftGrams(satir, "100", tavuk);
    expect(yuz.nutrition.kcal).toBe(165);
  });
});

describe("AI kalemi (ölçülen makro + baseAmount)", () => {
  // TemplatePreview.addAIItems'in kurduğu satırın shape'i: gramaj geldiyse
  // ölçülebilir, `manualMeasured: false`, `preserved: false`.
  function aiSatiri(grams: number, nutrition: Nutrition): DraftLine {
    const base = newDraftLine(undefined);
    return {
      ...base,
      key: "draft-ai-1",
      name: "Yulaf",
      qty: grams > 0 ? String(grams) : "",
      grams,
      unit: "g",
      nutrition,
      nutritionGrams: grams,
      preserved: false,
      manualMeasured: false,
      blank: false,
    };
  }

  it("gramaj geldiyse kullanıcı miktarı değiştirince ORANLANIR", () => {
    const ai = aiSatiri(100, { kcal: 375, protein: 12, carbs: 66, fat: 7, fiber: 10 });
    const yarim = setDraftGrams(ai, "50", null);
    expect(yarim.nutrition.kcal).toBe(187.5);
    expect(yarim.nutrition.protein).toBe(6);
    // AI makrosu GERÇEK olduğu için uyarı YOK (ölçeklendi).
    expect(draftGramHint(yarim, null, ai)).toEqual({
      kind: "scaled",
      fromGrams: 100,
      toGrams: 50,
    });
  });

  it("gramaj gelmediyse makro korunur, miktar girilince ilk miktar taban olur", () => {
    const ai = aiSatiri(0, { kcal: 375, protein: 12, carbs: 66, fat: 7, fiber: 10 });
    // Gramaj yokken makro dokunulmaz (ölçekleme nereye göre bilinmiyor).
    const giris = setDraftGrams(ai, "100", null);
    expect(giris.nutrition.kcal).toBe(375); // kendi değeri
    expect(giris.nutritionGrams).toBe(0); // hâlâ taban yok (AI satırı manualMeasured değil)
    // Uyarı: "besin değeri yok, gir" — ama makro ASLINDA var.
    expect(draftGramHint(giris, null, ai)).toEqual({ kind: "noNutrition" });
  });
});

// ---------------------------------------------------------------------------
// mealToBasketSeed — MealForm'un mevcut öğünü sepete açması (H1b / H4)
// ---------------------------------------------------------------------------
describe("mealToBasketSeed", () => {
  const meal: MealItem = {
    id: "m1",
    label: "Tavuk + Tofu",
    // `sources`tan TÜRENMİŞ toplamın KAYIT kesinliğindeki hali:
    // tavuk 150g (247.5) + tofu 100g (76) + tofu 50g (38) = 361.5 → 362
    computed: { kcal: 362, protein: 58.5, carbs: 2.9, fat: 12.6, fiber: 0.5 },
    sources: [
      { aliasId: "a1", qty: 150, unit: "g" },
      { aliasId: "a2", qty: 100, unit: "g" },
      { aliasId: "a2", qty: 50, unit: "g" },
    ],
  };
  const aliases = [tavuk, tofu];

  it("her sources girdisi AYRI bir kalem olur", () => {
    const seeds = mealToBasketSeed(meal, aliases, "Kalan");
    expect(seeds).toHaveLength(3);
    expect(seeds[0]).toMatchObject({
      name: "Tavuk",
      sources: [{ aliasId: "a1", qty: 150, unit: "g" }],
    });
    expect(seeds[1].nutrition.kcal).toBe(76);
    expect(seeds[2].nutrition.kcal).toBe(38);
    // toplam kaynak makroya eşit → ek kalem YOK
    expect(seeds.every((s) => s.name !== "Kalan")).toBe(true);
  });

  it("yuvarlama tozu hayalet kalem üretmez (açıldıkça şişme yok)", () => {
    // satır toplamı 361.5; kayıt 362. Fark tamsa yuvarlama tozu.
    const dust = mealToBasketSeed(meal, aliases, "Kalan");
    expect(dust).toHaveLength(3);
    // tohumlanmasa bile kayıt korunur: round(sum) === computed
    expect(Math.round(361.5)).toBe(meal.computed.kcal);
  });

  it("satırlara sığmayan fark (elle eklenmiş kalem) KAYNAKSIZ kalem olarak gelir", () => {
    const extra: MealItem = {
      ...meal,
      computed: { kcal: 862, protein: 58.5, carbs: 2.9, fat: 12.6, fiber: 0.5 },
    };
    const seeds = mealToBasketSeed(extra, aliases, "Kalan");
    expect(seeds).toHaveLength(4);
    const kalan = seeds[3];
    expect(kalan.name).toBe("Kalan");
    expect(kalan.sources).toBeUndefined();
    // DEĞER ham kalmalı: sum + kalan === computed (çift yuvarlama olursa
    // her aç/kapa ~1 kcal yukarı kayardı)
    const sumKcal = seeds.slice(0, 3).reduce((a, s) => a + s.nutrition.kcal, 0);
    expect(sumKcal + kalan.nutrition.kcal).toBeCloseTo(extra.computed.kcal, 6);
  });

  it("elle düşürülmüş toplam geri gelmez (malzemeler esas)", () => {
    const lowered: MealItem = {
      ...meal,
      computed: { kcal: 200, protein: 58.5, carbs: 2.9, fat: 12.6, fiber: 0.5 },
    };
    const seeds = mealToBasketSeed(lowered, aliases, "Kalan");
    expect(seeds).toHaveLength(3);
    expect(seeds.some((s) => s.name === "Kalan")).toBe(false);
  });

  it("kaynaksız öğün tek kalem olarak girer", () => {
    const duz: MealItem = {
      id: "m2",
      label: "Elle girilen",
      computed: { kcal: 420, protein: 20, carbs: 40, fat: 15, fiber: 3 },
    };
    expect(mealToBasketSeed(duz, aliases, "Kalan")).toEqual([
      { name: "Elle girilen", nutrition: duz.computed },
    ]);
  });

  it("alias silinmişse (dangling) tek kalem — ya-hiç-ya-hiçbiri", () => {
    const dangling: MealItem = {
      ...meal,
      sources: [
        { aliasId: "a1", qty: 150, unit: "g" },
        { aliasId: "yok-boyle-bir-alias", qty: 10, unit: "g" },
      ],
    };
    const seeds = mealToBasketSeed(dangling, aliases, "Kalan");
    expect(seeds).toHaveLength(1);
    expect(seeds[0].name).toBe(meal.label);
  });
});

describe("hasUnnamedItem", () => {
  const n = { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 };

  it("adı boş kalem varsa true", () => {
    expect(hasUnnamedItem([{ name: "", nutrition: n }, { name: "Elma", nutrition: n }])).toBe(true);
  });

  it("yalnız boşluk/sekme içeren ad da boş sayılır", () => {
    expect(hasUnnamedItem([{ name: "   ", nutrition: n }])).toBe(true);
  });

  it("hepsi adlıysa false", () => {
    expect(hasUnnamedItem([{ name: "Elma", nutrition: n }])).toBe(false);
    expect(hasUnnamedItem([])).toBe(false);
  });
});

describe("aliasOfLine", () => {
  const aliases = [
    { id: "a1", name: "Yumurta", triggers: [], serving_g: 50, nutrition: { kcal: 78, protein: 6, carbs: 1, fat: 5, fiber: 0 } },
  ] as unknown as Alias[];

  it("aliasId'ye karşılık gelen alias'ı döner", () => {
    const line = { aliasId: "a1" } as unknown as DraftLine;
    expect(aliasOfLine(aliases, line)?.id).toBe("a1");
  });

  it("aliasId null ise undefined döner", () => {
    const line = { aliasId: null } as unknown as DraftLine;
    expect(aliasOfLine(aliases, line)).toBeUndefined();
  });

  it("eşleşme yoksa undefined döner", () => {
    const line = { aliasId: "yok" } as unknown as DraftLine;
    expect(aliasOfLine(aliases, line)).toBeUndefined();
  });
});

describe("sumLineNutrition", () => {
  it("satır makrolarını toplar", () => {
    const lines = [
      { nutrition: { kcal: 100, protein: 10, carbs: 5, fat: 2, fiber: 1 } },
      { nutrition: { kcal: 50, protein: 3, carbs: 2, fat: 1, fiber: 0 } },
    ] as unknown as DraftLine[];
    expect(sumLineNutrition(lines)).toEqual({ kcal: 150, protein: 13, carbs: 7, fat: 3, fiber: 1 });
  });

  it("boş liste ZERO_NUTRITION-benzeri sıfır toplam döner", () => {
    expect(sumLineNutrition([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });
});
