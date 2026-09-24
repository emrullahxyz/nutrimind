// ============================================================================
// Barkod yetenek modeli — BAŞARILI yollar.
//
// Buradaki en önemli iki iddia:
//   1. Yerli `BarcodeDetector` varken wasm yedeği HİÇ indirilmez (Android'de
//      kazanç sıfır, maliyet 1 MB olurdu).
//   2. Yedek yüklendiğinde `.wasm` CDN'den DEĞİL kendi origin'imizden gelir
//      (varsayılan jsDelivr yolu bilerek ezilir).
// ============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { barcodeDiag, barcodeCapability } from "./barcodeDiag";
import {
  barcodeSupportSync,
  loadBarcodeDetector,
  nativeDetector,
  resetBarcodeLoader,
} from "./barcode";

const h = vi.hoisted(() => ({
  prepare: vi.fn(async (_options?: unknown) => ({}) as unknown),
  detect: vi.fn(async () => [] as { rawValue?: string }[]),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  BarcodeDetector: class {
    detect = h.detect;
  },
  ZXING_WASM_VERSION: "3.1.3",
  prepareZXingModule: h.prepare,
}));

beforeEach(() => {
  resetBarcodeLoader();
  barcodeDiag.clear();
  h.prepare.mockClear();
  h.detect.mockClear();
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("yerli yol (Android/Chrome)", () => {
  it("yerli dedektör yoksa senkron cevap 'unknown' — indirme denenmeden", () => {
    expect(nativeDetector()).toBeNull();
    expect(barcodeSupportSync()).toBe("unknown");
  });

  it("yerli varsa onu döner ve yedeği HİÇ indirmez", async () => {
    class NativeDetector {
      static async getSupportedFormats() {
        return ["ean_13"];
      }
      async detect() {
        return [];
      }
    }
    vi.stubGlobal("BarcodeDetector", NativeDetector);

    expect(barcodeSupportSync()).toBe("native");
    const ctor = await loadBarcodeDetector();
    expect(ctor).toBe(NativeDetector);
    // Yedek paketi yüklenmedi: prepareZXingModule hiç çağrılmadı.
    expect(h.prepare).not.toHaveBeenCalled();
    expect(barcodeCapability().fallback).toBeNull();
    expect(barcodeDiag.entries()).toEqual([]);
  });
});

describe("yedek yol (iOS Safari)", () => {
  it("yerli yoksa wasm ponyfill'ini yükler ve döner", async () => {
    const ctor = await loadBarcodeDetector();
    expect(ctor).not.toBeNull();
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(barcodeCapability()).toEqual({ native: false, fallback: "zxing-wasm@3.1.3", loaded: true });
    expect(barcodeDiag.entries().some((e) => e.detail.includes("fallback-ready"))).toBe(true);
  });

  it("wasm'ı KENDİ origin'imizden ister — CDN'e hiç dokunmaz", async () => {
    await loadBarcodeDetector();
    const options = h.prepare.mock.calls[0][0] as unknown as {
      overrides: { locateFile: (path: string, prefix: string) => string };
      fireImmediately: boolean;
    };
    expect(options.fireImmediately).toBe(true);
    const located = options.overrides.locateFile("zxing_reader.wasm", "/assets/");
    expect(located).toBe(zxingReaderWasmUrl);
    expect(located).not.toMatch(/jsdelivr|unpkg|cdn/i);
    // .wasm DIŞI dosyalar paketin kendi yolundan gelmeye devam eder.
    expect(options.overrides.locateFile("core.js", "/pkg/")).toBe("/pkg/core.js");
  });

  it("sonuç önbelleğe alınır — her taramada yeniden indirilmez", async () => {
    const first = await loadBarcodeDetector();
    const second = await loadBarcodeDetector();
    expect(first).toBe(second);
    expect(h.prepare).toHaveBeenCalledTimes(1);
  });
});
