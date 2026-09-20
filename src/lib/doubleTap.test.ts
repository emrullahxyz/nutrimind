import { describe, expect, it } from "vitest";
import { createDoubleTapGate } from "./doubleTap";

// Kamerada ön/arka geçişi çift dokunuşla yapılıyor. Yanlış sayılan bir jest
// kullanıcının fotoğrafını kamerayı değiştirerek harcardı; bu yüzden "çift
// sayılan" ve "sayılmayan" durumlar tek tek ölçülüyor.

const gate = () => createDoubleTapGate({ maxGapMs: 320, maxHoldMs: 300, maxMovePx: 14 });

describe("createDoubleTapGate", () => {
  it("aynı yüzeye hızlı iki dokunuş çift sayılır", () => {
    const g = gate();
    g.down(100, 100, 0);
    expect(g.up(100, 100, 60)).toBe(false); // ilk dokunuş: beklemede
    g.down(102, 100, 120);
    expect(g.up(102, 100, 160)).toBe(true);
  });

  it("aradaki süre eşiği aşarsa çift sayılmaz", () => {
    const g = gate();
    g.down(100, 100, 0);
    g.up(100, 100, 50);
    g.down(100, 100, 900);
    expect(g.up(100, 100, 950)).toBe(false);
  });

  it("basılı tutma dokunuş DEĞİL (uzun basma menüsüyle karışmasın)", () => {
    const g = gate();
    g.down(100, 100, 0);
    expect(g.up(100, 100, 500)).toBe(false); // 500ms > maxHoldMs → sayılmadı
    g.down(100, 100, 520);
    expect(g.up(100, 100, 560)).toBe(false); // hâlâ ilk dokunuş
  });

  it("sürükleyerek kaldırmak dokunuş DEĞİL", () => {
    const g = gate();
    g.down(100, 100, 0);
    expect(g.up(160, 100, 60)).toBe(false);
    g.down(160, 100, 80);
    expect(g.up(160, 100, 120)).toBe(false);
  });

  it("çok uzağa ikinci dokunuş (ör. deklanşör) çift sayılmaz", () => {
    const g = gate();
    g.down(50, 400, 0);
    g.up(50, 400, 40);
    g.down(200, 700, 90);
    expect(g.up(200, 700, 130)).toBe(false);
  });

  it("farklı yüzeye gelen dokunuşlar eşleşmez", () => {
    const g = gate();
    g.down(100, 100, 0, "viewfinder");
    g.up(100, 100, 40, "viewfinder");
    g.down(100, 100, 60, "shutter");
    expect(g.up(100, 100, 90, "shutter")).toBe(false);
  });

  it("üç hızlı dokunuş: yalnızca ikincisi çifti tamamlar", () => {
    const g = gate();
    g.down(10, 10, 0);
    const first = g.up(10, 10, 30);
    g.down(10, 10, 60);
    const second = g.up(10, 10, 90);
    g.down(10, 10, 120);
    const third = g.up(10, 10, 150);
    expect([first, second, third]).toEqual([false, true, false]);
  });

  it("cancel bekleyen dokunuşu temizler", () => {
    const g = gate();
    g.down(10, 10, 0);
    g.up(10, 10, 30);
    g.cancel();
    g.down(10, 10, 60);
    expect(g.up(10, 10, 90)).toBe(false);
  });

  it("aşağı olmadan yukarı gelirse sessizce yok sayar (pointercancel ardından)", () => {
    const g = gate();
    expect(g.up(10, 10, 30)).toBe(false);
  });
});
