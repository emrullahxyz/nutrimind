import { describe, expect, it } from "vitest";
import { ringState, ringGradient } from "./ring";

describe("ringState", () => {
  it("hedef yokken (target=0) headline consumed'u g\u00f6sterir, 'kald\u0131' i\u00e7ermez", () => {
    const s = ringState(1500, 0);
    expect(s.hasTarget).toBe(false);
    expect(s.pct).toBe(0);
    expect(s.headline).toBe("1.500");
    expect(s.caption).not.toContain("kald\u0131");
    expect(s.remainingText).not.toContain("kald\u0131");
    expect(s.a11yLabel).toContain("Hedef belirlenmemi\u015f");
  });

  it("hedefin alt\u0131nda: do\u011fru kalan de\u011fer ve tr-TR format\u0131", () => {
    const s = ringState(1770, 3000);
    expect(s.isOver).toBe(false);
    expect(s.isMet).toBe(false);
    expect(s.headline).toBe("1.230");
    expect(s.caption).toBe("kcal kald\u0131");
    expect(s.remainingText).toBe("1.230 kcal kald\u0131");
    expect(s.ratioText).toBe("1.770 / 3.000");
  });

  it("tam hedefteyken (epsilon i\u00e7inde): isMet", () => {
    const s = ringState(2000, 2000);
    expect(s.isMet).toBe(true);
    expect(s.isOver).toBe(false);
    expect(s.remainingText).toBe("Hedefe ula\u015f\u0131ld\u0131");
  });

  it("0.05 epsilon paritesi: consumed 2000.04 / target 2000 a\u015f\u0131lm\u0131\u015f say\u0131lmaz", () => {
    const s = ringState(2000.04, 2000);
    expect(s.isOver).toBe(false);
    expect(s.isMet).toBe(true);
  });

  it("a\u015f\u0131ld\u0131\u011f\u0131nda: isOver ve +N format\u0131", () => {
    const s = ringState(2250, 2000);
    expect(s.isOver).toBe(true);
    expect(s.headline).toBe("+250");
    expect(s.caption).toBe("kcal a\u015f\u0131ld\u0131");
    expect(s.pct).toBe(100);
  });

  it("pct 0-100 aras\u0131nda clamp edilir", () => {
    expect(ringState(5000, 2000).pct).toBe(100);
    expect(ringState(0, 2000).pct).toBe(0);
  });
});

describe("ringGradient", () => {
  it("pct=0'da sadece track", () => {
    const g = ringGradient(false, 0);
    expect(g).toContain("var(--ring-track) 0%");
    expect(g).not.toContain("var(--ring-bright)");
  });

  it("normal durumda gradient diki\u015fsiz: dolgu sonu ve track ba\u015f\u0131 ayn\u0131 y\u00fczde", () => {
    const g = ringGradient(false, 60);
    expect(g).toContain("var(--ring-bright) 60%");
    expect(g).toContain("var(--ring-track) 60%");
  });

  it("isOver durumunda over renkleri kullan\u0131l\u0131r", () => {
    const g = ringGradient(true, 100);
    expect(g).toContain("var(--ring-over)");
    expect(g).not.toContain("var(--ring-bright)");
  });
});
