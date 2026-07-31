// ============================================================================
// Faz 8 — gün-tipli hedefler.
//
// Bu dosyanın ilk bölümü uygulamanın en riskli tek noktasını koruyor: v1 → v2
// şekil göçü. Kullanıcının GERÇEK hedefleri (2600 · 145 P · 360 K · 72 Y · 30 lif
// + mikro limitleri) bu yoldan geçiyor; bir basamağı bile değişirse hem günlük
// halka hem de bütün geçmiş grafikleri sessizce yanlış olur.
// ============================================================================
import { describe, expect, it } from "vitest";
import { parseGoals } from "./api";
import {
  DEFAULT_PROFILE_ID,
  REST_PROFILE_ID,
  TRAINING_PROFILE_ID,
  applySuggestion,
  effectiveGoal,
  effectiveProfile,
  hasOverride,
  nextProfileId,
  singleProfileConfig,
  suggestSplit,
  trainingDayCount,
  weeklyAverageGoal,
  withOverride,
} from "./goals";
import { MICROS } from "./nutrients";
import type { GoalConfig, Nutrition } from "../types";

/** Kullanıcının bugün üretimde duran hedefi — mikro limitleri Faz 2'den. */
const V1_GOAL = {
  kcal: 2600,
  protein: 145,
  carbs: 360,
  fat: 72,
  fiber: 30,
  sugar: 60,
  satFat: 24,
  sodium: 2300,
};

