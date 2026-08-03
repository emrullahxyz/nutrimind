import { describe, expect, it } from "vitest";
import {
  EMPTY_WEIGHT,
  buildWeightSeries,
  latestEntryBefore,
  parseWeightConfig,
  weightDelta,
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
});
