import { describe, expect, it } from "vitest";
import {
  createCameraDiagLog,
  formatCameraDiag,
  summarizeDevices,
  summarizeSettings,
  truncateNote,
} from "./cameraDiag";

describe("createCameraDiagLog", () => {
  const entry = (attempt: number, result: "ok" | "retry" = "ok") => ({
    facing: "environment" as const,
    attempt,
    requested: "facingMode.ideal=environment",
    result,
    got: "id=? facing=user 1280x720",
    devices: "videoinput=4 [Front Camera | Back Camera]",
  });

  it("halka tampon: en eski kayıt düşer, sınır aşılmaz", () => {
    const log = createCameraDiagLog(3);
    for (let i = 1; i <= 5; i++) log.record(entry(i));
    const items = log.entries();
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.attempt)).toEqual([3, 4, 5]);
  });

  it("damga verilmezse ISO zaman ekler, verilirse korur", () => {
    const log = createCameraDiagLog();
    log.record(entry(1));
    log.record({ ...entry(2), at: "2026-09-20T10:00:00.000Z" });
    expect(log.entries()[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(log.entries()[1].at).toBe("2026-09-20T10:00:00.000Z");
  });

  it("entries() kopya döner (dışarıdan mutasyon kaydı bozmaz)", () => {
    const log = createCameraDiagLog();
    log.record(entry(1));
    log.entries().push({ ...entry(99), at: "" });
    expect(log.entries()).toHaveLength(1);
  });

  it("clear boşaltır", () => {
    const log = createCameraDiagLog();
    log.record(entry(1));
    log.clear();
    expect(log.entries()).toEqual([]);
  });
});

describe("summarizeDevices", () => {
  it("video girişlerini etiketleriyle listeler", () => {
    expect(
      summarizeDevices([
        { kind: "audioinput", label: "Mic", deviceId: "m" },
        { kind: "videoinput", label: "Front Camera", deviceId: "f" },
        { kind: "videoinput", label: "Back Camera", deviceId: "b" },
      ]),
    ).toBe("videoinput=2 [Front Camera | Back Camera]");
  });

  it("izin öncesi boş etiketleri GİZLEMEZ — eksiklik kanıttır", () => {
    expect(summarizeDevices([{ kind: "videoinput", label: "", deviceId: "" }])).toBe(
      "videoinput=1 [(no label)]",
    );
  });

  it("cihaz yoksa none", () => {
    expect(summarizeDevices([])).toBe("none");
    expect(summarizeDevices(null)).toBe("none");
  });
});

describe("summarizeSettings", () => {
  it("eksik deviceId/facingMode'u ? ile gösterir (iOS arızasının imzası)", () => {
    expect(summarizeSettings({ width: 1280, height: 720 })).toBe("id=? facing=? 1280x720");
  });

  it("tam ayarları yazar", () => {
    expect(
      summarizeSettings({ deviceId: "ios-back", facingMode: "environment", width: 2560, height: 1440 }),
    ).toBe("id=ios-back facing=environment 2560x1440");
  });

  it("null ayarı açıkça bildirir", () => {
    expect(summarizeSettings(null)).toBe("settings=null");
  });
});

describe("truncateNote", () => {
  it("ad ve mesajı tek satıra indirir", () => {
    expect(truncateNote(new Error("NotReadableError\n  device busy"))).toBe(
      "Error: NotReadableError device busy",
    );
  });

  it("uzun mesajı kısaltır", () => {
    const long = truncateNote({ name: "OverconstrainedError", message: "x".repeat(300) });
    expect(long.length).toBeLessThanOrEqual(130);
    expect(long.endsWith("…")).toBe(true);
  });

  it("string hatayı da kabul eder", () => {
    expect(truncateNote("boom")).toBe("Error: boom");
  });
});

describe("formatCameraDiag", () => {
  it("en yeni kaydı en üste koyar ve numaraları korur", () => {
    const lines = formatCameraDiag([
      { at: "", facing: "environment", attempt: 1, requested: "facingMode.ideal=environment", result: "retry", got: "id=? facing=user 1280x720", devices: "none" },
      { at: "", facing: "environment", attempt: 2, requested: "deviceId=ios-back", result: "ok", got: "id=ios-back facing=environment 2560x1440", devices: "none", note: "switched" },
    ]);
    expect(lines[0].startsWith("#2 environment attempt=2")).toBe(true);
    expect(lines[0]).toContain("→ ok · switched");
    expect(lines[1].startsWith("#1 environment attempt=1")).toBe(true);
    expect(lines[1]).not.toContain("·");
  });
});
