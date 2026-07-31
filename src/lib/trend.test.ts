import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTrend, formatNutrientValue, trendStats } from "./trend";
import type { TrendGoal, TrendSeries } from "./trend";
import { effectiveGoal, weeklyAverageGoal } from "./goals";
import { nutrientOf } from "./nutrients";
import type { Days } from "./days";
import type { GoalConfig, MealItem, Nutrition } from "../types";

// Tüm aralıklar "bugün"e göre kurulduğu için saat sabitlenir. Yerel saatle
// kurulan tarih: `todayISO()` yerel alanları okuyor, zaman dilimi kaymaz.
const TODAY = "2026-07-30";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 12, 0, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

const GOAL: Nutrition = { kcal: 2600, protein: 145, carbs: 360, fat: 72, fiber: 30 };
const KCAL = nutrientOf("kcal");
const PROTEIN = nutrientOf("protein");

/** Faz 2'den beri gerçek kayıttan geliyor — limit dalı artık yerine geçen bir
 *  tanımla değil, uygulamanın kendi sodyum tanımıyla test ediliyor. */
const SODIUM_LIMIT = nutrientOf("sodium");

/** Gün-tipi öncesi davranış: her gün aynı hedef, çizgi de o hedefte. */
function flat(goal: Nutrition): TrendGoal {
  return { of: () => goal, line: goal };
}

/** Gün-tipli hedef kaynağı: uyum günlük hedefe, çizgi haftalık ortalamaya. */
function fromConfig(config: GoalConfig): TrendGoal {
  return { of: (date) => effectiveGoal(config, date), line: weeklyAverageGoal(config) };
}

function meals(kcal: number, extra: Partial<Nutrition> = {}): MealItem[] {
  return [
    {
      id: "m",
      label: "öğün",
      computed: { kcal, protein: kcal / 20, carbs: 0, fat: 0, fiber: 0, ...extra },
    },
  ];
}

/** Tarih → kcal eşlemesinden `Days` kurar. */
function daysOf(map: Record<string, number>): Days {
  const out: Days = {};
  for (const [date, kcal] of Object.entries(map)) out[date] = meals(kcal);
  return out;
}

/** `start`'tan başlayarak ardışık günler; `null` = O GÜN HİÇ KAYIT YOK. */
function run(start: string, kcals: (number | null)[]): Days {
  const out: Days = {};
  const [y, m, d] = start.split("-").map(Number);
  kcals.forEach((kcal, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    if (kcal !== null) out[dt.toISOString().slice(0, 10)] = meals(kcal);
  });
  return out;
}

/** Değerleri bugünle BİTEN ardışık günlere yerleştirir. */
function endingToday(kcals: (number | null)[]): Days {
  const start = new Date(Date.UTC(2026, 6, 30 - (kcals.length - 1))).toISOString().slice(0, 10);
  return run(start, kcals);
}

describe("buildTrend — aralık sınırları", () => {
  it("7 gün: bugünle biten tam 7 nokta", () => {
    const s = buildTrend({}, "kcal", 7, flat(GOAL));
    expect(s.points).toHaveLength(7);
    expect(s.points[0].date).toBe("2026-07-24");
    expect(s.points[6].date).toBe(TODAY);
  });
  it("30 ve 90 gün de bugünle biter", () => {
    const a = buildTrend({}, "kcal", 30, flat(GOAL));
    expect(a.points).toHaveLength(30);
    expect(a.points[0].date).toBe("2026-07-01");
    expect(a.points[29].date).toBe(TODAY);

    const b = buildTrend({}, "kcal", 90, flat(GOAL));
    expect(b.points).toHaveLength(90);
    expect(b.points[0].date).toBe("2026-05-02");
    expect(b.points[89].date).toBe(TODAY);
  });
  it("Tümü: en eski kayıttan bugüne", () => {
    const s = buildTrend(daysOf({ "2026-07-20": 2000, "2026-07-23": 2100 }), "kcal", "all", flat(GOAL));
    expect(s.points[0].date).toBe("2026-07-20");
    expect(s.points[s.points.length - 1].date).toBe(TODAY);
    expect(s.points).toHaveLength(11); // 20 Tem … 30 Tem dahil
  });
  it("Tümü + hiç kayıt yok: boş seri, yMax yine pozitif (0'a bölme yok)", () => {
    const s = buildTrend({}, "kcal", "all", flat(GOAL));
    expect(s.points).toEqual([]);
    expect(s.dataCount).toBe(0);
    expect(s.yMax).toBeGreaterThan(0);
  });
  it("Tümü + tek kayıt bugün: tek noktalı seri (n === 1)", () => {
    const s = buildTrend(daysOf({ [TODAY]: 2000 }), "kcal", "all", flat(GOAL));
    expect(s.points).toHaveLength(1);
    expect(s.points[0]).toEqual({ date: TODAY, value: 2000, avg: null, goal: 2600 });
    expect(s.dataCount).toBe(1);
  });
  it("kayıtsız aralıkta 7 nokta da null, sayaç 0", () => {
    const s = buildTrend({}, "kcal", 7, flat(GOAL));
    expect(s.points.every((p) => p.value === null && p.avg === null)).toBe(true);
    expect(s.dataCount).toBe(0);
  });
});

