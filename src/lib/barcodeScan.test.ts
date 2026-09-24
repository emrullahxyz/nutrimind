import { describe, expect, it, vi } from "vitest";
import {
  REPEAT_SUPPRESS_MS,
  scanFrameSize,
  scanOnce,
  shouldAcceptDetection,
} from "./barcodeScan";
import type { LastDetection } from "./barcodeScan";

/** Sırayla verilen sonuçları döndüren sahte dedektör (yerli API'nin şekli). */
function fakeDetector(results: (string | null | Error)[]) {
  let call = 0;
  return {
    detect: vi.fn(async () => {
      const next = results[Math.min(call, results.length - 1)];
      call += 1;
      if (next instanceof Error) throw next;
      if (next === null) return [];
      return [{ rawValue: next, format: "ean_13" }];
    }),
  };
}

describe("shouldAcceptDetection", () => {
  it("ilk okuma her zaman geçer", () => {
    expect(shouldAcceptDetection(null, "8690637025010", 1000)).toBe(true);
  });

  it("FARKLI kod anında geçer — 'tarayıcı öldü' sınıfı bu yüzden kapanır", () => {
    const last: LastDetection = { code: "8690637025010", at: 1000 };
    expect(shouldAcceptDetection(last, "5900531004544", 1001)).toBe(true);
  });

  it("aynı kod pencere içinde yutulur", () => {
    const last: LastDetection = { code: "8690637025010", at: 1000 };
    expect(shouldAcceptDetection(last, "8690637025010", 1000)).toBe(false);
    expect(shouldAcceptDetection(last, "8690637025010", 1000 + REPEAT_SUPPRESS_MS - 1)).toBe(false);
  });

  it("pencere dolunca aynı kod yine geçer (kullanıcı gerçekten tekrar tarayabilir)", () => {
    const last: LastDetection = { code: "8690637025010", at: 1000 };
    expect(shouldAcceptDetection(last, "8690637025010", 1000 + REPEAT_SUPPRESS_MS)).toBe(true);
  });
});

describe("scanFrameSize", () => {
  it("uzun kenarı max'a indirir, oranı korur", () => {
    expect(scanFrameSize(2560, 1440, 960)).toEqual({ width: 960, height: 540 });
    expect(scanFrameSize(1440, 2560, 960)).toEqual({ width: 540, height: 960 });
  });

  it("küçük kareyi BÜYÜTMEZ", () => {
    expect(scanFrameSize(640, 480, 960)).toEqual({ width: 640, height: 480 });
  });

  it("geçersiz ölçüde sıfır döner (çizim yapılmaz)", () => {
    expect(scanFrameSize(0, 480, 960)).toEqual({ width: 0, height: 0 });
    expect(scanFrameSize(Number.NaN, 480, 960)).toEqual({ width: 0, height: 0 });
  });
});

describe("scanOnce", () => {
  it("okumayı iletir, teşhis kancalarını çalıştırır", async () => {
    const detector = fakeDetector(["8690637025010"]);
    const onDetected = vi.fn();
    const onAttempt = vi.fn();
    const onHit = vi.fn();
    const result = await scanOnce({
      detector,
      source: {} as unknown as CanvasImageSource,
      last: null,
      now: 1000,
      onAttempt,
      onHit,
      onDetected,
    });
    expect(result).toEqual({ last: { code: "8690637025010", at: 1000 }, delivered: true, suppressed: false });
    expect(onDetected).toHaveBeenCalledWith("8690637025010");
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onHit).toHaveBeenCalledWith("8690637025010");
  });

  it("AYNI kodu arka arkaya ikinci kez iletmez (OFF kotası korunur)", async () => {
    const detector = fakeDetector(["8690637025010"]);
    const onDetected = vi.fn();
    const first = await scanOnce({
      detector,
      source: {} as unknown as CanvasImageSource,
      last: null,
      now: 1000,
      onDetected,
    });
    const second = await scanOnce({
      detector,
      source: {} as unknown as CanvasImageSource,
      last: first.last,
      now: 1200,
      onDetected,
    });
    expect(second.delivered).toBe(false);
    expect(second.suppressed).toBe(true);
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it("FARKLI kodu hemen iletir — ilk okuma başarısız olduysa tarayıcı ölmez", async () => {
    const detector = fakeDetector(["8690637025010", "5900531004544"]);
    const onDetected = vi.fn();
    const source = {} as unknown as CanvasImageSource;
    const first = await scanOnce({ detector, source, last: null, now: 1000, onDetected });
    const second = await scanOnce({ detector, source, last: first.last, now: 1200, onDetected });
    expect(second.delivered).toBe(true);
    expect(second.last).toEqual({ code: "5900531004544", at: 1200 });
    expect(onDetected).toHaveBeenCalledTimes(2);
  });

  it("boş sonuç iletmez", async () => {
    const onDetected = vi.fn();
    const result = await scanOnce({
      detector: fakeDetector([null]),
      source: {} as unknown as CanvasImageSource,
      last: null,
      now: 1000,
      onDetected,
    });
    expect(result.delivered).toBe(false);
    expect(onDetected).not.toHaveBeenCalled();
  });

  it("dedektör hatasını YUTAR (tek kare çözülemedi diye akış durmaz)", async () => {
    const onDetected = vi.fn();
    const result = await scanOnce({
      detector: fakeDetector([new Error("decode failed")]),
      source: {} as unknown as CanvasImageSource,
      last: null,
      now: 1000,
      onDetected,
    });
    expect(result).toEqual({ last: null, delivered: false, suppressed: false });
    expect(onDetected).not.toHaveBeenCalled();
  });

  it("boşluklu ham değeri kırpar, yalnızca boşluksa yok sayar", async () => {
    const onDetected = vi.fn();
    await scanOnce({
      detector: fakeDetector(["  8690637025010  "]),
      source: {} as unknown as CanvasImageSource,
      last: null,
      now: 1000,
      onDetected,
    });
    expect(onDetected).toHaveBeenCalledWith("8690637025010");

    const onDetected2 = vi.fn();
    const result = await scanOnce({
      detector: fakeDetector(["   "]),
      source: {} as unknown as CanvasImageSource,
      last: null,
      now: 1000,
      onDetected: onDetected2,
    });
    expect(result.delivered).toBe(false);
    expect(onDetected2).not.toHaveBeenCalled();
  });

  it("hata sonrası aynı kare yeniden denenebilir (bastırma kirlenmez)", async () => {
    const detector = fakeDetector([new Error("boom"), "8690637025010"]);
    const onDetected = vi.fn();
    const source = {} as unknown as CanvasImageSource;
    const failed = await scanOnce({ detector, source, last: null, now: 1000, onDetected });
    const retried = await scanOnce({ detector, source, last: failed.last, now: 1400, onDetected });
    expect(retried.delivered).toBe(true);
  });
});
