import { describe, expect, it } from "vitest";
import {
  parseTemplatesConfig,
  newTemplateId,
  EMPTY_TEMPLATES,
  buildTemplateUsageIndex,
  rankTemplatesByUsage,
  templateTotal,
} from "./templates";
import type { MealTemplate, TemplateUsageIndex } from "./templates";
import type { AppConfig } from "../types";
import type { Days } from "./days";

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

describe("templateTotal", () => {
  it("kalemlerin besin değerlerini toplar ve 1 ondalığa yuvarlar", () => {
    const total = templateTotal([
      { name: "Yulaf", nutrition: { kcal: 337.5, protein: 10.8, carbs: 59.4, fat: 6.3, fiber: 9 } },
      { name: "Süt", nutrition: { kcal: 112, protein: 5.6, carbs: 8.4, fat: 5.8, fiber: 0 } },
    ]);
    expect(total.kcal).toBe(449.5);
    expect(total.protein).toBe(16.4);
    expect(total.carbs).toBe(67.8);
    expect(total.fat).toBe(12.1);
  });

  it("mikro besinde 'bilinmiyor ≠ sıfır' farkını korur (L21)", () => {
    const total = templateTotal([
      { name: "Tuzlu sos", nutrition: { kcal: 50, protein: 0, carbs: 5, fat: 2, fiber: 0, sodium: 200 } },
      { name: "Sebze", nutrition: { kcal: 30, protein: 1, carbs: 6, fat: 0, fiber: 2 } },
    ]);
    expect(total.sodium).toBe(200);

    const clean = templateTotal([
      { name: "Sebze", nutrition: { kcal: 30, protein: 1, carbs: 6, fat: 0, fiber: 2 } },
    ]);
    expect("sodium" in clean).toBe(false);
  });
});

describe("buildTemplateUsageIndex", () => {
  const nutrition = { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 };

  it("templateId taşımayan günler sayacı boş bırakır (sayaç 0, hata değil)", () => {
    const days: Days = { "2026-10-01": [{ id: "a", label: "Öğle", computed: nutrition }] };
    expect(buildTemplateUsageIndex(days).size).toBe(0);
  });

  it("aynı şablonu iki günde kullanınca count 2 olur", () => {
    const days: Days = {
      "2026-10-01": [{ id: "a", label: "Kahvaltı", computed: nutrition, templateId: "t1" }],
      "2026-10-02": [{ id: "b", label: "Kahvaltı", computed: nutrition, templateId: "t1" }],
      "2026-10-03": [{ id: "c", label: "Öğle", computed: nutrition }],
    };
    const index = buildTemplateUsageIndex(days);
    expect(index.get("t1")).toEqual({ count: 2, lastDate: "2026-10-02" });
  });
});

describe("rankTemplatesByUsage", () => {
  const tpl = (id: string): MealTemplate => ({ id, name: id, items: [] });

  it("en çok kullanılan önce; eşitlikte LİSTEDEKİ sıra korunur", () => {
    const list = [tpl("a"), tpl("b"), tpl("c"), tpl("d")];
    const usage: TemplateUsageIndex = new Map([
      ["b", { count: 3, lastDate: "2026-10-01" }],
      ["d", { count: 1, lastDate: "2026-10-02" }],
      ["a", { count: 3, lastDate: "2026-10-01" }],
    ]);
    // a ve b aynı sayaçta: a listede önceydi, öne geçmeli.
    expect(rankTemplatesByUsage(list, usage).map((t) => t.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("eşit sayıda son kullanma tarihi yenisini öne alır", () => {
    const list = [tpl("eski"), tpl("yeni")];
    const usage: TemplateUsageIndex = new Map([
      ["eski", { count: 2, lastDate: "2026-09-01" }],
      ["yeni", { count: 2, lastDate: "2026-10-01" }],
    ]);
    expect(rankTemplatesByUsage(list, usage).map((t) => t.id)).toEqual(["yeni", "eski"]);
  });

  it("hiç kullanılmamış şablonlar listedeki sıralarını korur", () => {
    const list = [tpl("bir"), tpl("iki"), tpl("üç")];
    expect(rankTemplatesByUsage(list, new Map()).map((t) => t.id)).toEqual(["bir", "iki", "üç"]);
  });
});

