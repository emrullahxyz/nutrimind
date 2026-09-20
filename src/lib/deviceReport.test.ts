import { describe, expect, it } from "vitest";
import { buildDiagnosticsReport, DIAGNOSTICS_MARKER } from "./deviceReport";
import type { DiagnosticsInput } from "./deviceReport";
import { summarizeLongTasks } from "./perfProbe";

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