describe("buildTrend — kayıtsız gün null kalır (asla 0)", () => {
  // DİKKAT: `buildTrend` bu describe'ın GÖVDESİNDE çağrılmamalı. Gövde toplama
  // aşamasında, yani `beforeAll` sahte saati kurmadan ÖNCE çalışır; oradaki
  // çağrı gerçek tarihi görür ve gerçek gün 2026-07-30'u geçtiğinde pencere
  // kayarak test kendiliğinden kırılır. Bu yüzden her çağrı `it()` içinde.
  const days = () => daysOf({ "2026-07-28": 2000, [TODAY]: 2200 });

  it("boşluklar null, 0 değil", () => {
    const s = buildTrend(days(), "kcal", 7, flat(GOAL));
    expect(s.points.map((p) => p.value)).toEqual([null, null, null, null, 2000, null, 2200]);
    expect(s.points.some((p) => p.value === 0)).toBe(false);
  });
  it("dataCount yalnızca verisi olan günleri sayar", () => {
    expect(buildTrend(days(), "kcal", 7, flat(GOAL)).dataCount).toBe(2);
  });
  it("kaydı olan ama bu besinde verisi olmayan gün de null (bilinmiyor ≠ sıfır)", () => {
    // Öğünlerde sodyum hiç girilmemiş: gün KAYITLI ama sodyum bilinmiyor.
    const micro = buildTrend(days(), "sodium", 7, flat(GOAL));
    expect(micro.points.every((p) => p.value === null)).toBe(true);
    expect(micro.dataCount).toBe(0);
  });
  it("girilmiş mikro besin verisi görünür", () => {
    const withSodium: Days = { ...days(), [TODAY]: meals(2200, { sodium: 1400 }) };
    const micro = buildTrend(withSodium, "sodium", 7, flat(GOAL));
    expect(micro.points[6].value).toBe(1400);
    expect(micro.dataCount).toBe(1);
  });
});

