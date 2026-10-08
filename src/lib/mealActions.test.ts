import { describe, expect, it } from "vitest";
import {
  MEAL_MENU_ACTIONS,
  duplicatePayload,
  mealMenuActions,
  mealSheetReducer,
  mealToTemplate,
  mergePayloads,
  templateNameSuggestion,
} from "./mealActions";
import { parseTemplatesConfig } from "./templates";
import { categoryForLoggedAt } from "./mealCategory";
import { makeNutrition } from "./nutrients";
import type { AppConfig, MealItem } from "../types";

function nutrition(over: Partial<Record<string, number>> = {}) {
  return makeNutrition({ kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 4, ...over });
}

function meal(over: Partial<MealItem> = {}): MealItem {
  return { id: "m1", label: "Yoğurt + shake", computed: nutrition(), ...over };
}

describe("mealToTemplate", () => {
  it("öğünü TEK kalemli şablona çevirir; ad, besin ve hafıza bağlantısı korunur", () => {
    const item = meal({ sources: [{ aliasId: "a1", qty: 200, unit: "g" }] });
    const tpl = mealToTemplate(item, "  Antrenman sonrası  ");
    expect(tpl.id).toMatch(/^t_/);
    expect(tpl.name).toBe("Antrenman sonrası");
    expect(tpl.items).toEqual([
      {
        name: item.label,
        nutrition: item.computed,
        sources: [{ aliasId: "a1", qty: 200, unit: "g" }],
      },
    ]);
  });

  it("boş ad verilirse öğün etiketine düşer (kayıt yine de yapılabilir)", () => {
    expect(mealToTemplate(meal(), "   ").name).toBe("Yoğurt + shake");
  });

  it("kaynaksız öğünde `sources` alanı hiç yazılmaz", () => {
    const item = mealToTemplate(meal(), "Kahvaltı");
    expect("sources" in item.items[0]).toBe(false);
  });

  it("üretilen şablon config turundan kayıpsız geçer", () => {
    const tpl = mealToTemplate(meal(), "Kahvaltı");
    const parsed = parseTemplatesConfig({ templates: { list: [tpl] } } as unknown as AppConfig);
    expect(parsed.list).toEqual([tpl]);
  });

  it("ad önerisi öğünün kendi etiketidir", () => {
    expect(templateNameSuggestion(meal())).toBe("Yoğurt + shake");
  });
});

describe("duplicatePayload", () => {
  it("kategori/saat ve hafıza bağlantısını korur (kopya aynı başlığa düşsün)", () => {
    const item = meal({
      loggedAt: "2026-08-27T12:40:00.000Z",
      category: "lunch",
      sources: [{ aliasId: "a1", qty: 200, unit: "g" }],
    });
    expect(duplicatePayload(item)).toEqual({
      name: item.label,
      nutrition: item.computed,
      sources: [{ aliasId: "a1", qty: 200, unit: "g" }],
      loggedAt: "2026-08-27T12:40:00.000Z",
      category: "lunch",
    });
  });

  it("kaynaksız/saatsiz öğünde bu alanlar hiç yer almaz", () => {
    const payload = duplicatePayload(meal());
    expect(payload).toEqual({ name: "Yoğurt + shake", nutrition: nutrition() });
    expect("sources" in payload).toBe(false);
    expect("loggedAt" in payload).toBe(false);
  });
});

describe("mealMenuActions", () => {
  const base = { busy: false, offline: false };

  it("çevrimdışıyken YALNIZCA şablon kaydetme kapanır (gün yazımları kuyruğa girebilir)", () => {
    const disabled = mealMenuActions({ ...base, offline: true })
      .filter((a) => a.disabled)
      .map((a) => a.id);
    expect(disabled).toEqual(["template"]);
  });

  it("yazma sürerken hepsi kapanır (çift yazma yok)", () => {
    expect(mealMenuActions({ ...base, busy: true }).every((a) => a.disabled)).toBe(true);
  });

  it("çevrimiçi ve boşta hiçbiri kapalı değil; sil en sonda", () => {
    expect(mealMenuActions(base).some((a) => a.disabled)).toBe(false);
    expect(MEAL_MENU_ACTIONS[MEAL_MENU_ACTIONS.length - 1]).toBe("delete");
  });

  it("menüdeki eylem kümesi ve sırası sabittir (tarif eylemi artık yok)", () => {
    expect(mealMenuActions(base).map((a) => a.id)).toEqual([
      "template",
      "duplicate",
      "edit",
      "select",
      "delete",
    ]);
  });
});

