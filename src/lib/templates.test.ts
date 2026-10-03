import { describe, expect, it } from "vitest";
import { parseTemplatesConfig, newTemplateId, EMPTY_TEMPLATES } from "./templates";
import type { AppConfig } from "../types";

describe("parseTemplatesConfig", () => {
  it("boş config ve eksik templates anahtarı için boş liste döner", () => {
    expect(parseTemplatesConfig({} as AppConfig)).toEqual(EMPTY_TEMPLATES);
    expect(parseTemplatesConfig(null as unknown as AppConfig)).toEqual(EMPTY_TEMPLATES);
    expect(parseTemplatesConfig({ water: { target: 8, log: {} } } as unknown as AppConfig)).toEqual(EMPTY_TEMPLATES);
  });

  it("list dizi değilse boş liste döner", () => {
    const config: AppConfig = { templates: { list: "invalid" } as any };
    expect(parseTemplatesConfig(config)).toEqual(EMPTY_TEMPLATES);
  });

  it("id veya name eksik olan şablonları atlar", () => {
    const config: AppConfig = {
      templates: {
        list: [
          { id: "", name: "Şablon 1", items: [{ name: "Elma", nutrition: { kcal: 50, protein: 0, carbs: 10, fat: 0, fiber: 2 } }] },
          { id: "t1", name: "", items: [{ name: "Elma", nutrition: { kcal: 50, protein: 0, carbs: 10, fat: 0, fiber: 2 } }] },
          { id: "t2", name: "Geçerli", items: [{ name: "Elma", nutrition: { kcal: 50, protein: 0, carbs: 10, fat: 0, fiber: 2 } }] },
        ],
      },
    };
    const parsed = parseTemplatesConfig(config);
    expect(parsed.list).toHaveLength(1);
    expect(parsed.list[0].id).toBe("t2");
  });

  it("name eksik olan kalemi atlar", () => {
    const config: AppConfig = {
      templates: {
        list: [
          {
            id: "t1",
            name: "Kahvaltı",
            items: [
              { name: "", nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 } },
              { name: "Yumurta", nutrition: { kcal: 140, protein: 12, carbs: 1, fat: 10, fiber: 0 } },
            ],
          },
        ],
      },
    };
    const parsed = parseTemplatesConfig(config);
    expect(parsed.list[0].items).toHaveLength(1);
    expect(parsed.list[0].items[0].name).toBe("Yumurta");
  });

  it("geçerli veri (sources DAHİL ve HAREÇ) doğru geçiyor", () => {
    const config: AppConfig = {
      templates: {
        list: [
          {
            id: "t_1",
            name: "Yulaf Lapası",
            items: [
              {
                name: "Yulaf + Süt",
                nutrition: { kcal: 350, protein: 15, carbs: 55, fat: 7, fiber: 6 },
                sources: [{ aliasId: "yulaf_1", qty: 50, unit: "g" }],
              },
              {
                name: "Muz",
                nutrition: { kcal: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 },
              },
            ],
          },
        ],
      },
    };
    const parsed = parseTemplatesConfig(config);
    expect(parsed.list).toHaveLength(1);
    expect(parsed.list[0]).toEqual({
      id: "t_1",
      name: "Yulaf Lapası",
      items: [
        {
          name: "Yulaf + Süt",
          nutrition: { kcal: 350, protein: 15, carbs: 55, fat: 7, fiber: 6 },
          sources: [{ aliasId: "yulaf_1", qty: 50, unit: "g" }],
        },
        {
          name: "Muz",
          nutrition: { kcal: 105, protein: 1, carbs: 27, fat: 0, fiber: 3 },
        },
      ],
    });
  });

  // `TemplateItem.grams`: `sources`ı olmayan kalemin gramajı. Elle girilen ve
  // AI'ın döndürdüğü malzemeler hafızada olmayabilir, `sources` yazılamaz;
  // gramajın kaybolmaması için ayrı alanda taşınır.
  describe("grams", () => {
    const base = (item: Record<string, unknown>) => ({
      templates: { list: [{ id: "t1", name: "T", items: [item] }] },
    }) as unknown as AppConfig;

    it("sources'ı olmayan kalemin gramajını korur", () => {
      const parsed = parseTemplatesConfig(
        base({ name: "Ev sosu", nutrition: { kcal: 200, protein: 2, carbs: 4, fat: 12, fiber: 0 }, grams: 100 }),
      );
      expect(parsed.list[0].items[0].grams).toBe(100);
    });

    it("sources varsa grams YOK SAYILIR (miktar zaten sources'ta)", () => {
      // İki kopya tutmaz: sources.qty 50 iken grams 100 yazılırsa kayıt
      // kendi içinde çelişir.
      const parsed = parseTemplatesConfig(
        base({
          name: "Yulaf",
          nutrition: { kcal: 350, protein: 15, carbs: 55, fat: 7, fiber: 6 },
          sources: [{ aliasId: "yulaf_1", qty: 50, unit: "g" }],
          grams: 100,
        }),
      );
      expect(parsed.list[0].items[0].sources?.[0].qty).toBe(50);
      expect(parsed.list[0].items[0].grams).toBeUndefined();
    });

    it("0, negatif ve sayı olmayan gramaj ATILIR (uydurma miktar yazılmaz)", () => {
      for (const g of [0, -5, "100", null, undefined]) {
        const parsed = parseTemplatesConfig(
          base({ name: "X", nutrition: { kcal: 10, protein: 1, carbs: 1, fat: 1, fiber: 0 }, grams: g }),
        );
        expect(parsed.list[0].items[0].grams).toBeUndefined();
      }
    });
  });
});

describe("newTemplateId", () => {
  it("t_ öneki ile benzersiz kimlik üretir", () => {
    const id1 = newTemplateId();
    const id2 = newTemplateId();
    expect(id1).toMatch(/^t_/);
    expect(id2).toMatch(/^t_/);
    expect(id1).not.toBe(id2);
  });
});
