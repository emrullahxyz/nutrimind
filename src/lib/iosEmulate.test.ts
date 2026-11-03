import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyBarcodeEmulation,
  applyEmulateAttributes,
  parseBarcodeParam,
  parseEmulateParam,
} from "./iosEmulate";
import {
  cameraScenarioFor,
  installFakeMediaDevices,
  parseCameraScenarioParam,
  SCENARIOS,
  uninstallFakeMediaDevices,
} from "./iosFakeMedia";

// Dev-only taklit altyapısı. Kamera seçiminde gerçek install/uninstall yolu,
// yalnızca canvas ve tarayıcı API sınırları stub edilir.

describe("parseEmulateParam", () => {
  it("bilinen modları okur", () => {
    expect(parseEmulateParam("?emulate=island")).toBe("island");
    expect(parseEmulateParam("?emulate=notch&x=1")).toBe("notch");
    expect(parseEmulateParam("?camera=off&emulate=se")).toBe("se");
    expect(parseEmulateParam("?emulate=OFF")).toBe("off");
  });

  it("TANINMAYAN değerde null döner — sessizce varsayılana düşmez", () => {
    // Aksi hâlde `?emulate=ipone` yazan biri taklidin açıldığını sanırdı.
    expect(parseEmulateParam("?emulate=ipone")).toBeNull();
    expect(parseEmulateParam("?emulate=")).toBeNull();
    expect(parseEmulateParam("")).toBeNull();
    expect(parseEmulateParam("?other=island")).toBeNull();
  });
});

describe("applyEmulateAttributes", () => {
  const root = () => ({ dataset: {} }) as unknown as HTMLElement;

  it("mod yazılınca attribute'ları kurar", () => {
    const el = root();
    applyEmulateAttributes(el, "island");
    expect(el.dataset.emulateIos).toBe("island");
    expect(el.dataset.emulateStandalone).toBe("1");
  });

  it("off/null temizler (taklit kapanınca iz kalmaz)", () => {
    const el = root();
    applyEmulateAttributes(el, "island");
    applyEmulateAttributes(el, "off");
    expect(el.dataset.emulateIos).toBeUndefined();
    expect(el.dataset.emulateStandalone).toBeUndefined();
  });
});

// v0.30.8: barkod düzeltmesinin ASIL yolu (yerli dedektör yokken wasm yedeği)
// masaüstü Chrome'da kendiliğinden çalışmaz — Chrome'un yerli dedektörü vardır.
// `?barcodes=none` iPhone koşulunu üretir.
describe("barkod yeteneği taklidi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("yalnızca 'none' kabul edilir, bilinmeyen değer sessizce yok sayılır", () => {
    expect(parseBarcodeParam("?barcodes=none")).toBe("none");
    expect(parseBarcodeParam("?barcodes=NONE&x=1")).toBe("none");
    expect(parseBarcodeParam("?barcodes=native")).toBeNull();
    expect(parseBarcodeParam("")).toBeNull();
  });

  it("yazarken yerli dedektörü siler, null iken dokunmaz", () => {
    vi.stubGlobal("BarcodeDetector", function BarcodeDetector() {});
    applyBarcodeEmulation("none");
    const g = globalThis as unknown as { BarcodeDetector?: unknown };
    expect(g.BarcodeDetector).toBeUndefined();

    vi.stubGlobal("BarcodeDetector", function BarcodeDetector() {});
    applyBarcodeEmulation(null);
    expect(typeof (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector).toBe(
      "function",
    );
  });
});

describe("sahte getUserMedia kısıtları", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: async () => [],
        getSupportedConstraints: () => ({}),
      },
    });
    vi.stubGlobal("window", { setInterval, clearInterval });
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => null,
        captureStream: () => {
          const track = { stop() {} };
          return { getVideoTracks: () => [track] };
        },
      }),
    });
  });

  afterEach(() => {
    uninstallFakeMediaDevices();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(["ios-no-deviceid", "ios-first-front"] as const)(
    "%s: exact environment ilk çağrıda arka kamera seçer, ideal'den önce gelir",
    async (scenario) => {
      installFakeMediaDevices("island", "", scenario);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment", ideal: "user" } },
      });
      expect(stream.getVideoTracks()[0].getSettings().facingMode).toBe("environment");
      expect(stream.getVideoTracks()[0].label).toBe("Back Camera");
    },
  );

  it.each<[string, MediaTrackConstraints, string]>([
    ["yok deviceId", { deviceId: { exact: "missing-camera" } }, "deviceId"],
    ["yok facingMode", { facingMode: { exact: "left" } }, "facingMode"],
    [
      "çelişen kesin kısıtlar",
      { deviceId: { exact: "ios-front" }, facingMode: { exact: "environment" } },
      "facingMode",
    ],
  ])("%s: OverconstrainedError ile reddeder", async (_name, video, constraint) => {
    installFakeMediaDevices("island", "", "ios-first-front");
    await expect(navigator.mediaDevices.getUserMedia({ video })).rejects.toMatchObject({
      name: "OverconstrainedError",
      constraint,
    });
    expect((await navigator.mediaDevices.enumerateDevices()).every((d) => d.deviceId === "")).toBe(true);
  });

  it("exact dizilerini kabul eder; deviceId ideal'inden önce gelir", async () => {
    installFakeMediaDevices("island", "", "ios-first-front");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: ["missing-camera", "ios-back-ultra"], ideal: "ios-front" },
        facingMode: { exact: ["left", "environment"] },
      },
    });
    expect(stream.getVideoTracks()[0].label).toBe("Back Ultra Wide Camera");
  });

  it.each(["environment", { ideal: "environment" }])(
    "ilk çağrı soft facingMode=%j isteğini yok sayar; sonraki çağrı uygular",
    async (facingMode) => {
      installFakeMediaDevices("island", "", "ios-first-front");
      const first = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      expect(first.getVideoTracks()[0].getSettings().facingMode).toBe("user");
      const second = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      expect(second.getVideoTracks()[0].getSettings().facingMode).toBe("environment");
    },
  );

  it("yok ideal deviceId isteği reddetmez; kesin facingMode'a uyar", async () => {
    installFakeMediaDevices("island", "", "ios-first-front");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { ideal: "missing-camera" }, facingMode: { exact: "environment" } },
    });
    expect(stream.getVideoTracks()[0].getSettings().facingMode).toBe("environment");
  });
});

describe("camera senaryoları", () => {
  it("yalnızca bilinen senaryolar kabul edilir", () => {
    expect(parseCameraScenarioParam("?camera=ios-first-front")).toBe("ios-first-front");
    expect(parseCameraScenarioParam("?camera=off")).toBe("off");
    expect(parseCameraScenarioParam("?camera=wat")).toBeNull();
  });

  it("taklit açıkken varsayılan senaryo BİLDİRİLEN arızadır", () => {
    expect(cameraScenarioFor("island", "")).toBe("ios-first-front");
    expect(cameraScenarioFor("island", "?camera=android-good")).toBe("android-good");
  });

  it("taklit kapalıyken sahte cihaz kurulmaz", () => {
    expect(cameraScenarioFor(null, "")).toBe("off");
    expect(cameraScenarioFor("off", "")).toBe("off");
  });

  it("senaryolar iOS'un gerçek cihaz etiketlerini taşır", () => {
    const labels = SCENARIOS["ios-first-front"].devices.map((d) => d.label);
    expect(labels).toEqual([
      "Front Camera",
      "Back Camera",
      "Back Dual Wide Camera",
      "Back Ultra Wide Camera",
    ]);
  });
});
