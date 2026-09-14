import { describe, expect, it } from "vitest";
import {
  EMPTY_WEIGHT,
  buildWeightSeries,
  latestEntry,
  latestEntryBefore,
  parseBodyStats,
  parseWeightConfig,
  profileWeightEntries,
  seedEntry,
  sortedEntries,
  weightDelta,
  weightProgress,
  withWeightEntry,
} from "./weight";
import type { AppConfig } from "../types";
import { addDaysISO, todayISO } from "./format";

describe("weight", () => {
  describe("parseWeightConfig", () => {
    it("returns empty entries for empty or null config", () => {
      expect(parseWeightConfig({})).toEqual(EMPTY_WEIGHT);
      expect(parseWeightConfig(null as unknown as AppConfig)).toEqual(EMPTY_WEIGHT);
    });

    it("parses valid weight config correctly", () => {
      const config: AppConfig = {
        weight: {
          entries: {
            "2026-08-01": 75.5,
            "2026-08-02": 75.2,
          },
        },
      };
      const result = parseWeightConfig(config);
      expect(result).toEqual({
        entries: {
          "2026-08-01": 75.5,
          "2026-08-02": 75.2,
        },
      });
    });

    it("skips invalid date formats", () => {
      const config: AppConfig = {
        weight: {
          entries: {
            "2026/08/01": 75.5,
            "2026-8-1": 74.0,
            invalid: 70.0,
            "2026-08-01": 75.5,
          },
        },
      };
      const result = parseWeightConfig(config);
      expect(result.entries).toEqual({
        "2026-08-01": 75.5,
      });
    });

    it("skips non-positive, non-finite, or non-number values", () => {
      const config: AppConfig = {
        weight: {
          entries: {
            "2026-08-01": 75.5,
            "2026-08-02": 0,
            "2026-08-03": -5,
            "2026-08-04": Number.NaN,
            "2026-08-05": Number.POSITIVE_INFINITY,
            "2026-08-06": "75.5" as unknown as number,
            "2026-08-07": null as unknown as number,
          },
        },
      };
      const result = parseWeightConfig(config);
      expect(result.entries).toEqual({
        "2026-08-01": 75.5,
      });
    });

    it("rejects array for weight or entries", () => {
      const config1: AppConfig = { weight: [] as unknown as Record<string, unknown> };
      expect(parseWeightConfig(config1)).toEqual(EMPTY_WEIGHT);

      const config2: AppConfig = {
        weight: { entries: [75.5] as unknown as Record<string, unknown> },
      };
      expect(parseWeightConfig(config2)).toEqual(EMPTY_WEIGHT);
    });
  });

  describe("withWeightEntry", () => {
    // Bug: SettingsSheet > Profil kilosu, WeightCard'ın ("weight" / {entries})
    // yazma desenini KULLANMIYOR, ayrı bir `weight_${tarih}` config anahtarına
    // yazıyordu — kilo kartı/trendi bunu hiç görmüyordu. withWeightEntry ikisinin
    // ortak, tek çekirdek fonksiyonu.
    it("boş entries'e yeni bir tarih ekler", () => {
      expect(withWeightEntry({}, "2026-08-05", 78)).toEqual({ "2026-08-05": 78 });
    });

    it("mevcut girdileri KORUYARAK sadece verilen tarihi ekler/günceller", () => {
      const entries = { "2026-08-01": 79.5, "2026-08-03": 79.0 };
      expect(withWeightEntry(entries, "2026-08-05", 78.2)).toEqual({
        "2026-08-01": 79.5,
        "2026-08-03": 79.0,
        "2026-08-05": 78.2,
      });
    });

    it("aynı tarihe ikinci yazım öncekini günceller (üzerine yazar)", () => {
      const entries = { "2026-08-05": 80 };
      expect(withWeightEntry(entries, "2026-08-05", 78)).toEqual({ "2026-08-05": 78 });
    });

    it("orijinal entries nesnesini mutasyona uğratmaz", () => {
      const entries = { "2026-08-01": 79.5 };
      withWeightEntry(entries, "2026-08-05", 78);
      expect(entries).toEqual({ "2026-08-01": 79.5 });
    });

    it("geçersiz (<=0 veya finite olmayan) kg'de entries değişmeden döner", () => {
      const entries = { "2026-08-01": 79.5 };
      expect(withWeightEntry(entries, "2026-08-05", 0)).toBe(entries);
      expect(withWeightEntry(entries, "2026-08-05", -5)).toBe(entries);
      expect(withWeightEntry(entries, "2026-08-05", Number.NaN)).toBe(entries);
    });
  });

  describe("latestEntryBefore", () => {
    const entries = {
      "2026-07-25": 76.0,
      "2026-07-30": 75.5,
      "2026-08-02": 75.0,
    };

    it("finds closest earlier date", () => {
      expect(latestEntryBefore(entries, "2026-08-02")).toEqual({
        date: "2026-07-30",
        kg: 75.5,
      });
      expect(latestEntryBefore(entries, "2026-07-30")).toEqual({
        date: "2026-07-25",
        kg: 76.0,
      });
    });

    it("returns null when no earlier date exists", () => {
      expect(latestEntryBefore(entries, "2026-07-25")).toBeNull();
      expect(latestEntryBefore(entries, "2026-07-20")).toBeNull();
    });
  });

  describe("weightDelta", () => {
    const entries = {
      "2026-07-25": 76.0,
      "2026-07-30": 75.5,
      "2026-08-02": 75.8,
    };

    it("calculates correct positive and negative delta", () => {
      // 75.5 - 76.0 = -0.5
      expect(weightDelta(entries, "2026-07-30")).toBeCloseTo(-0.5);
      // 75.8 - 75.5 = 0.3
      expect(weightDelta(entries, "2026-08-02")).toBeCloseTo(0.3);
    });

    it("returns null if entry on date is missing or no earlier entry exists", () => {
      expect(weightDelta(entries, "2026-08-01")).toBeNull();
      expect(weightDelta(entries, "2026-07-25")).toBeNull();
    });
  });

  describe("buildWeightSeries", () => {
    it("returns empty array for range 'all' when entries is empty", () => {
      expect(buildWeightSeries({}, "all")).toEqual([]);
    });

    it("builds calendar series with null for missing days", () => {
      const today = todayISO();
      const d1 = addDaysISO(today, -2);
      const d2 = today;

      const entries = {
        [d1]: 80.0,
        [d2]: 79.5,
      };

      const series = buildWeightSeries(entries, 7);
      expect(series.length).toBe(7);
      expect(series[series.length - 1].date).toBe(today);

      const pt1 = series.find((p) => p.date === d1);
      const pt2 = series.find((p) => p.date === d2);
      const ptMissing = series.find((p) => p.date === addDaysISO(today, -1));

      expect(pt1).toEqual({ date: d1, kg: 80.0 });
      expect(pt2).toEqual({ date: d2, kg: 79.5 });
      expect(ptMissing).toEqual({ date: addDaysISO(today, -1), kg: null });
    });

    it("starts from earliest date for range 'all'", () => {
      const today = todayISO();
      const dOld = addDaysISO(today, -10);
      const entries = { [dOld]: 82.0, [today]: 81.0 };

      const series = buildWeightSeries(entries, "all");
      expect(series.length).toBe(11); // -10 to 0 inclusive
      expect(series[0].date).toBe(dOld);
      expect(series[series.length - 1].date).toBe(today);
    });
  });

  // ------------------------------------------------------------------------
  // v0.30.1: Ayarlar > Kilo & Vücut Geçmişi ekranı gerçek veriye bağlanırken
  // eklenen çekirdek. Ekranın gösterdiği HER sayı buradan geçer — "mevcut
  // kilo", "yolun %x'i", "kalan kg" uydurulamaz.
  // ------------------------------------------------------------------------

  describe("sortedEntries", () => {
    it("tarihe göre ARTAN sıralar (giriş sırasına güvenmez)", () => {
      const entries = { "2026-08-05": 78, "2026-07-25": 80, "2026-08-01": 79 };
      expect(sortedEntries(entries)).toEqual([
        { date: "2026-07-25", kg: 80 },
        { date: "2026-08-01", kg: 79 },
        { date: "2026-08-05", kg: 78 },
      ]);
    });

    it("boş entries'te boş dizi döner", () => {
      expect(sortedEntries({})).toEqual([]);
    });
  });

  describe("latestEntry", () => {
    it("en büyük TARİHLİ ölçümü döner (en son eklenen değil)", () => {
      const entries = { "2026-07-25": 80, "2026-08-05": 76.5, "2026-08-01": 79 };
      expect(latestEntry(entries)).toEqual({ date: "2026-08-05", kg: 76.5 });
    });

    it("kayıt yoksa null döner (uydurma varsayılan YOK)", () => {
      expect(latestEntry({})).toBeNull();
    });
  });

  describe("seedEntry — gerçek ölçüm, form değerini yener", () => {
    it("o gün için kayıt yoksa yazar", () => {
      expect(seedEntry({}, "2026-09-15", 82)).toEqual({ "2026-09-15": 82 });
    });

    it("o gün için kayıt VARSA dokunmaz (ölçüm silinmez)", () => {
      const entries = { "2026-09-15": 79.2 };
      expect(seedEntry(entries, "2026-09-15", 82)).toBe(entries);
    });

    it("geçersiz kg'de entries değişmeden döner", () => {
      const entries = { "2026-09-10": 80 };
      expect(seedEntry(entries, "2026-09-15", 0)).toBe(entries);
    });
  });

  describe("profileWeightEntries — yalnızca kilo alanı düzenlendiyse yazar", () => {
    // Sadece ismi düzeltmek için "Profili Kaydet"e basmak, form açılışında
    // okunan bayat kilo değerini bugünün gerçek ölçümünün üzerine yazıyordu.
    it("weightChanged=false ise entries'e DOKUNMAZ", () => {
      const entries = { "2026-09-15": 79.2 };
      expect(profileWeightEntries(entries, "2026-09-15", 82, false)).toBe(entries);
    });

    it("weightChanged=true ise bugünün ölçümünü günceller", () => {
      expect(profileWeightEntries({ "2026-09-15": 79.2 }, "2026-09-15", 82, true)).toEqual({
        "2026-09-15": 82,
      });
    });

    it("weightChanged=true olsa bile geçersiz kg yazılmaz", () => {
      const entries = { "2026-09-10": 80 };
      expect(profileWeightEntries(entries, "2026-09-15", -1, true)).toBe(entries);
    });
  });

  describe("parseBodyStats", () => {
    it("profil alanlarını okur", () => {
      expect(
        parseBodyStats({ profile: { weightKg: 82.5, targetWeightKg: 74, heightCm: 178 } }),
      ).toEqual({ weightKg: 82.5, targetWeightKg: 74, heightCm: 178 });
    });

    it("profil yoksa hepsi null — 0 ya da 78 gibi uydurma varsayılan DEĞİL", () => {
      expect(parseBodyStats({})).toEqual({ weightKg: null, targetWeightKg: null, heightCm: null });
      expect(parseBodyStats({ profile: null as unknown as Record<string, unknown> })).toEqual({
        weightKg: null,
        targetWeightKg: null,
        heightCm: null,
      });
    });

    it("geçersiz/0/negatif alanları null'a düşürür", () => {
      expect(
        parseBodyStats({
          profile: { weightKg: 0, targetWeightKg: -5, heightCm: "178" as unknown as number },
        }),
      ).toEqual({ weightKg: null, targetWeightKg: null, heightCm: null });
    });
  });

  describe("weightProgress — yolun ne kadarı alındı", () => {
    it("hiç ölçüm yoksa null", () => {
      expect(weightProgress({}, 74)).toBeNull();
    });

    it("kilo VERME: 85 → 80, hedef 75 → %50", () => {
      const p = weightProgress({ "2026-08-01": 85, "2026-09-01": 80 }, 75)!;
      expect(p.direction).toBe("loss");
      expect(p.pct).toBeCloseTo(0.5);
      expect(p.remainingKg).toBeCloseTo(5);
      expect(p.start).toEqual({ date: "2026-08-01", kg: 85 });
      expect(p.current).toEqual({ date: "2026-09-01", kg: 80 });
    });

    it("kilo ALMA: 60 → 65, hedef 70 → %50", () => {
      const p = weightProgress({ "2026-08-01": 60, "2026-09-01": 65 }, 70)!;
      expect(p.direction).toBe("gain");
      expect(p.pct).toBeCloseTo(0.5);
      expect(p.remainingKg).toBeCloseTo(-5);
    });

    it("hedef AŞILDIĞINDA %100'de kırpılır (negatif ya da >1 yüzde yok)", () => {
      const p = weightProgress({ "2026-08-01": 85, "2026-09-01": 72 }, 75)!;
      expect(p.pct).toBe(1);
      expect(p.remainingKg).toBeCloseTo(-3);
    });

    it("geriye gidildiğinde %0'da kırpılır (çubuk negatif genişlik üretmez)", () => {
      const p = weightProgress({ "2026-08-01": 85, "2026-09-01": 87 }, 75)!;
      expect(p.pct).toBe(0);
    });

    it("tek ölçümde yol henüz başlamamış: pct 0", () => {
      const p = weightProgress({ "2026-09-15": 80 }, 75)!;
      expect(p.pct).toBe(0);
      expect(p.start).toEqual(p.current);
    });

    it("başlangıç = hedef ise yüzde anlamsız: pct null, direction hold", () => {
      const p = weightProgress({ "2026-09-15": 75 }, 75)!;
      expect(p.pct).toBeNull();
      expect(p.direction).toBe("hold");
    });

    it("hedef yok/geçersizse de pct null döner (sahte çubuk çizilmez)", () => {
      expect(weightProgress({ "2026-09-15": 80 }, null)!.pct).toBeNull();
      expect(weightProgress({ "2026-09-15": 80 }, 0)!.pct).toBeNull();
      expect(weightProgress({ "2026-09-15": 80 }, Number.NaN)!.pct).toBeNull();
      expect(weightProgress({ "2026-09-15": 80 }, null)!.direction).toBe("hold");
    });
  });
});
