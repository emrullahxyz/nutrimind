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
import type { Alias } from "../types";

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
});

describe("addDraftLine / removeDraftLine", () => {
  it("add sona ekler", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    expect(addDraftLine([a], b)).toHaveLength(2);
  });

  it("remove key ile siler", () => {
    const a = newDraftLine(tavuk);
    const b = newDraftLine(tofu);
    expect(removeDraftLine([a, b], b.key)).toEqual([a]);
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
});