describe("mealSheetReducer", () => {
  it("menüden şablon adı ve sil onayı adımlarına geçer", () => {
    expect(mealSheetReducer("menu", { type: "choose", id: "template" })).toBe("templateName");
    expect(mealSheetReducer("menu", { type: "choose", id: "delete" })).toBe("confirmDelete");
  });

  it("adım değiştirmeyen aksiyonlar sheet'i kapatır (işi parent yapar)", () => {
    for (const id of ["duplicate", "edit", "select"] as const) {
      expect(mealSheetReducer("menu", { type: "choose", id })).toBe("closed");
    }
  });

  it("adım içi geri menüye döner, menüden geri kapatır", () => {
    expect(mealSheetReducer("templateName", { type: "back" })).toBe("menu");
    expect(mealSheetReducer("confirmDelete", { type: "back" })).toBe("menu");
    expect(mealSheetReducer("menu", { type: "back" })).toBe("closed");
  });

  it("menü dışındayken yapılan seçim yok sayılır (çift tetikleme)", () => {
    expect(mealSheetReducer("templateName", { type: "choose", id: "delete" })).toBe("templateName");
    expect(mealSheetReducer("confirmDelete", { type: "choose", id: "template" })).toBe(
      "confirmDelete",
    );
  });

  it("aç/kapat olayları adımı sıfırlar", () => {
    expect(mealSheetReducer("confirmDelete", { type: "close" })).toBe("closed");
    expect(mealSheetReducer("closed", { type: "open" })).toBe("menu");
  });
});

describe("mergePayloads", () => {
  const k3 = meal({
    id: "a",
    label: "Kahvaltı",
    computed: nutrition({ kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 4 }),
    sources: [
      { aliasId: "x", qty: 100, unit: "g" },
      { aliasId: "y", qty: 50, unit: "g" },
      { aliasId: "z", qty: 25, unit: "g" },
    ],
  });
  const k2 = meal({
    id: "b",
    label: "Ara öğün",
    computed: nutrition({ kcal: 200, protein: 10, carbs: 20, fat: 5, fiber: 2 }),
    sources: [
      { aliasId: "x", qty: 60, unit: "g" },
      { aliasId: "y", qty: 40, unit: "g" },
    ],
  });

  // ASIL SÖZLEŞME: birleştirme kalem sayısını düşürmez.
  it("3 kalemli + 2 kalemli öğün → 5 kalem", () => {
    const merged = mergePayloads([k3, k2], "Birleşik");
    expect(merged.sources).toHaveLength(5);
    expect(merged.sources!.map((s) => s.qty)).toEqual([100, 50, 25, 60, 40]);
  });

  it("tek kalemli iki öğün → 2 kalem", () => {
    const a = meal({ id: "a1", sources: [{ aliasId: "x", qty: 10, unit: "g" }] });
    const b = meal({ id: "b1", sources: [{ aliasId: "y", qty: 20, unit: "g" }] });
    expect(mergePayloads([a, b], "X").sources).toHaveLength(2);
  });

  it("besin değerleri toplanır", () => {
    expect(mergePayloads([k3, k2], "Birleşik").nutrition).toMatchObject({
      kcal: 500,
      protein: 30,
      carbs: 50,
      fat: 15,
      fiber: 6,
    });
  });

  it("hiçbirinde kaynak yoksa `sources` alanı hiç yazılmaz", () => {
    const merged = mergePayloads([meal(), meal({ id: "m2" })], "Elle giren");
    expect("sources" in merged).toBe(false);
    expect(merged.nutrition.kcal).toBe(600);
  });

  it("kaynaksız öğün besini toplamda KALIR (kalemi olmasa da kaybolmaz)", () => {
    const manual = meal({ id: "m3", computed: nutrition({ kcal: 111 }) });
    const merged = mergePayloads([k3, manual], "X");
    expect(merged.sources).toHaveLength(3);
    expect(merged.nutrition.kcal).toBe(411);
  });

  it("`grams` toplanır, sıfıra düşerse alan yazılmaz", () => {
    expect(mergePayloads([meal({ grams: 120 }), meal({ id: "m2", grams: 80 })], "X").grams).toBe(200);
    expect("grams" in mergePayloads([meal(), meal({ id: "m2" })], "X")).toBe(false);
  });

  it("iki farklı şablondan geldiği için `templateId` taşınmaz", () => {
    const merged = mergePayloads(
      [meal({ id: "a", templateId: "t_1" }), meal({ id: "b", templateId: "t_2" })],
      "X",
    );
    expect("templateId" in merged).toBe(false);
  });

  it("en erken `loggedAt`'i alır, kategorisi ondan türer", () => {
    const early = meal({ id: "e", loggedAt: "2026-10-08T07:00:00.000Z" });
    const late = meal({ id: "l", loggedAt: "2026-10-08T13:00:00.000Z" });
    const merged = mergePayloads([late, early], "X");
    expect(merged.loggedAt).toBe("2026-10-08T07:00:00.000Z");
    expect(merged.category).toBe(categoryForLoggedAt(merged.loggedAt!));
  });

  it("kullanıcının verdiği ad aynen kullanılır", () => {
    expect(mergePayloads([k3, k2], "Kahvaltı").name).toBe("Kahvaltı");
  });
});
