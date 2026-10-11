import { describe, expect, it } from "vitest";
import type { MealItem } from "../types";
import { resolveWriteDays, toPayload } from "./days";

describe("toPayload", () => {
  it("MealItem üzerindeki sources alanını MealPayload'a aktarmalı", () => {
    const meals: MealItem[] = [
      {
        id: "1",
        label: "Yoğurt (150g)",
        computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
        sources: [{ aliasId: "yogurt", qty: 150, unit: "g" }],
      },
      {
        id: "2",
        label: "Elma",
        computed: { kcal: 50, protein: 0, carbs: 12, fat: 0, fiber: 2 },
      },
    ];

    const payload = toPayload(meals);
    expect(payload[0].sources).toEqual([{ aliasId: "yogurt", qty: 150, unit: "g" }]);
    expect(payload[1].sources).toBeUndefined();
  });

  it("templateId'yi MealPayload'a aktarır — şablon kullanım sayacının kaynağı", () => {
    const payload = toPayload([
      {
        id: "1",
        label: "Sabah Kahvaltısı",
        computed: { kcal: 90, protein: 4.5, carbs: 6, fat: 4.5, fiber: 0 },
        templateId: "t_kahvalti",
      },
      {
        id: "2",
        label: "Elle eklenen",
        computed: { kcal: 50, protein: 1, carbs: 10, fat: 0, fiber: 1 },
      },
    ]);
    expect(payload[0].templateId).toBe("t_kahvalti");
    // Elle eklenen öğünde alan hiç yazılmaz (sayaç 0 — hata değil).
    expect(payload[1].templateId).toBeUndefined();
  });

  it("kaynaksız kalemin gramajını taşır (şablondan uygulama kaybı)", () => {
    const payload = toPayload([
      {
        id: "1",
        label: "Ev yapımı sos",
        computed: { kcal: 225, protein: 1, carbs: 8, fat: 20, fiber: 1 },
        grams: 150,
      },
    ]);
    expect(payload[0].grams).toBe(150);
  });

  it("items'ı MealPayload'a taşır (kalem kırılımı kaybolmaz)", () => {
    const items = [
      { name: "Yulaf", nutrition: { kcal: 200, protein: 5, carbs: 30, fat: 4, fiber: 3 } },
    ];
    const payload = toPayload([
      {
        id: "1",
        label: "Yulaf + Sos",
        computed: { kcal: 300, protein: 6, carbs: 32, fat: 10, fiber: 3 },
        items,
      },
    ]);
    expect(payload[0].items).toEqual(items);
  });

  it("items VARKEN grams yazılmaz (çift kopya: gramaj items[].grams'ta yaşar)", () => {
    const payload = toPayload([
      {
        id: "1",
        label: "Yulaf + Sos",
        computed: { kcal: 300, protein: 6, carbs: 32, fat: 10, fiber: 3 },
        items: [{ name: "Yulaf", nutrition: { kcal: 300, protein: 6, carbs: 32, fat: 10, fiber: 3 }, grams: 80 }],
        grams: 80,
      },
    ]);
    expect("grams" in payload[0]).toBe(false);
  });

  it("items boş dizi ise grams yine de yazılır (items yok sayılır)", () => {
    const payload = toPayload([
      {
        id: "1",
        label: "Elle",
        computed: { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 1 },
        items: [],
        grams: 50,
      },
    ]);
    expect(payload[0].grams).toBe(50);
    expect("items" in payload[0]).toBe(false);
  });
});

describe("resolveWriteDays", () => {
  const ctx = { "2026-08-05": [] };

  it("offline iken context'i döner ve fetch'i HİÇ çağırmaz", async () => {
    let called = false;
    const got = await resolveWriteDays(
      true,
      async () => {
        called = true;
        return {};
      },
      ctx,
    );
    expect(got).toBe(ctx);
    expect(called).toBe(false);
  });

  it("online + başarılı fetch → taze günleri döner", async () => {
    const fresh = { "2026-08-05": [] };
    expect(await resolveWriteDays(false, async () => fresh, ctx)).toBe(fresh);
  });

  it("online + fetch fırlarsa context'e düşer (öğün kaybolmaz)", async () => {
    const got = await resolveWriteDays(false, async () => {
      throw new TypeError("Failed to fetch");
    }, ctx);
    expect(got).toBe(ctx);
  });
});
