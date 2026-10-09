import { describe, expect, it } from "vitest";
import type { Alias } from "../types";
import { ZERO_NUTRITION } from "../types";
import { buildUsageIndex, rankAliases, scoreQueryMatch } from "./aliasRank";
import type { Days } from "./days";
import { singleProfileConfig } from "./goals";

const dummyNutrition = { ...ZERO_NUTRITION, kcal: 100 };

const aliasYulaf: Alias = {
  id: "yulaf",
  name: "Yulaf Ezmesi",
  brand: "Eti Lifalif",
  triggers: ["yulaf"],
  serving_g: 100,
  nutrition: dummyNutrition,
};

const aliasMuz: Alias = {
  id: "muz",
  name: "Muz",
  brand: null,
  triggers: ["muz", "1 muz"],
  serving_g: 120,
  nutrition: dummyNutrition,
};

const aliasUnused: Alias = {
  id: "unused",
  name: "Kullanılmayan Besin",
  brand: null,
  triggers: [],
  serving_g: 100,
  nutrition: dummyNutrition,
};

const defaultGoals = singleProfileConfig(ZERO_NUTRITION);

describe("buildUsageIndex", () => {
  it("boş days verisi boş index döner", () => {
    const days: Days = {};
    const index = buildUsageIndex(days, defaultGoals);
    expect(index.size).toBe(0);
  });

  it("tek öğün verisini doğru işler", () => {
    const days: Days = {
      "2026-08-01": [
        {
          id: "m1",
          label: "Kahvaltı",
          computed: dummyNutrition,
          sources: [{ aliasId: "yulaf", qty: 100, unit: "g" }],
        },
      ],
    };

    const index = buildUsageIndex(days, defaultGoals);
    expect(index.size).toBe(1);
    const stats = index.get("yulaf");
    expect(stats).toBeDefined();
    expect(stats?.count).toBe(1);
    expect(stats?.lastDate).toBe("2026-08-01");
    expect(stats?.byMealIndex[0]).toBe(1);
  });

  it("çoklu gün ve çoklu alias verisini doğru toplar", () => {
    const days: Days = {
      "2026-08-01": [
        {
          id: "m1",
          label: "Kahvaltı",
          computed: dummyNutrition,
          sources: [{ aliasId: "yulaf", qty: 100, unit: "g" }],
        },
      ],
      "2026-08-02": [
        {
          id: "m2",
          label: "Kahvaltı",
          computed: dummyNutrition,
          sources: [
            { aliasId: "yulaf", qty: 100, unit: "g" },
            { aliasId: "muz", qty: 1, unit: "adet" },
          ],
        },
        {
          id: "m3",
          label: "Ara Öğün",
          computed: dummyNutrition,
          sources: [{ aliasId: "protein", qty: 30, unit: "g" }],
        },
      ],
    };

    const index = buildUsageIndex(days, defaultGoals);
    expect(index.get("yulaf")?.count).toBe(2);
    expect(index.get("yulaf")?.lastDate).toBe("2026-08-02");
    expect(index.get("muz")?.count).toBe(1);
    expect(index.get("protein")?.count).toBe(1);
    expect(index.get("protein")?.byMealIndex[1]).toBe(1);
  });

  it("sources olmayan veya boş olan öğünleri atlar", () => {
    const days: Days = {
      "2026-08-01": [
        {
          id: "m1",
          label: "Elle Girilen Öğün",
          computed: dummyNutrition,
        },
        {
          id: "m2",
          label: "Boş Sources",
          computed: dummyNutrition,
          sources: [],
        },
      ],
    };

    const index = buildUsageIndex(days, defaultGoals);
    expect(index.size).toBe(0);
  });
});

