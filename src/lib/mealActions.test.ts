import { describe, expect, it } from "vitest";
import {
  MEAL_MENU_ACTIONS,
  duplicatePayload,
  mealMenuActions,
  mealSheetReducer,
  mealToTemplate,
  templateNameSuggestion,
} from "./mealActions";
import { parseTemplatesConfig } from "./templates";
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
