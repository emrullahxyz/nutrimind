import { describe, expect, it } from "vitest";
import {
  PANEL_MAX_WIDTH,
  PANEL_MIN_BODY,
  VIEWPORT_PAD,
  placeAnchoredPanel,
} from "./anchor";
import type { AnchorRect } from "./anchor";

function rect(over: Partial<AnchorRect> = {}): AnchorRect {
  const base = { top: 100, bottom: 160, left: 20, right: 340, width: 320, height: 60 };
  return { ...base, ...over };
}

const viewport = { width: 400, height: 800 };

describe("placeAnchoredPanel", () => {
  it("yer varsa satırın ALTINA açar ve satırın soluna hizalanır", () => {
    const p = placeAnchoredPanel(rect(), viewport, 200, 60);
    expect(p.side).toBe("below");
    expect(p.top).toBe(160 + 10);
    expect(p.left).toBe(20);
    expect(p.width).toBe(PANEL_MAX_WIDTH);
  });

  it("altında yer yoksa ÜSTÜNE açar (taşmaz)", () => {
    const p = placeAnchoredPanel(rect({ top: 720, bottom: 780 }), viewport, 200, 200);
    expect(p.side).toBe("above");
    expect(p.top).toBe(720 - 10 - 200);
    expect(p.top + 200).toBeLessThanOrEqual(720);
  });

  it("giriş animasyonunun kaynağı basış noktasının panele izdüşümüdür", () => {
    const below = placeAnchoredPanel(rect(), viewport, 200, 120);
    expect(below.originX).toBe(100); // 120 - left(20)
    expect(below.originY).toBe(0);

    const above = placeAnchoredPanel(rect({ top: 720, bottom: 780 }), viewport, 200, 200);
    expect(above.originY).toBe(200); // panelin alt kenarından büyür
  });

  it("kaynak noktası panelin içinde kalır (kenardan fışkırmaz)", () => {
    const p = placeAnchoredPanel(rect(), viewport, 200, -500);
    expect(p.originX).toBeGreaterThanOrEqual(18);
    const q = placeAnchoredPanel(rect(), viewport, 200, 5000);
    expect(q.originX).toBeLessThanOrEqual(q.width - 18);
  });

  it("dar ekranda genişlik görünüm alanının dışına çıkmaz", () => {
    const p = placeAnchoredPanel(rect({ left: 0, width: 380 }), { width: 240, height: 800 }, 200, 100);
    expect(p.width).toBeLessThanOrEqual(240 - VIEWPORT_PAD * 2);
    expect(p.left + p.width).toBeLessThanOrEqual(240 - VIEWPORT_PAD);
  });

  it("yatay hiza ekran kenarından taşmaz", () => {
    const right = placeAnchoredPanel(rect({ left: 390 }), viewport, 200, 390);
    expect(right.left + right.width).toBeLessThanOrEqual(viewport.width - VIEWPORT_PAD);
    const left = placeAnchoredPanel(rect({ left: -50 }), viewport, 200, 0);
    expect(left.left).toBeGreaterThanOrEqual(VIEWPORT_PAD);
  });

  it("sığmayan içerik panelin İÇİNDE kaydırılır: gövde yüksekliği sınırlanır", () => {
    const p = placeAnchoredPanel(rect({ top: 300, bottom: 360 }), viewport, 900, 200);
    expect(p.maxHeight).toBeLessThan(viewport.height - 360);
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
  });

  it("görünüm alanı PANEL_MIN_BODY'den kısa ise kazanabilecek olan (ekran) kazanır, taşma olmaz", () => {
    const p = placeAnchoredPanel(rect({ top: 0, bottom: 130, height: 130 }), { width: 400, height: 140 }, 200, 100);
    // 140 − 2×10 = 120 < PANEL_MIN_BODY (132): burada "en az okunabilir gövde"
    // fiziksel olarak mümkün değil — panel ekrandan taşmak yerine 120 px alır.
    expect(p.maxHeight).toBe(140 - VIEWPORT_PAD * 2);
    expect(p.maxHeight).toBeLessThan(PANEL_MIN_BODY);
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(140 - VIEWPORT_PAD);
  });

  it("PANEL_MIN_BODY'ye yer olduğunda taban gövde korunur (satır ekranın tepesinde bile)", () => {
    const p = placeAnchoredPanel(rect({ top: 0, bottom: 130, height: 130 }), { width: 400, height: 200 }, 200, 100);
    expect(p.maxHeight).toBe(PANEL_MIN_BODY);
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(200 - VIEWPORT_PAD);
  });

  it("çok dar WebView'da (genişlik < 2×VIEWPORT_PAD) panel yine de kenardan taşmaz", () => {
    const p = placeAnchoredPanel(rect({ left: 0 }), { width: 18, height: 400 }, 200, 9);
    expect(p.left).toBe(0);
    expect(p.left + p.width).toBeLessThanOrEqual(18);
  });

  it("satır ekranın altına taşmışsa (kısmen görünen son satır) panel yine içeride kalır", () => {
    const p = placeAnchoredPanel(rect({ top: 846, bottom: 900 }), { width: 507, height: 756 }, 337, 80);
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(p.top + 337).toBeLessThanOrEqual(756 - VIEWPORT_PAD);
  });

  it("satır ekranın üstüne taşmışsa panel içeride kalır", () => {
    const p = placeAnchoredPanel(rect({ top: -60, bottom: 20 }), { width: 507, height: 756 }, 337, 80);
    expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
    expect(p.top + Math.min(337, p.maxHeight)).toBeLessThanOrEqual(756 - VIEWPORT_PAD);
  });

  it("yerleşim her zaman görünüm alanının içindedir (üst sınır)", () => {
    for (const bottom of [0, 100, 400, 700, 756, 900]) {
      const p = placeAnchoredPanel(rect({ top: bottom - 60, bottom }), { width: 507, height: 756 }, 337, 60);
      expect(p.top).toBeGreaterThanOrEqual(VIEWPORT_PAD);
      expect(p.top + Math.min(337, p.maxHeight)).toBeLessThanOrEqual(756 - VIEWPORT_PAD);
    }
  });

  it("henüz ölçülmemişken (height 0) alt/üst kararı tahminle verilir", () => {
    expect(placeAnchoredPanel(rect(), viewport, 0, 100).side).toBe("below");
    expect(placeAnchoredPanel(rect({ top: 700, bottom: 790 }), viewport, 0, 100).side).toBe("above");
  });
});