describe("rankAliases", () => {
  it("sık kullanılan besin üstte yer alır", () => {
    const days: Days = {
      "2026-08-01": [
        { id: "m1", label: "", computed: dummyNutrition, sources: [{ aliasId: "yulaf", qty: 1, unit: "g" }] },
        { id: "m2", label: "", computed: dummyNutrition, sources: [{ aliasId: "yulaf", qty: 1, unit: "g" }] },
        { id: "m3", label: "", computed: dummyNutrition, sources: [{ aliasId: "muz", qty: 1, unit: "g" }] },
      ],
    };
    const index = buildUsageIndex(days, defaultGoals);
    const ctx = { today: "2026-08-01", weekday: 6, profileId: "default", mealIndex: 0 };

    const ranked = rankAliases([aliasMuz, aliasYulaf], index, ctx);
    expect(ranked[0].id).toBe("yulaf");
    expect(ranked[1].id).toBe("muz");
  });

  it("yakın zamanda kullanılan besin üstte yer alır", () => {
    const days: Days = {
      "2026-07-01": [
        { id: "m1", label: "", computed: dummyNutrition, sources: [{ aliasId: "muz", qty: 1, unit: "g" }] },
      ],
      "2026-08-02": [
        { id: "m2", label: "", computed: dummyNutrition, sources: [{ aliasId: "yulaf", qty: 1, unit: "g" }] },
      ],
    };
    const index = buildUsageIndex(days, defaultGoals);
    const ctx = { today: "2026-08-02", weekday: 0, profileId: "default", mealIndex: 0 };

    const ranked = rankAliases([aliasMuz, aliasYulaf], index, ctx);
    expect(ranked[0].id).toBe("yulaf");
    expect(ranked[1].id).toBe("muz");
  });

  it("indekste olmayan besinler en sona düşer", () => {
    const days: Days = {
      "2026-08-01": [
        { id: "m1", label: "", computed: dummyNutrition, sources: [{ aliasId: "yulaf", qty: 1, unit: "g" }] },
      ],
    };
    const index = buildUsageIndex(days, defaultGoals);
    const ctx = { today: "2026-08-01", weekday: 6, profileId: "default", mealIndex: 0 };

    const ranked = rankAliases([aliasUnused, aliasYulaf], index, ctx);
    expect(ranked[0].id).toBe("yulaf");
    expect(ranked[1].id).toBe("unused");
  });

  it("eşit skorda kararlı sıralama korunur", () => {
    const index = new Map();
    const ctx = { today: "2026-08-01", weekday: 6, profileId: "default", mealIndex: 0 };

    const list1 = [aliasMuz, aliasUnused];
    const ranked1 = rankAliases(list1, index, ctx);
    expect(ranked1.map((a) => a.id)).toEqual(["muz", "unused"]);

    const list2 = [aliasUnused, aliasMuz];
    const ranked2 = rankAliases(list2, index, ctx);
    expect(ranked2.map((a) => a.id)).toEqual(["unused", "muz"]);
  });
});

describe("scoreQueryMatch", () => {
  it("ad baştan > ad içinde > marka > tetikleyici öncelik sırasını doğrular", () => {
    const itemAdBastan: Alias = {
      id: "1",
      name: "Yulaf Ezmesi",
      brand: null,
      triggers: [],
      serving_g: 100,
      nutrition: dummyNutrition,
    };
    const itemAdIcinde: Alias = {
      id: "2",
      name: "Çıtır Yulaf",
      brand: null,
      triggers: [],
      serving_g: 100,
      nutrition: dummyNutrition,
    };
    const itemMarka: Alias = {
      id: "3",
      name: "Granola",
      brand: "Yulafix",
      triggers: [],
      serving_g: 100,
      nutrition: dummyNutrition,
    };
    const itemTetikleyici: Alias = {
      id: "4",
      name: "Kahvaltı Gevreği",
      brand: null,
      triggers: ["yulaf gevreği"],
      serving_g: 100,
      nutrition: dummyNutrition,
    };
    const itemHicbiri: Alias = {
      id: "5",
      name: "Elma",
      brand: null,
      triggers: [],
      serving_g: 100,
      nutrition: dummyNutrition,
    };

    expect(scoreQueryMatch(itemAdBastan, "yulaf")).toBe(4);
    expect(scoreQueryMatch(itemAdIcinde, "yulaf")).toBe(3);
    expect(scoreQueryMatch(itemMarka, "yulaf")).toBe(2);
    expect(scoreQueryMatch(itemTetikleyici, "yulaf")).toBe(1);
    expect(scoreQueryMatch(itemHicbiri, "yulaf")).toBe(0);

    const scores = [
      scoreQueryMatch(itemAdBastan, "yulaf"),
      scoreQueryMatch(itemAdIcinde, "yulaf"),
      scoreQueryMatch(itemMarka, "yulaf"),
      scoreQueryMatch(itemTetikleyici, "yulaf"),
      scoreQueryMatch(itemHicbiri, "yulaf"),
    ];

    expect(scores).toEqual([4, 3, 2, 1, 0]);
  });
});
