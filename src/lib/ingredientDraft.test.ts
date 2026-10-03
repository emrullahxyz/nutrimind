import { describe, expect, it } from "vitest";
import {
  addDraftLine,
  draftLineFromAlias,
  draftLinesToItems,
  newDraftLine,
  removeDraftLine,
  setDraftGrams,
  swapDraftLine,
} from "./ingredientDraft";
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

describe("newDraftLine", () => {
  it("alias verilirse ondan satır üretir", () => {
    const line = newDraftLine(tavuk);
    expect(line.aliasId).toBe("a1");
    expect(line.name).toBe("Tavuk");
    expect(line.unit).toBe("g");
  });

  it("alias yoksa elle satır üretir (aliasId null, makro sıfır)", () => {
    const line = newDraftLine(undefined);
    expect(line.aliasId).toBeNull();
    expect(line.name).toBe("");
    expect(line.qty).toBe("");
    expect(line.grams).toBe(0);
    expect(line.nutrition.kcal).toBe(0);
  });
});

describe("draftLineFromAlias", () => {
  it("miktarı grama çevirir ve makroyu ölçekler", () => {
    const line = draftLineFromAlias(tavuk, "150", "g");
    expect(line.grams).toBe(150);
    expect(line.nutrition.kcal).toBe(247.5);
  });

  it("tr-TR virgülü de kabul eder", () => {
    const line = draftLineFromAlias(tavuk, "12,5", "g");
    expect(line.grams).toBe(12.5);
  });

  it("geçersiz gramaj mevcut makroyu SIFIRLAMAZ (yazma sırasında titreme)", () => {
    const base = draftLineFromAlias(tavuk, "150", "g");
    const typed = setDraftGrams(base, "", tavuk);
    expect(typed.grams).toBe(0);
    expect(typed.nutrition.kcal).toBe(247.5);
  });

  // Q3: `fallback` gerçek bir parametre — Task 2 çağırıyor.
  it("geçersiz gramajda fallback makroyu korur (ZERO_NUTRITION DEĞİL)", () => {
    const onceki: Nutrition = { kcal: 330, protein: 62, carbs: 0, fat: 7.2, fiber: 0 };
    const line = draftLineFromAlias(tavuk, "", "g", onceki);
    expect(line.grams).toBe(0);
    expect(line.nutrition).toEqual(onceki);
  });

  it("geçersiz gramajda fallback verilmediyse ZERO_NUTRITION", () => {
    const line = draftLineFromAlias(tavuk, "", "g");
    expect(line.nutrition.kcal).toBe(0);
  });

  // Q1: özel birim gramajı doğru çevirir.
  it("özel birimde miktarı gramaj çevirir", () => {
    const line = draftLineFromAlias(ekmekDilim, "4", "Dilim");
    expect(line.grams).toBe(100);
    expect(line.nutrition.kcal).toBe(500); // 250 kcal / 50 g × 100 g
  });

  // Q1: büyük/küçük harf ve boşluk farkı YINE de aynı birimi bulur.
  it("birim eşleşmesi tr-TR küçük harfe duyarlıdır (' dilim ' == 'Dilim')", () => {
    const line = draftLineFromAlias(ekmekDilim, "4", " dilim ");
    expect(line.unit).toBe("Dilim");
    expect(line.grams).toBe(100);
  });

  // Q1: eşleşmeyen birim sessizce kaybolmaz — çözülen ad geri yazılır, görünür.
  it("bilinmeyen birimi alias'ın varsayılanına düşürür ve ÇÖZÜLEN adı yazar", () => {
    const line = draftLineFromAlias(tavuk, "2", "kase-dolusu");
    expect(line.unit).toBe("g"); // tavuk'un özel birimi yok → gram
    expect(line.grams).toBe(2); // 2 "kase" DEĞİL, 2 g — ama "g" YAZIYOR
  });

  // Q1'in görünür-düzeltme kuralı: yanlış/eskimiş bir ad ("kase-dolusu") girilse
  // bile alias'ın VARSAYILAN birimi ölçülür — 2 dilim = 50 g, 2 g DEĞİL.
  it("eskimiş birim adı varsayılan birime düşer, 1'e DEĞİL (ölçüm doğru kalır)", () => {
    const line = draftLineFromAlias(ekmekDilim, "2", "kase-dolusu");
    expect(line.unit).toBe("Dilim");
    expect(line.grams).toBe(50); // 2 × 25 g — sessizce 2 g YAPILMAZ
    expect(line.nutrition.kcal).toBe(250);
  });
});

