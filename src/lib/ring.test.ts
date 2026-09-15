import { describe, expect, it } from "vitest";
import { ringState, ringGradient } from "./ring";
import i18n from "../i18n/i18n";

/** `ring.ts` SAF: i18n'i tanımaz, çevrilebilir metni `{key, params}` olarak
 *  döner. Testler hem bu sözleşmeyi hem de anahtarların üç dilde çevrilebilir
 *  olduğunu doğrular (eskiden modülün içinde Türkçe metin gömülüydü). */
const t = i18n.t.bind(i18n);

describe("ringState", () => {
  it("hedef yokken (target=0) headline consumed'u gösterir, 'kaldı' demez", () => {
    const s = ringState(1500, 0);
    expect(s.hasTarget).toBe(false);
    expect(s.pct).toBe(0);
    expect(s.headline).toBe("1.500");
    expect(s.caption.key).toBe("ring.captionNoTarget");
    expect(s.remaining.key).toBe("ring.remainingNoTarget");
    expect(t(s.remaining.key, s.remaining.params)).not.toContain("kaldı");
    expect(s.a11y.key).toBe("ring.a11yNoTarget");
  });

  it("hedefin altında: doğru kalan değer ve tr-TR formatı", () => {
    const s = ringState(1770, 3000);
    expect(s.isOver).toBe(false);
    expect(s.isMet).toBe(false);
    expect(s.headline).toBe("1.230");
    expect(s.caption.key).toBe("ring.captionLeft");
    expect(s.remaining.params).toEqual({ amount: "1.230" });
    expect(s.ratioText).toBe("1.770 / 3.000");
  });

  it("tam hedefteyken (epsilon içinde): isMet", () => {
    const s = ringState(2000, 2000);
    expect(s.isMet).toBe(true);
    expect(s.isOver).toBe(false);
    expect(s.remaining.key).toBe("ring.remainingMet");
  });

  it("0.05 epsilon paritesi: consumed 2000.04 / target 2000 aşılmış sayılmaz", () => {
    const s = ringState(2000.04, 2000);
    expect(s.isOver).toBe(false);
    expect(s.isMet).toBe(true);
  });

  it("aşıldığında: isOver ve +N formatı", () => {
    const s = ringState(2250, 2000);
    expect(s.isOver).toBe(true);
    expect(s.headline).toBe("+250");
    expect(s.caption.key).toBe("ring.captionOver");
    expect(s.remaining.params).toEqual({ amount: "250" });
    expect(s.pct).toBe(100);
  });

  it("pct 0-100 arasında clamp edilir", () => {
    expect(ringState(5000, 2000).pct).toBe(100);
    expect(ringState(0, 2000).pct).toBe(0);
  });

  it("metin anahtarları ÜÇ dilde de çevrilebilir (sabit Türkçe metin yok)", () => {
    const s = ringState(1770, 3000);
    const keys = [s.caption, s.remaining, { key: s.a11y.key, params: s.a11y.params }];
    for (const lang of ["en", "tr", "pl"]) {
      const tl = i18n.getFixedT(lang);
      for (const msg of keys) {
        const out = tl(msg.key, { ...msg.params, status: "X" });
        expect(out).not.toBe(msg.key); // anahtar çevrilmiş olmalı
        expect(out).not.toContain("{{"); // çevrilmemiş placeholder kalmamalı
      }
    }
  });
});

describe("ringGradient", () => {
  it("pct=0'da sadece track", () => {
    const g = ringGradient(false, 0);
    expect(g).toContain("var(--ring-track) 0%");
    expect(g).not.toContain("var(--ring-bright)");
  });

  it("normal durumda gradient dikişsiz: dolgu sonu ve track başı aynı yüzde", () => {
    const g = ringGradient(false, 60);
    expect(g).toContain("var(--ring-bright) 60%");
    expect(g).toContain("var(--ring-track) 60%");
  });

  it("isOver durumunda over renkleri kullanılır", () => {
    const g = ringGradient(true, 100);
    expect(g).toContain("var(--ring-over)");
    expect(g).not.toContain("var(--ring-bright)");
  });
});
