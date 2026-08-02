import { describe, expect, it } from "vitest";
import { easeOutCubic, easeShowcase, progressAt, valueAtElapsed, prefersReducedMotion } from "./animation";

describe("easeOutCubic", () => {
  it("sınır değerleri: 0 → 0, 1 → 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("monotonik artar", () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("yarı yolda 0.5'ten büyük (ease-out hızlı başlar)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("easeShowcase", () => {
  it("sınır değerleri: 0 → 0, 1 → 1", () => {
    expect(easeShowcase(0)).toBe(0);
    expect(easeShowcase(1)).toBeCloseTo(1, 8);
  });
  it("t=0.25'te ~0.7 (WeekBars eğrisi kilidi)", () => {
    expect(easeShowcase(0.25)).toBeCloseTo(0.7, 5);
  });
  it("monotonik artar", () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const v = easeShowcase(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-10);
      prev = v;
    }
  });
});

describe("progressAt", () => {
  it("0'dan küçük elapsed → 0", () => expect(progressAt(-100, 1000)).toBe(0));
  it("elapsed = duration → 1", () => expect(progressAt(1000, 1000)).toBe(1));
  it("elapsed > duration → 1 (clamp)", () => expect(progressAt(2000, 1000)).toBe(1));
  it("duration <= 0 → 1", () => expect(progressAt(0, 0)).toBe(1));
});

describe("valueAtElapsed", () => {
  it("elapsed=0 → from", () => {
    expect(valueAtElapsed({ from: 100, to: 200, elapsedMs: 0, durationMs: 750 })).toBe(100);
  });
  it("elapsed >= duration → tam olarak to", () => {
    expect(valueAtElapsed({ from: 0, to: 1500, elapsedMs: 750, durationMs: 750 })).toBe(1500);
    expect(valueAtElapsed({ from: 0, to: 1500, elapsedMs: 9999, durationMs: 750 })).toBe(1500);
  });
  it("durationMs=0 → anında to", () => {
    expect(valueAtElapsed({ from: 0, to: 500, elapsedMs: 0, durationMs: 0 })).toBe(500);
  });
  it("aşağı sayma çalışır (from > to)", () => {
    const v = valueAtElapsed({ from: 200, to: 50, elapsedMs: 375, durationMs: 750 });
    expect(v).toBeGreaterThanOrEqual(50);
    expect(v).toBeLessThanOrEqual(200);
  });
  it("round: floor asla to'yu aşmaz", () => {
    for (let e = 0; e <= 750; e += 10) {
      const v = valueAtElapsed({ from: 0, to: 100, elapsedMs: e, durationMs: 750, round: "floor" });
      expect(v).toBeLessThanOrEqual(100);
    }
  });
  it("round: none ondalık döndürür", () => {
    const v = valueAtElapsed({ from: 0, to: 100, elapsedMs: 375, durationMs: 750, round: "none" });
    expect(v % 1).not.toBe(0);
  });
});

describe("prefersReducedMotion", () => {
  it("node ortamında false döner, throw etmez", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
