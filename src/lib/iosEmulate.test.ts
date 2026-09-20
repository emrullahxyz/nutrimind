import { describe, expect, it } from "vitest";
import { applyEmulateAttributes, parseEmulateParam } from "./iosEmulate";
import { cameraScenarioFor, parseCameraScenarioParam, SCENARIOS } from "./iosFakeMedia";

// Dev-only taklit altyapısı. Saf kısımları burada; DOM/browser kısımları
// (`installFakeMediaDevices`) gerçek tarayıcıda, Preview'da koşar.

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
