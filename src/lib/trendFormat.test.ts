import { describe, expect, it } from "vitest";
import { formatHitRatePct, formatTargetHitRate } from "./trendFormat";
import { RANGE_OPTIONS, formatRangeLabel } from "../components/RangePicker";

describe("trendFormat & RangePicker helpers", () => {
  describe("formatHitRatePct & formatTargetHitRate", () => {
    it("returns '—' when ratedDays is 0", () => {
      expect(formatHitRatePct(0, 0)).toBe("—");
      expect(formatHitRatePct(5, 0)).toBe("—");
      expect(formatHitRatePct(0, -1)).toBe("—");
      expect(formatTargetHitRate({ onTargetDays: 0, ratedDays: 0 })).toBe("—");
    });

    it("calculates rounded percentage when ratedDays > 0", () => {
      expect(formatHitRatePct(3, 4)).toBe("%75");
      expect(formatHitRatePct(1, 3)).toBe("%33");
      expect(formatHitRatePct(2, 3)).toBe("%67");
      expect(formatHitRatePct(7, 7)).toBe("%100");
      expect(formatTargetHitRate({ onTargetDays: 5, ratedDays: 10 })).toBe("%50");
    });
  });

  describe("formatRangeLabel & RANGE_OPTIONS", () => {
    it("contains expected range options", () => {
      expect(RANGE_OPTIONS).toHaveLength(4);
      expect(RANGE_OPTIONS.map((r) => r.value)).toEqual([7, 30, 90, "all"]);
    });

    it("formats labels correctly", () => {
      expect(formatRangeLabel(7)).toBe("7 gün");
      expect(formatRangeLabel(30)).toBe("30 gün");
      expect(formatRangeLabel(90)).toBe("90 gün");
      expect(formatRangeLabel("all")).toBe("Tümü");
    });
  });
});
