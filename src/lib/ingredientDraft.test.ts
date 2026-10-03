import { describe, expect, it } from "vitest";
import {
  addDraftLine,
  draftLineFromAlias,
  draftLinesToItems,
  newDraftLine,
  removeDraftLine,
  resolveDraftUnit,
  setDraftGrams,
  swapDraftLine,
} from "./ingredientDraft";
import type { DraftLine } from "./ingredientDraft";
import type { Alias, Nutrition } from "../types";

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
  // düşülür — satır hiç üretilmez (resolveMealIngredients'in null sözleşmesi).
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
      preserved: true,
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

  it("ölçülebilir hale gelince preserved DÜŞER (artık korunan değil, ölçülen)", () => {
    const olculen = setDraftGrams(korunmus(), "200", null);
    expect(olculen.preserved).toBe(false);
    expect(olculen.grams).toBe(200);
    expect(olculen.qty).toBe("200");
  });

  it("newDraftLine / draftLineFromAlias / swapDraftLine preserved:false üretir", () => {
    expect(newDraftLine(undefined).preserved).toBe(false);
    expect(newDraftLine(tavuk).preserved).toBe(false);
    expect(line(draftLineFromAlias(tavuk, "150", "g")).preserved).toBe(false);
    const swapped = swapDraftLine(korunmus(), tofu);
    expect(swapped.preserved).toBe(false);
    expect(swapped.grams).toBe(0); // korunmuş satırın gramajı yok — swap ölçemez
  });

  it("reddedilen birim preserved değiştirmez (satıra hiç dokunulmaz)", () => {
    const base = line(draftLineFromAlias(ekmekDilim, "4", "Dilim"));
    base.unit = "kase";
    expect(setDraftGrams(base, "6", ekmekDilim).preserved).toBe(false);
  });
});
