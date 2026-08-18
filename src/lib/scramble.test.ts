import { describe, it, expect } from "vitest";
import { scrambleProgress } from "./scramble";

describe("scrambleProgress", () => {
  it("returns full text when progress is 1", () => {
    expect(scrambleProgress("Analiz ediliyor…", 1)).toBe("Analiz ediliyor…");
  });

  it("keeps spaces intact even during scramble", () => {
    const res = scrambleProgress("A B C", 0);
    expect(res[1]).toBe(" ");
    expect(res[3]).toBe(" ");
  });

  it("reveals characters progressively", () => {
    // 50% ilerleme ile ilk yarısı çözülmüş olmalı
    const res = scrambleProgress("ABCDEF", 0.5, () => 0);
    expect(res.startsWith("ABC")).toBe(true);
  });
});
