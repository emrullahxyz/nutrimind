import { describe, expect, it } from "vitest";
import {
  barcodeCapability,
  capabilityFamily,
  createBarcodeDiagLog,
  formatBarcodeDiagLine,
  setBarcodeCapability,
} from "./barcodeDiag";
import type { BarcodeCapability, BarcodeDiagSummary } from "./barcodeDiag";

describe("createBarcodeDiagLog", () => {
  it("halka tampon: en eski kayıt düşer, sınır aşılmaz", () => {
    const log = createBarcodeDiagLog(3);
    for (let i = 1; i <= 5; i++) log.record("detect", `frame-${i}`);
    expect(log.entries()).toHaveLength(3);
    expect(log.entries().map((e) => e.detail)).toEqual(["frame-3", "frame-4", "frame-5"]);
  });

  it("ISO damga ekler", () => {
    const log = createBarcodeDiagLog();
    log.record("hit", "8690637025010");
    expect(log.entries()[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("entries() kopya döner (dışarıdan mutasyon kaydı bozmaz)", () => {
    const log = createBarcodeDiagLog();
    log.record("detect", "x");
    log.entries().push({ at: "", kind: "detect", detail: "mutasyon" });
    expect(log.entries()).toHaveLength(1);
  });

  it("deneme ve okuma sayaçlarını ayrı ayrı tutar", () => {
    const log = createBarcodeDiagLog();
    log.record("detect", "frame");
    log.record("detect", "frame");
    log.record("hit", "8690637025010");
    log.record("lookup", "not-found:8690637025010");
    expect(log.counts()).toEqual({ attempts: 2, hits: 1 });
  });

  it("clear() tamponu VE sayaçları sıfırlar", () => {
    const log = createBarcodeDiagLog();
    log.record("detect", "frame");
    log.record("hit", "8690637025010");
    log.clear();
    expect(log.entries()).toEqual([]);
    expect(log.counts()).toEqual({ attempts: 0, hits: 0 });
  });
});

describe("capabilityFamily", () => {
  const cap = (partial: Partial<BarcodeCapability>): BarcodeCapability => ({
    native: false,
    fallback: null,
    loaded: false,
    ...partial,
  });

  it("yerli dedektör varsa 'native' — indirme hiç denenmez", () => {
    expect(capabilityFamily(cap({ native: true, fallback: "zxing-wasm@3" }))).toBe("native");
  });

  it("yedeğin yüklenip yüklenmediğini ayırt eder", () => {
    expect(capabilityFamily(cap({ fallback: "zxing-wasm@3" }))).toBe("zxing-wasm@3(idle)");
    expect(capabilityFamily(cap({ fallback: "zxing-wasm@3", loaded: true }))).toBe(
      "zxing-wasm@3(loaded)",
    );
  });

  it("yedeğin pakette olmadığı derlemede 'none'", () => {
    expect(capabilityFamily(cap({}))).toBe("none");
  });
});

describe("setBarcodeCapability / barcodeCapability", () => {
  it("kısmi güncelleme yapar ve KOPYA döner (dışarıdan değiştirilemez)", () => {
    setBarcodeCapability({ native: false, fallback: "zxing-wasm@3", loaded: true });
    const snap = barcodeCapability();
    expect(snap).toEqual({ native: false, fallback: "zxing-wasm@3", loaded: true });
    snap.native = true;
    expect(barcodeCapability().native).toBe(false);
  });
});

describe("formatBarcodeDiagLine", () => {
  const summary = (partial: Partial<BarcodeDiagSummary>): BarcodeDiagSummary => ({
    family: "none",
    attempts: 0,
    hits: 0,
    last: null,
    ...partial,
  });

  it("tek satırda aile + sayaçlar + son olay", () => {
    expect(
      formatBarcodeDiagLine(
        summary({ family: "native", attempts: 12, hits: 3, last: "lookup:not-found:8690637025010" }),
      ),
    ).toBe("family=native attempts=12 hits=3 last=lookup:not-found:8690637025010");
  });

  it("hiç olay yoksa 'last=n/a' der (sessizce boş bırakmaz)", () => {
    expect(formatBarcodeDiagLine(summary({}))).toBe("family=none attempts=0 hits=0 last=n/a");
  });

  it("ASCII kalır — rapora Türkçe karakter sızmaz", () => {
    const line = formatBarcodeDiagLine(summary({ family: "zxing-wasm@3(idle)" }));
    expect(line).toMatch(/^[\x20-\x7e]+$/);
  });
});
