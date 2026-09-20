import { describe, expect, it } from "vitest";
import {
  nextPull,
  PULL_MAX,
  PULL_THRESHOLD,
  shouldRefresh,
  startPull,
  TOP_EPSILON,
} from "./pullToRefresh";

// Bu katman `usePullToRefresh`ten ayrıldı çünkü asıl kazanç KARARIN test
// edilebilir olması: hangi dokunuşta non-passive `touchmove` bağlanacağı,
// ne zaman iptal edileceği ve mesafe eğrisi.

describe("startPull", () => {
  it("sayfa en üstteyken sayacı kurar", () => {
    expect(startPull(0, 100, false)).toEqual({ armed: true, startY: 100 });
  });

  it("sayfa kaydırılmışken kurmaz (normal kaydırmayı bozmamak için)", () => {
    expect(startPull(TOP_EPSILON + 1, 100, false)).toEqual({ armed: false, startY: null });
  });

  it("yenileme sürerken yeni jest başlatmaz", () => {
    expect(startPull(0, 100, true)).toEqual({ armed: false, startY: null });
  });

  it("üstteki küçük pay toleransı korunur (rAF gecikmesi)", () => {
    expect(startPull(TOP_EPSILON, 50, false).armed).toBe(true);
  });
});

describe("nextPull", () => {
  const base = { armed: true, startY: 100, scrollTop: 0 };

  it("eşik altındaki titreşimlerde jesti bozmaz, sadece beklemede kalır", () => {
    expect(nextPull({ ...base, currentY: 105 })).toEqual({
      armed: true,
      distance: 0,
      pulling: false,
      preventDefault: false,
    });
  });

  it("çekme başlayınca mesafe yarıya indirilir ve iptal edilir", () => {
    const out = nextPull({ ...base, currentY: 200 });
    expect(out.pulling).toBe(true);
    expect(out.distance).toBe(50);
    expect(out.preventDefault).toBe(true);
  });

  it("mesafe direnç tavanını aşmaz", () => {
    expect(nextPull({ ...base, currentY: 1000 }).distance).toBe(PULL_MAX);
  });

  it("parmak yukarı giderse jest iptal edilir", () => {
    expect(nextPull({ ...base, currentY: 90 }).armed).toBe(false);
  });

  it("sayfa kaydırıldıysa jest biter", () => {
    expect(nextPull({ ...base, scrollTop: 10, currentY: 200 }).armed).toBe(false);
  });

  it("sayaç yokken hiçbir şey yapmaz", () => {
    expect(nextPull({ armed: false, startY: null, scrollTop: 0, currentY: 200 })).toEqual({
      armed: false,
      distance: 0,
      pulling: false,
      preventDefault: false,
    });
  });
});

describe("shouldRefresh", () => {
  it("eşiği geçen mesafede yeniler", () => {
    expect(shouldRefresh(PULL_THRESHOLD)).toBe(true);
    expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false);
  });
});
