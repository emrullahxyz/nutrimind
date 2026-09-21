import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_AI_TIMEOUT_MS, withDeadline } from "./aiDeadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("withDeadline", () => {
  it("süre dolunca sinyali aborte eder ve bunu 'timedOut' olarak bildirir", () => {
    vi.useFakeTimers();
    const d = withDeadline(undefined, 1000);

    expect(d.signal.aborted).toBe(false);
    vi.advanceTimersByTime(999);
    expect(d.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(d.signal.aborted).toBe(true);
    expect(d.timedOut()).toBe(true);
    d.release();
  });

  it("kullanıcı iptalinde de aborte eder ama timedOut false kalır (mesaj gösterilmez)", () => {
    const outer = new AbortController();
    const d = withDeadline(outer.signal, 10000);

    outer.abort();
    expect(d.signal.aborted).toBe(true);
    expect(d.timedOut()).toBe(false);
    d.release();
  });

  it("dış sinyal zaten aborte ise hemen aborte başlar", () => {
    const outer = new AbortController();
    outer.abort();
    const d = withDeadline(outer.signal, 10000);
    expect(d.signal.aborted).toBe(true);
    expect(d.timedOut()).toBe(false);
    d.release();
  });

  it("release zamanlayıcıyı temizler: sonradan gelen süre aşımı sinyali kirletmez", () => {
    vi.useFakeTimers();
    const d = withDeadline(undefined, 1000);
    d.release();

    vi.advanceTimersByTime(5000);
    expect(d.signal.aborted).toBe(false);
    expect(d.timedOut()).toBe(false);
  });

  it("dış sinyal dinleyicisi release ile sızdırılmaz", () => {
    const outer = new AbortController();
    const removeSpy = vi.spyOn(outer.signal, "removeEventListener");
    const d = withDeadline(outer.signal, 1000);
    d.release();
    expect(removeSpy).toHaveBeenCalled();
  });

  it("varsayılan sınır sunucu bütçesinin üstünde bir emniyet ağıdır", () => {
    // Sunucu toplam bütçesi 25 sn (server/ai.js AI_BUDGET_MS), nginx penceresi
    // 30 sn. İstemci bu ikisinin de üstünde olmalı ki sunucunun KENDİ dürüst
    // hatası kullanıcıya ulaşsın; istemci sınırı ilk olsaydı her olay
    // "zaman aşımı" gibi görünürdü.
    expect(CLIENT_AI_TIMEOUT_MS).toBeGreaterThan(30000);
  });
});