describe("buildTrend — 7 günlük hareketli ortalama", () => {
  it("pencerede 2 veri günü varsa ortalama YOK", () => {
    const s = buildTrend(daysOf({ "2026-07-29": 2000, [TODAY]: 2200 }), "kcal", 7, flat(GOAL));
    expect(s.points.every((p) => p.avg === null)).toBe(true);
  });
  it("3. veri gününde ortalama başlar", () => {
    const s = buildTrend(run("2026-07-28", [1000, 2000, 3000]), "kcal", 7, flat(GOAL));
    const avgs = s.points.map((p) => p.avg);
    expect(avgs.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(avgs[6]).toBe(2000); // (1000+2000+3000)/3 — 7'ye BÖLÜNMEZ
  });
  it("yalnızca verisi olan günler üzerinden ortalar (eksik gün 0 sayılmaz)", () => {
    // 3 veri günü + 4 boşluk: 7'ye bölünse 1714 çıkardı.
    const s = buildTrend(
      run("2026-07-24", [3000, null, 3000, null, 3000, null, null]),
      "kcal",
      7,
      flat(GOAL),
    );
    expect(s.points[6].avg).toBe(3000);
  });
  it("pencere kayarken eski günler düşer", () => {
    // 8 gün: ilk gün 8. günün penceresine girmez.
    const s = buildTrend(
      run("2026-07-23", [10, 100, 100, 100, 100, 100, 100, 100]),
      "kcal",
      7,
      flat(GOAL),
    );
    const last = s.points[s.points.length - 1];
    expect(last.date).toBe(TODAY);
    expect(last.avg).toBe(100); // 10 pencereden çıktı
  });
  it("ortalama görünür aralığın SOLUNDAKİ günleri de kullanır", () => {
    // 7 günlük görünüm ama veri 14 gün geriye gidiyor: ilk görünen günün
    // ortalaması kendinden önceki 6 günü (1000) de görmek zorunda.
    const days: Days = {
      ...run("2026-07-18", Array(6).fill(1000)),
      ...run("2026-07-24", Array(7).fill(2000)),
    };
    const s = buildTrend(days, "kcal", 7, flat(GOAL));
    expect(s.points[0].date).toBe("2026-07-24");
    expect(s.points[0].avg).toBeCloseTo((6 * 1000 + 2000) / 7, 6);
    expect(s.points[6].avg).toBe(2000); // pencere tamamen yeni günlerde
  });
});

describe("buildTrend — hedef ve yMax", () => {
  it("yMax = max(değer, hedef) * 1.1", () => {
    expect(buildTrend(daysOf({ [TODAY]: 3000 }), "kcal", 7, flat(GOAL)).yMax).toBeCloseTo(3300, 6);
    expect(buildTrend(daysOf({ [TODAY]: 1000 }), "kcal", 7, flat(GOAL)).yMax).toBeCloseTo(2860, 6);
  });
  it("hedef 0 / girilmemiş ise hedef yok", () => {
    expect(buildTrend({}, "kcal", 7, flat({ ...GOAL, kcal: 0 })).goal).toBeNull();
    expect(buildTrend({}, "sodium", 7, flat(GOAL)).goal).toBeNull();
    expect(buildTrend({}, "kcal", 7, flat(GOAL)).goal).toBe(2600);
  });
  it("her şey 0 iken bile yMax pozitif", () => {
    expect(
      buildTrend(daysOf({ [TODAY]: 0 }), "kcal", 7, flat({ ...GOAL, kcal: 0 })).yMax,
    ).toBeGreaterThan(0);
  });
});

describe("trendStats", () => {
  /** Test için seri: verilen değerler bugünle biten ardışık günler. */
  function seriesOf(values: number[], goal = 2600): TrendSeries {
    return buildTrend(endingToday(values), "kcal", "all", flat({ ...GOAL, kcal: goal }));
  }

  it("son 7 kayıtlı günü ve ondan öncekileri ayrı ortalar", () => {
    // 14 gün: ilk 7'si 2000, son 7'si 2400.
    const s = seriesOf([...Array(7).fill(2000), ...Array(7).fill(2400)]);
    const st = trendStats(s, KCAL);
    expect(st.recentAvg).toBe(2400);
    expect(st.prevAvg).toBe(2000);
    expect(st.changePct).toBeCloseTo(20, 6);
  });
  it("önceki pencere için veri yoksa değişim yok", () => {
    const s = seriesOf([2000, 2100, 2200]);
    const st = trendStats(s, KCAL);
    expect(st.recentAvg).toBeCloseTo(2100, 6);
    expect(st.prevAvg).toBeNull();
    expect(st.changePct).toBeNull();
  });
  it("hiç veri yoksa ortalamalar null", () => {
    const st = trendStats(buildTrend({}, "kcal", 7, flat(GOAL)), KCAL);
    expect(st.recentAvg).toBeNull();
    expect(st.prevAvg).toBeNull();
    expect(st.changePct).toBeNull();
  });
  it("önceki ortalama 0 ise yüzde hesaplanmaz (0'a bölme yok)", () => {
    const s = seriesOf([...Array(7).fill(0), ...Array(7).fill(2400)]);
    const st = trendStats(s, KCAL);
    expect(st.prevAvg).toBe(0);
    expect(st.changePct).toBeNull();
  });

  it("target besinde hedefin %90'ı tutturuldu sayılır", () => {
    const s = seriesOf([90, 89, 100, 130], 100);
    const st = trendStats(s, KCAL);
    expect(st.ratedDays).toBe(4);
    expect(st.onTargetDays).toBe(3); // 89 eşiğin altında
  });
  it("limit besinde hedefi AŞMAMAK tutturmaktır", () => {
    const s = seriesOf([90, 100, 101, 130], 100);
    const st = trendStats(s, SODIUM_LIMIT);
    expect(st.ratedDays).toBe(4);
    expect(st.onTargetDays).toBe(2); // 90 ve 100 limit içinde
  });
  it("hedef yoksa hiçbir gün değerlendirilmez", () => {
    // Hedef 0 = "girilmemiş": ne çizgi çizilir ne de gün değerlendirilir.
    const s = seriesOf([2000, 2400, 2800], 0);
    const st = trendStats(s, KCAL);
    expect(s.goal).toBeNull();
    expect(s.points.every((p) => p.goal === null)).toBe(true);
    expect(st.ratedDays).toBe(0);
    expect(st.onTargetDays).toBe(0);
  });
  it("boşluklu seride yalnızca kayıtlı günler sayılır", () => {
    const days = run("2026-07-24", [2600, null, null, 2600, null, null, 1000]);
    const s = buildTrend(days, "kcal", 7, flat(GOAL));
    const st = trendStats(s, KCAL);
    expect(st.ratedDays).toBe(3);
    expect(st.onTargetDays).toBe(2);
    expect(st.recentAvg).toBeCloseTo((2600 + 2600 + 1000) / 3, 6);
  });
  it("protein gibi başka besinlerde de aynı mantık", () => {
    const days = run("2026-07-28", [2000, 2000, 2000]); // protein = kcal/20 = 100
    const s = buildTrend(days, "protein", 7, flat({ ...GOAL, protein: 100 }));
    const st = trendStats(s, PROTEIN);
    expect(s.points[6].value).toBe(100);
    expect(st.onTargetDays).toBe(3);
  });
});

describe("gün-tipli hedefler (Faz 8)", () => {
  // 24–30 Tem 2026 penceresi: Cum, Cmt, Paz, Pzt, Sal, Çar, Per.
  // Şablon Pzt/Sal/Per/Cum'u antrenmana veriyor → pencerede 4 antrenman + 3
  // dinlenme günü, yani kullanıcının gerçek düzeni.
  const TRAINING: Nutrition = { ...GOAL, kcal: 2760, carbs: 400 };
  const REST: Nutrition = { ...GOAL, kcal: 2390, carbs: 308 };
  const config = (overrides: Record<string, string> = {}): GoalConfig => ({
    version: 2,
    profiles: [
      { id: "training", name: "Antrenman", nutrition: TRAINING },
      { id: "rest", name: "Dinlenme", nutrition: REST },
    ],
    defaultProfileId: "rest",
    weekday: { 1: "training", 2: "training", 4: "training", 5: "training" },
    overrides,
  });

  it("her nokta KENDİ gününün hedefini taşır", () => {
    const s = buildTrend(endingToday(Array(7).fill(2400)), "kcal", 7, fromConfig(config()));
    expect(s.points.map((p) => p.goal)).toEqual([2760, 2390, 2390, 2760, 2760, 2390, 2760]);
  });

  it("grafiğin hedef ÇİZGİSİ düz kalır: haftalık ortalama", () => {
    const s = buildTrend(endingToday(Array(7).fill(2400)), "kcal", 7, fromConfig(config()));
    // (4 × 2760 + 3 × 2390) / 7 — testere dişi değil, tek bir sayı.
    expect(s.goal).toBeCloseTo((4 * 2760 + 3 * 2390) / 7, 6);
  });

  it("uyum GÜNLÜK hedefe göre sayılır (düz ortalamaya göre değil)", () => {
    const s = buildTrend(endingToday(Array(7).fill(2400)), "kcal", 7, fromConfig(config()));
    const st = trendStats(s, KCAL);
    // 2.400 kcal: dinlenme gününde hedefin %90'ı üstünde (2.151), antrenman
    // gününde altında (2.484). Düz 2.601 ortalamasına göre sayılsaydı 7/7
    // çıkardı — istatistiğin anlamı tam da burada.
    expect(st.ratedDays).toBe(7);
    expect(st.onTargetDays).toBe(3);
  });

  it("tek günlük istisna o günün hedefini de değiştirir", () => {
    const s = buildTrend(
      endingToday(Array(7).fill(2400)),
      "kcal",
      7,
      fromConfig(config({ [TODAY]: "rest" })),
    );
    expect(s.points[6].goal).toBe(2390);
    expect(trendStats(s, KCAL).onTargetDays).toBe(4);
  });

  it("iki günde de aynı olan besinde hedef sabittir (protein)", () => {
    const s = buildTrend(endingToday(Array(7).fill(2400)), "protein", 7, fromConfig(config()));
    expect(s.points.every((p) => p.goal === 145)).toBe(true);
    expect(s.goal).toBe(145);
  });
});

describe("formatNutrientValue", () => {
  it("kayıttaki hassasiyeti ve birimi kullanır (tr-TR)", () => {
    expect(formatNutrientValue(KCAL, 2400)).toBe("2.400 kcal");
    expect(formatNutrientValue(PROTEIN, 145.25)).toBe("145,3 g");
    expect(formatNutrientValue(SODIUM_LIMIT, 1400)).toBe("1.400 mg");
  });
});