describe("parseGoals — v1 → v2 göçü", () => {
  it("kullanıcının sayıları BİREBİR korunur (mikrolar dahil)", () => {
    const c = parseGoals({ ...V1_GOAL });
    expect(c.version).toBe(2);
    expect(c.profiles).toHaveLength(1);
    expect(c.profiles[0].nutrition).toEqual(V1_GOAL);
    expect(c.defaultProfileId).toBe(c.profiles[0].id);
    expect(c.weekday).toEqual({});
    expect(c.overrides).toEqual({});
  });

  it("göç edilen hedef her gün geçerlidir (şablon boş, istisna yok)", () => {
    const c = parseGoals({ ...V1_GOAL });
    for (const date of ["2026-07-26", "2026-07-27", "2026-07-30", "2025-01-01"]) {
      expect(effectiveGoal(c, date)).toEqual(V1_GOAL);
    }
  });

  it("girilmemiş mikro 0'a çevrilmez ('bilinmiyor' ≠ 'sıfır')", () => {
    const c = parseGoals({ kcal: 2600, protein: 145, carbs: 360, fat: 72, fiber: 30 });
    const n = c.profiles[0].nutrition;
    for (const def of MICROS) expect(n[def.key]).toBeUndefined();
    expect(n).toEqual({ kcal: 2600, protein: 145, carbs: 360, fat: 72, fiber: 30 });
  });

  it("null gelen alanlar da 'bilinmiyor' kalır, çekirdek alan 0'a düşer", () => {
    const c = parseGoals({ kcal: 2600, protein: 145, carbs: 360, fat: 72, sodium: null });
    expect(c.profiles[0].nutrition).toEqual({
      kcal: 2600,
      protein: 145,
      carbs: 360,
      fat: 72,
      fiber: 0,
    });
  });

  it("göç FİKİR SABİTİDİR: v2'yi bir kez daha ayrıştırmak hiçbir şeyi değiştirmez", () => {
    const once = parseGoals({ ...V1_GOAL });
    expect(parseGoals(once)).toEqual(once);
    expect(parseGoals(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("zengin bir v2 yapı sunucu gidiş-dönüşünden değişmeden çıkar", () => {
    const rich = applySuggestion(parseGoals({ ...V1_GOAL }), 4);
    const withPin = withOverride(rich, "2026-07-30", REST_PROFILE_ID);
    // JSON turu: `weekday` anahtarları metne dönüşüyor — çözümlemenin bunu
    // fark etmemesi gerek.
    const roundTripped = parseGoals(JSON.parse(JSON.stringify(withPin)));
    expect(roundTripped).toEqual(withPin);
  });

  it("bozuk/eksik gövde uygulamayı çökertmez, sıfır hedefe düşer", () => {
    for (const raw of [undefined, null, "hedef", 42, [], {}, { version: 2 }, { profiles: [] }]) {
      const c = parseGoals(raw);
      expect(c.version).toBe(2);
      expect(c.profiles.length).toBeGreaterThan(0);
      expect(effectiveGoal(c, "2026-07-30").kcal).toBe(0);
    }
  });

  it("profilsiz/adsız satırlar elenir, kalanların adı boşsa id'ye düşer", () => {
    const c = parseGoals({
      version: 2,
      profiles: [
        { id: "", name: "Boş id", nutrition: { kcal: 1 } },
        { id: "a", name: "  ", nutrition: { kcal: 2000, protein: 100, carbs: 200, fat: 60, fiber: 20 } },
        { id: "a", name: "Kopya id", nutrition: { kcal: 9999 } },
        null,
      ],
      defaultProfileId: "yok-böyle-bir-profil",
    });
    expect(c.profiles).toHaveLength(1);
    expect(c.profiles[0]).toEqual({
      id: "a",
      name: "a",
      nutrition: { kcal: 2000, protein: 100, carbs: 200, fat: 60, fiber: 20 },
    });
    // Var olmayan varsayılan ilk profile düşer.
    expect(c.defaultProfileId).toBe("a");
  });

  it("geçersiz gün/tarih anahtarları ve metin olmayan değerler ayıklanır", () => {
    const c = parseGoals({
      version: 2,
      profiles: [{ id: "a", name: "A", nutrition: { kcal: 2000 } }],
      defaultProfileId: "a",
      weekday: { 0: "a", 6: "a", 7: "a", "-1": "a", x: "a", 3: 5 },
      overrides: { "2026-07-30": "a", "30.07.2026": "a", "2026-07-31": 7 },
    });
    expect(c.weekday).toEqual({ 0: "a", 6: "a" });
    expect(c.overrides).toEqual({ "2026-07-30": "a" });
  });

  it("BAYAT atama korunur — sunucu da onu reddetmiyor", () => {
    // Silinmiş bir profile işaret eden atamayı burada düşürmek, kullanıcının
    // atamasını sunucu gidiş-dönüşünde sessizce silmek olurdu.
    const c = parseGoals({
      version: 2,
      profiles: [{ id: "a", name: "A", nutrition: { kcal: 2000 } }],
      defaultProfileId: "a",
      weekday: { 1: "silinmis" },
      overrides: { "2026-07-30": "silinmis" },
    });
    expect(c.weekday[1]).toBe("silinmis");
    expect(c.overrides["2026-07-30"]).toBe("silinmis");
  });
});

describe("effectiveGoal — öncelik sırası", () => {
  const A: Nutrition = { kcal: 2000, protein: 100, carbs: 200, fat: 60, fiber: 20 };
  const B: Nutrition = { kcal: 3000, protein: 150, carbs: 300, fat: 90, fiber: 30 };
  const C: Nutrition = { kcal: 1000, protein: 50, carbs: 100, fat: 30, fiber: 10 };

  const config: GoalConfig = {
    version: 2,
    profiles: [
      { id: "a", name: "A", nutrition: A },
      { id: "b", name: "B", nutrition: B },
      { id: "c", name: "C", nutrition: C },
    ],
    defaultProfileId: "a",
    // 2026-07-30 Perşembe (4), 2026-07-31 Cuma (5).
    weekday: { 4: "b" },
    overrides: { "2026-07-30": "c" },
  };

  it("istisna > şablon", () => {
    expect(effectiveGoal(config, "2026-07-30")).toEqual(C);
  });
  it("şablon > varsayılan", () => {
    // 23 Tem 2026 de Perşembe: istisnası yok, şablonu var.
    expect(effectiveGoal(config, "2026-07-23")).toEqual(B);
  });
  it("ikisi de yoksa varsayılan", () => {
    expect(effectiveGoal(config, "2026-07-31")).toEqual(A);
  });
  it("gün sınırı UTC'de kayar değil (aynı tarih hep aynı gün tipi)", () => {
    expect(effectiveProfile(config, "2026-07-16").id).toBe("b"); // Perşembe
    expect(effectiveProfile(config, "2026-07-17").id).toBe("a"); // Cuma
  });
});

describe("effectiveGoal — silinmiş profile işaret eden atama", () => {
  const base: GoalConfig = {
    version: 2,
    profiles: [{ id: "a", name: "A", nutrition: { kcal: 2000, protein: 100, carbs: 200, fat: 60, fiber: 20 } }],
    defaultProfileId: "a",
    weekday: { 4: "silinmis" },
    overrides: { "2026-07-30": "silinmis" },
  };

  it("bayat istisna ve bayat şablon varsayılana düşer, PATLAMAZ", () => {
    expect(() => effectiveGoal(base, "2026-07-30")).not.toThrow();
    expect(effectiveProfile(base, "2026-07-30").id).toBe("a");
    expect(effectiveProfile(base, "2026-07-23").id).toBe("a");
  });

  it("varsayılanın kendisi de bayatsa ilk profile düşülür", () => {
    const c: GoalConfig = { ...base, defaultProfileId: "yok" };
    expect(effectiveProfile(c, "2026-07-30").id).toBe("a");
  });

  it("hasOverride bayat bir istisnayı 'var' saymaz", () => {
    // Rozet "bu güne özel" derken çözümlemenin gerçekten oraya gitmesi gerek.
    expect(hasOverride(base, "2026-07-30")).toBe(false);
    expect(hasOverride(withOverride(base, "2026-07-30", "a"), "2026-07-30")).toBe(true);
  });
});

describe("withOverride / nextProfileId — rozetin mantığı", () => {
  const config = applySuggestion(parseGoals({ ...V1_GOAL }), 4);

  it("istisna yazar ve siler, diğer günlere dokunmaz", () => {
    const pinned = withOverride(config, "2026-07-30", TRAINING_PROFILE_ID);
    expect(pinned.overrides).toEqual({ "2026-07-30": TRAINING_PROFILE_ID });
    expect(withOverride(pinned, "2026-07-30", null).overrides).toEqual({});
    expect(config.overrides).toEqual({}); // kaynak nesne değişmedi
  });

  it("halka sıradaki profile geçer, sonda başa döner", () => {
    expect(nextProfileId(config, TRAINING_PROFILE_ID)).toBe(REST_PROFILE_ID);
    expect(nextProfileId(config, REST_PROFILE_ID)).toBe(TRAINING_PROFILE_ID);
    expect(nextProfileId(config, "silinmis")).toBe(TRAINING_PROFILE_ID);
  });
});

describe("suggestSplit — haftalık ortalama korunur", () => {
  const BASE: Nutrition = { ...V1_GOAL };

  /** Haftalık kalori ortalaması. */
  function weeklyAvgKcal(t: number): number {
    const { training, rest } = suggestSplit(BASE, t);
    return (t * training.kcal + (7 - t) * rest.kcal) / 7;
  }

  it("3 / 4 / 5 antrenman gününde de ortalama tabanla aynı kalır", () => {
    for (const t of [3, 4, 5]) {
      // Sapma yalnızca 10'a yuvarlamadan gelir (< %0,2).
      expect(weeklyAvgKcal(t)).toBeCloseTo(BASE.kcal, -1);
      expect(Math.abs(weeklyAvgKcal(t) - BASE.kcal)).toBeLessThanOrEqual(5);
    }
  });

  it("antrenman günü sayısı değişince sayılar da değişir (sabit kodlanmamış)", () => {
    const a = suggestSplit(BASE, 3);
    const b = suggestSplit(BASE, 4);
    const c = suggestSplit(BASE, 5);
    expect(a.training.kcal).not.toBe(b.training.kcal);
    expect(b.training.kcal).not.toBe(c.training.kcal);
    // Az antrenman günü = o günlerin daha yüksek olması demek (bütçe sabit).
    expect(a.training.kcal).toBeGreaterThan(b.training.kcal);
    expect(a.rest.kcal).toBeGreaterThan(b.rest.kcal);
  });

  it("kullanıcının 4+3 düzeni ~2750 / ~2400'e iner", () => {
    const { training, rest } = suggestSplit(BASE, 4);
    expect(training.kcal).toBe(2760);
    expect(rest.kcal).toBe(2390);
    expect(training.kcal).toBeGreaterThan(rest.kcal);
  });

  it("0 ve 7 antrenman günü patlamaz (0'a bölme yok, saçma sayı yok)", () => {
    for (const t of [0, 7]) {
      const { training, rest } = suggestSplit(BASE, t);
      for (const n of [training, rest]) {
        expect(Number.isFinite(n.kcal)).toBe(true);
        expect(n.kcal).toBeGreaterThan(0);
        expect(n.carbs).toBeGreaterThanOrEqual(0);
      }
      // Kullanılan günlerin ortalaması yine taban.
      expect(weeklyAvgKcal(t)).toBeCloseTo(BASE.kcal, 6);
    }
    // Aralık dışı sayılar kırpılır.
    expect(suggestSplit(BASE, -3)).toEqual(suggestSplit(BASE, 0));
    expect(suggestSplit(BASE, 99)).toEqual(suggestSplit(BASE, 7));
  });

  it("YALNIZCA kalori ve karbonhidrat değişir; protein, lif, yağ ve mikrolar aynı", () => {
    const { training, rest } = suggestSplit(BASE, 4);
    for (const key of ["protein", "fat", "fiber", "sugar", "satFat", "sodium"] as const) {
      expect(training[key]).toBe(BASE[key]);
      expect(rest[key]).toBe(BASE[key]);
    }
    expect(training.kcal).not.toBe(rest.kcal);
    expect(training.carbs).not.toBe(rest.carbs);
  });

  it("kalori farkı karbonhidrattan gelir (4 kcal/g)", () => {
    const { training, rest } = suggestSplit(BASE, 4);
    // 370 kcal ÷ 4 = 92,5 g; karbonhidrat tam grama yuvarlandığı için fark en
    // fazla yarım gram sapabilir (bağlayıcı sayı kaloridir).
    const kcalDeltaAsCarbs = (training.kcal - rest.kcal) / 4;
    expect(Math.abs(kcalDeltaAsCarbs - (training.carbs - rest.carbs))).toBeLessThanOrEqual(0.5);
  });

  it("girilmemiş mikro girilmiş hâle GELMEZ", () => {
    const lean: Nutrition = { kcal: 2600, protein: 145, carbs: 360, fat: 72, fiber: 30 };
    const { training, rest } = suggestSplit(lean, 4);
    for (const def of MICROS) {
      expect(training[def.key]).toBeUndefined();
      expect(rest[def.key]).toBeUndefined();
    }
  });

  it("çok düşük karbonhidratlı tabanda karbonhidrat eksiye düşmez", () => {
    const keto: Nutrition = { kcal: 2600, protein: 200, carbs: 30, fat: 180, fiber: 20 };
    expect(suggestSplit(keto, 4).rest.carbs).toBeGreaterThanOrEqual(0);
  });
});

describe("applySuggestion — form düğmesinin ürettiği yapı", () => {
  const v1 = parseGoals({ ...V1_GOAL });

  it("iki profil kurar, haftayı dağıtır, varsayılan dinlenme olur", () => {
    const c = applySuggestion(v1, 4);
    expect(c.profiles.map((p) => p.id)).toEqual([TRAINING_PROFILE_ID, REST_PROFILE_ID]);
    expect(c.defaultProfileId).toBe(REST_PROFILE_ID);
    expect(trainingDayCount(c)).toBe(4);
    expect(Object.keys(c.weekday)).toHaveLength(7);
  });

  it("haftalık ortalama kullanıcının eski tek hedefiyle aynı kalır", () => {
    for (const t of [0, 3, 4, 5, 7]) {
      const avg = weeklyAverageGoal(applySuggestion(v1, t));
      expect(Math.abs(avg.kcal - V1_GOAL.kcal)).toBeLessThanOrEqual(5);
      // Protein/lif/mikro haftanın her günü aynı olduğu için ortalamaları da taban.
      expect(avg.protein).toBe(V1_GOAL.protein);
      expect(avg.fiber).toBe(V1_GOAL.fiber);
      expect(avg.sodium).toBe(V1_GOAL.sodium);
    }
  });

  it("kendi çıktısına yeniden uygulanınca ortalama KAYMAZ", () => {
    let c = applySuggestion(v1, 4);
    for (let i = 0; i < 5; i++) c = applySuggestion(c, 4);
    expect(weeklyAverageGoal(c).kcal).toBeCloseTo(2601.43, 1);
    expect(c.profiles[0].nutrition.kcal).toBe(2760);
    expect(c.profiles[1].nutrition.kcal).toBe(2390);
  });

  it("hâlâ geçerli olan günlük istisnalar korunur, ölüler atılır", () => {
    const withPins = {
      ...v1,
      overrides: { "2026-07-30": TRAINING_PROFILE_ID, "2026-07-29": "silinmis" },
    };
    const c = applySuggestion(withPins, 4);
    expect(c.overrides).toEqual({ "2026-07-30": TRAINING_PROFILE_ID });
  });

  it("gövde backend sözleşmesine uyar (profiller dolu, varsayılan var olan bir profil)", () => {
    const c = applySuggestion(v1, 4);
    expect(c.version).toBe(2);
    expect(c.profiles.length).toBeGreaterThan(0);
    for (const p of c.profiles) {
      expect(p.id.trim()).not.toBe("");
      expect(p.name.trim()).not.toBe("");
      expect(Object.values(p.nutrition).every((v) => typeof v === "number" && Number.isFinite(v))).toBe(true);
    }
    expect(c.profiles.some((p) => p.id === c.defaultProfileId)).toBe(true);
    for (const v of [...Object.values(c.weekday), ...Object.values(c.overrides)]) {
      expect(typeof v).toBe("string");
    }
  });
});

describe("weeklyAverageGoal", () => {
  it("tek profilde ortalama profilin kendisidir", () => {
    expect(weeklyAverageGoal(singleProfileConfig({ ...V1_GOAL }))).toEqual(V1_GOAL);
  });

  it("günlük istisnalar ortalamaya girmez (şablon haftalıktır)", () => {
    const c = singleProfileConfig({ ...V1_GOAL });
    const withPin = withOverride(
      { ...c, profiles: [...c.profiles, { id: "x", name: "X", nutrition: { ...V1_GOAL, kcal: 9999 } }] },
      "2026-07-30",
      "x",
    );
    expect(weeklyAverageGoal(withPin).kcal).toBe(V1_GOAL.kcal);
  });

  it("bir profilde girilmemiş mikro varsa o besinin ortalaması da yoktur", () => {
    const c: GoalConfig = {
      version: 2,
      profiles: [
        { id: "a", name: "A", nutrition: { ...V1_GOAL } },
        { id: "b", name: "B", nutrition: { kcal: 2000, protein: 145, carbs: 200, fat: 72, fiber: 30 } },
      ],
      defaultProfileId: "a",
      weekday: { 0: "b" },
      overrides: {},
    };
    const avg = weeklyAverageGoal(c);
    expect(avg.sodium).toBeUndefined();
    expect(avg.kcal).toBeCloseTo((6 * 2600 + 2000) / 7, 6);
  });

  it("varsayılan profil kimliği bozuksa bile bir sayı döner", () => {
    const c = { ...singleProfileConfig({ ...V1_GOAL }), defaultProfileId: "yok" };
    expect(weeklyAverageGoal(c).kcal).toBe(V1_GOAL.kcal);
  });
});

describe("singleProfileConfig", () => {
  it("varsayılan kimlik ve boş şablonla sarar", () => {
    const c = singleProfileConfig({ ...V1_GOAL });
    expect(c.profiles[0].id).toBe(DEFAULT_PROFILE_ID);
    expect(c.defaultProfileId).toBe(DEFAULT_PROFILE_ID);
    expect(trainingDayCount(c)).toBe(0);
  });
});