describe("setDraftGrams", () => {
  it("yeni gramaja göre makroyu yeniden hesaplar", () => {
    const line = setDraftGrams(draftLineFromAlias(tavuk, "150", "g"), "300", tavuk);
    expect(line.grams).toBe(300);
    expect(line.nutrition.kcal).toBe(495);
  });

  it("elle yazılan metni qty olarak korur (virgüllü girilim kaybolmaz)", () => {
    const line = setDraftGrams(draftLineFromAlias(tavuk, "100", "g"), "12,5", tavuk);
    expect(line.qty).toBe("12,5");
    expect(line.grams).toBe(12.5);
  });

  // Q1: hesap bu birimle yapıldığı için birim de GERİ YAZILIR (L20).
  it("çözülen birimi satırda görünür kılar", () => {
    const line = setDraftGrams(draftLineFromAlias(ekmekDilim, "4", "dilim"), "6", ekmekDilim);
    expect(line.unit).toBe("Dilim");
    expect(line.grams).toBe(150);
    expect(line.nutrition.kcal).toBe(750); // 250 kcal / 50 g × 150 g
  });

  // Q2 + Q4: alias yok — makro KORUNUR, ölçüm gram cinsindendir.
  it("alias null iken makroyu korur, gram cinsinden ölçer", () => {
    const onceki: Nutrition = { kcal: 90, protein: 0, carbs: 0, fat: 10, fiber: 0 };
    const manual = newDraftLine(undefined);
    manual.nutrition = onceki;
    const line = setDraftGrams(manual, "10", null);
    expect(line.qty).toBe("10");
    expect(line.grams).toBe(10); // 1x çarpan YOK: 10 (g)
    expect(line.unit).toBe("g");
    expect(line.nutrition).toEqual(onceki); // bu modül elle satırın makrosunu UYDURMAZ
  });

  // Q2: "adet" gibi elle yazılmış metin 1 g yapılmaz.
  it("alias null iken elle yazılan birim adı 1 g olarak SAYILMAZ", () => {
    const manual = newDraftLine(undefined);
    manual.unit = "adet";
    const line = setDraftGrams(manual, "2", null);
    expect(line.unit).toBe("g");
    expect(line.grams).toBe(2); // "2 adet = 2 g" DEĞİL, 2 birim gram
  });

  // Q4: alias null + geçersiz metin.
  it("alias null ve geçersiz metin: makro yine korunur, grams sıfırlanır", () => {
    const onceki: Nutrition = { kcal: 90, protein: 0, carbs: 0, fat: 10, fiber: 0 };
    const manual = newDraftLine(undefined);
    manual.nutrition = onceki;
    const line = setDraftGrams(manual, "", null);
    expect(line.qty).toBe("");
    expect(line.grams).toBe(0);
    expect(line.nutrition).toEqual(onceki);
  });
});

describe("swapDraftLine", () => {
  it("gramı korur, makroyu yeni besinden hesaplar", () => {
    const line = swapDraftLine(draftLineFromAlias(tavuk, "150", "g"), tofu);
    expect(line.grams).toBe(150);
    expect(line.aliasId).toBe("a2");
    expect(line.name).toBe("Tofu");
    expect(line.nutrition.kcal).toBe(114);
  });

  it("miktarı yeni alias'ın varsayılan birimine çevirir", () => {
    const line = swapDraftLine(draftLineFromAlias(tavuk, "150", "g"), tofu);
    expect(line.unit).toBe("g");
    expect(line.qty).toBe("150");
  });

  // M1: gerçek gram→birim çevrimi. 150 g = 6 dilim (25 g/dilim).
  it("gramı hedef alias'ın ÖZEL birimine çevirir (150 g = 6 dilim)", () => {
    const line = swapDraftLine(draftLineFromAlias(tavuk, "150", "g"), ekmekDilim);
    expect(line.unit).toBe("Dilim");
    expect(line.qty).toBe("6");
    expect(line.grams).toBe(150);
    expect(line.nutrition.kcal).toBe(750);
  });

  // Swap satırın anahtarını korumalı — yerinde değişim, yeniden mount yok.
  it("satır anahtarını korur (yerinde değişim)", () => {
    const base = draftLineFromAlias(tavuk, "150", "g");
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
    const items = draftLinesToItems([draftLineFromAlias(tavuk, "150", "g")]);
    expect(items).toHaveLength(1);
    expect(items[0].sources).toEqual([{ aliasId: "a1", qty: 150, unit: "g" }]);
  });

  it("0 gramajlı alias satırını ATAR (anlamsız kayıt)", () => {
    const items = draftLinesToItems([draftLineFromAlias(tavuk, "", "g")]);
    expect(items).toHaveLength(0);
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
    const items = draftLinesToItems([draftLineFromAlias(ekmekDilim, "1,5", "Dilim")]);
    expect(items[0].sources).toEqual([{ aliasId: "a3", qty: 1.5, unit: "Dilim" }]);
  });
});
