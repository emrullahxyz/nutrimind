import { describe, expect, it } from "vitest";
import { buildDiagnosticsReport, DIAGNOSTICS_MARKER } from "./deviceReport";
import type { DiagnosticsInput } from "./deviceReport";
import { summarizeLongTasks } from "./perfProbe";
import { barcodeDiag, setBarcodeCapability } from "./barcodeDiag";

const base: DiagnosticsInput = {
  version: "0.30.5",
  locale: "tr",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
  facts: {
    width: 430,
    height: 932,
    dpr: 3,
    screenWidth: 430,
    screenHeight: 932,
    visualHeight: 932,
    standalone: true,
    emulate: null,
  },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
  deviceClass: { size: "430x932", insetTop: 59, family: "iPhone 14 Pro Max / 15 Plus class" },
  camera: [],
  longTasks: { count: 2, totalMs: 320, maxMs: 210 },
  online: true,
};

describe("buildDiagnosticsReport", () => {
  it("işaretçiyle başlar (form ikinci kez eklemesin diye)", () => {
    expect(buildDiagnosticsReport(base).startsWith(DIAGNOSTICS_MARKER)).toBe(true);
  });

  it("standalone + inset + model sınıfını tek bakışta verir", () => {
    const text = buildDiagnosticsReport(base);
    expect(text).toContain("standalone");
    expect(text).toContain("top=59 right=0 bottom=34 left=0");
    expect(text).toContain("430x932 top=59");
    expect(text).toContain("iPhone 14 Pro Max");
  });

  it("KİŞİSEL VERİ koymaz — yalnızca teknik alanlar", () => {
    const text = buildDiagnosticsReport(base);
    const labels = text.split("\n").map((l) => l.trim().split(" ")[0]);
    expect(labels).toContain("app");
    expect(labels).toContain("insets");
    expect(text).not.toMatch(/@/); // e-posta adresi yok
  });

  it("kamera kaydı yoksa bunu açıkça söyler", () => {
    expect(buildDiagnosticsReport(base)).toContain("no attempts recorded");
  });

  it("kamera kayıtlarını en yeni önce yazar", () => {
    const text = buildDiagnosticsReport({
      ...base,
      camera: [
        { at: "", facing: "environment", attempt: 1, requested: "facingMode.ideal=environment", result: "retry", got: "id=? facing=user 1280x720", devices: "none" },
        { at: "", facing: "environment", attempt: 2, requested: "deviceId=ios-back", result: "ok", got: "id=ios-back facing=environment 2560x1440", devices: "none" },
      ],
    });
    const lines = text.split("\n").filter((l) => l.includes("attempt="));
    expect(lines[0]).toContain("attempt=2");
    expect(lines[1]).toContain("attempt=1");
  });

  it("desteklenmeyen perf sayacını 'n/a' der (sessizce 0 yazmaz)", () => {
    expect(buildDiagnosticsReport({ ...base, longTasks: null })).toContain("n/a (unsupported)");
  });

  it("tarayıcı modunda 'browser' yazar, taklit varsa modu da ekler", () => {
    const browser = buildDiagnosticsReport({
      ...base,
      facts: { ...base.facts, standalone: false, emulate: null },
    });
    expect(browser).toContain("browser");
    const emulated = buildDiagnosticsReport({
      ...base,
      facts: { ...base.facts, standalone: false, emulate: "island" },
    });
    expect(emulated).toContain("emulated=island");
  });

  it("çevrimdışı durumu bildirir", () => {
    expect(buildDiagnosticsReport({ ...base, online: false })).toContain("no");
  });

  // --- Barkod satırı (v0.30.8) ---
  // "Barkod tarayıcı çalışmıyor" geri bildirimi bu satır olmadan tahminle
  // kovalanyordu: cihazda yerli dedektör var mı, kaç kare denendi, kaç okuma
  // oldu? Hepsi tek satırda.

  it("barkod yeteneğini ve sayaçları tek satırda bildirir", () => {
    setBarcodeCapability({ native: false, fallback: "zxing-wasm@3", loaded: true });
    barcodeDiag.clear();
    barcodeDiag.record("detect", "frame");
    barcodeDiag.record("hit", "8690637025010");
    barcodeDiag.record("lookup", "not-found:8690637025010");
    const text = buildDiagnosticsReport(base);
    expect(text).toContain("barcode");
    expect(text).toContain(
      "family=zxing-wasm@3(loaded) attempts=1 hits=1 last=lookup:not-found:8690637025010",
    );
    barcodeDiag.clear();
    setBarcodeCapability({ native: false, fallback: null, loaded: false });
  });

  it("barkod satırı da kişisel veri içermez ve ASCII kalır", () => {
    const line = buildDiagnosticsReport(base)
      .split("\n")
      .find((l) => l.trim().startsWith("barcode"));
    expect(line).toBeDefined();
    expect(line).toMatch(/^[\x20-\x7e]+$/);
    expect(line).not.toMatch(/@/);
  });
});

describe("summarizeLongTasks", () => {
  it("sayı/toplam/en büyük değeri verir", () => {
    expect(summarizeLongTasks([120, 60, 80])).toEqual({ count: 3, totalMs: 260, maxMs: 120 });
  });

  it("boş listede sıfırlar", () => {
    expect(summarizeLongTasks([])).toEqual({ count: 0, totalMs: 0, maxMs: 0 });
  });

  it("ms değerlerini yuvarlar (rapor okunur kalsın)", () => {
    expect(summarizeLongTasks([50.4, 50.4]).totalMs).toBe(101);
  });
});
