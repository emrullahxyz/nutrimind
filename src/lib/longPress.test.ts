import { describe, expect, it } from "vitest";
import {
  LONG_PRESS_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  exceededMoveTolerance,
  shouldIgnorePressTarget,
} from "./longPress";

describe("exceededMoveTolerance", () => {
  it("aynı noktada tolerans aşılmaz", () => {
    expect(exceededMoveTolerance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
  });

  it("tolerans kadar kayma (10 px) HÂLÂ basış sayılır", () => {
    expect(exceededMoveTolerance({ x: 0, y: 0 }, { x: LONG_PRESS_MOVE_TOLERANCE_PX, y: 0 })).toBe(
      false,
    );
  });

  it("dikey kaydırma niyeti (10 px'den fazla) basışı iptal eder", () => {
    expect(exceededMoveTolerance({ x: 0, y: 0 }, { x: 0, y: 40 })).toBe(true);
  });

  it("çapraz kaymada Öklid mesafe esas alınır", () => {
    // 8-8 çapraz → ~11.3 px, toleransın üstünde
    expect(exceededMoveTolerance({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(true);
    // 6-6 çapraz → ~8.5 px, toleransın altında
    expect(exceededMoveTolerance({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(false);
  });
});

describe("shouldIgnorePressTarget", () => {
  const fakeElement = (closestResult: unknown) =>
    ({ closest: () => closestResult }) as unknown as Element;

  it("buton/a/input gibi etkileşimli hedeflerde uzun basma kurulmaz", () => {
    expect(shouldIgnorePressTarget(fakeElement({ tagName: "BUTTON" }))).toBe(true);
  });

  it("etkileşimli ata yoksa basış normal kabul edilir", () => {
    expect(shouldIgnorePressTarget(fakeElement(null))).toBe(false);
  });

  it("null / closest'siz hedefte çöker değil, false döner", () => {
    expect(shouldIgnorePressTarget(null)).toBe(false);
    expect(shouldIgnorePressTarget({} as unknown as EventTarget)).toBe(false);
  });
});

describe("LONG_PRESS_MS", () => {
  it("mobil platformların hissiyle aynı büyüklükte (400-700 ms)", () => {
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(400);
    expect(LONG_PRESS_MS).toBeLessThanOrEqual(700);
  });
});
