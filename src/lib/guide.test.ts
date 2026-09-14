import { describe, expect, it } from "vitest";
import {
  GUIDE_STEPS,
  GUIDE_STEP_COUNT,
  GUIDE_VERSION,
  guideDonePayload,
  isGuideDone,
  parseGuideState,
  shouldShowGuide,
  type GuideEligibility,
} from "./guide";

// Bu test dosyası rehberin DOM'a dokunmayan kararlarını kilitler: durum ayrıştırma,
// sürüm karşılaştırması ve "gösterilsin mi" matrisi. Gerçek coach-mark yerleşimi
// bileşenin işi (tarayıcıda ölçülür — proje testleri saf mantıkla sınırlı).

describe("parseGuideState", () => {
  it("geçerli durumu okur", () => {
    expect(parseGuideState({ version: 2, status: "completed", at: "2026-09-14T10:00:00.000Z" })).toEqual({
      version: 2,
      status: "completed",
      at: "2026-09-14T10:00:00.000Z",
    });
  });

  it("`at` eksikse boş metne düşer (teşhis alanı, kritik değil)", () => {
    expect(parseGuideState({ version: 1, status: "skipped" })?.at).toBe("");
  });

  it("tanınmayan durum değerini reddeder", () => {
    expect(parseGuideState({ version: 1, status: "done" })).toBeNull();
  });

  it("sürüm sayı değilse reddeder", () => {
    expect(parseGuideState({ version: "1", status: "completed" })).toBeNull();
    expect(parseGuideState({ version: Number.NaN, status: "completed" })).toBeNull();
  });

  it("bozuk/eksik gövdede null döner (rehber bir kez daha gösterilir, veri kaybı olmaz)", () => {
    expect(parseGuideState(undefined)).toBeNull();
    expect(parseGuideState(null)).toBeNull();
    expect(parseGuideState([])).toBeNull();
    expect(parseGuideState("completed")).toBeNull();
    expect(parseGuideState({})).toBeNull();
  });
});

describe("isGuideDone", () => {
  it("kayıt yoksa bitmemiştir", () => {
    expect(isGuideDone(null)).toBe(false);
  });

  it("aynı sürüm bitmiştir", () => {
    expect(isGuideDone({ version: GUIDE_VERSION, status: "completed", at: "" })).toBe(true);
    expect(isGuideDone({ version: GUIDE_VERSION, status: "skipped", at: "" })).toBe(true);
  });

  it("eski sürüm bitmiş SAYILMAZ — yeni tur yeniden gösterilir", () => {
    expect(isGuideDone({ version: GUIDE_VERSION - 1, status: "completed", at: "" })).toBe(false);
  });

  it("daha yeni sürüm de bitmiş sayılır (geri alınmış sürüm kullanıcıyı geri sürüklemez)", () => {
    expect(isGuideDone({ version: GUIDE_VERSION + 3, status: "completed", at: "" })).toBe(true);
  });
});

describe("guideDonePayload", () => {
  it("sürüm + durum + zaman damgası yazar", () => {
    expect(guideDonePayload("skipped", "2026-09-14T00:00:00.000Z")).toEqual({
      version: GUIDE_VERSION,
      status: "skipped",
      at: "2026-09-14T00:00:00.000Z",
    });
  });

  it("yazılan gövde geri okunabilir (round-trip)", () => {
    const payload = guideDonePayload("completed", "2026-09-14T00:00:00.000Z");
    expect(parseGuideState(payload)).toEqual({
      version: GUIDE_VERSION,
      status: "completed",
      at: "2026-09-14T00:00:00.000Z",
    });
    expect(isGuideDone(parseGuideState(payload))).toBe(true);
  });
});

describe("shouldShowGuide", () => {
  const base: GuideEligibility = {
    state: null,
    hasCompletedOnboarding: true,
    dayCount: 0,
    wizardOpen: false,
    dismissedThisSession: false,
    forceOpen: false,
  };

  it("yeni hesapta (kurulum bitti, veri yok, kayıt yok) gösterilir", () => {
    expect(shouldShowGuide(base)).toBe(true);
  });

  it("profil kurulumu bitmemişse gösterilmez — önce sihirbaz var", () => {
    expect(shouldShowGuide({ ...base, hasCompletedOnboarding: false })).toBe(false);
  });

  it("gün verisi olan hesaba kendiliğinden çıkmaz", () => {
    expect(shouldShowGuide({ ...base, dayCount: 3 })).toBe(false);
  });

  it("sihirbaz açıkken üst üste binmez", () => {
    expect(shouldShowGuide({ ...base, wizardOpen: true })).toBe(false);
  });

  it("bu oturumda kapatıldıysa yeniden açılmaz", () => {
    expect(shouldShowGuide({ ...base, dismissedThisSession: true })).toBe(false);
  });

  it("tamamlanmış/atlanmış güncel sürümde bir daha gösterilmez", () => {
    const done = { version: GUIDE_VERSION, status: "completed" as const, at: "" };
    expect(shouldShowGuide({ ...base, state: done })).toBe(false);
    expect(shouldShowGuide({ ...base, state: { ...done, status: "skipped" } })).toBe(false);
  });

  it("eski sürüm kaydı yeni turu engellemez", () => {
    expect(
      shouldShowGuide({ ...base, state: { version: GUIDE_VERSION - 1, status: "completed", at: "" } }),
    ).toBe(true);
  });
});

describe("shouldShowGuide — forceOpen (Ayarlar > Rehberi tekrar göster)", () => {
  const base: GuideEligibility = {
    state: { version: GUIDE_VERSION, status: "completed", at: "" },
    hasCompletedOnboarding: true,
    dayCount: 42,
    wizardOpen: false,
    dismissedThisSession: false,
    forceOpen: true,
  };

  it("görülmüş ve veri dolu olsa bile açılır (kullanıcı açıkça istedi)", () => {
    expect(shouldShowGuide(base)).toBe(true);
  });

  it("sihirbaz açıkken yine de açılmaz", () => {
    expect(shouldShowGuide({ ...base, wizardOpen: true })).toBe(false);
  });

  it("oturum içi kapanış forceOpen'ı da bastırır (çift açılma kilidi)", () => {
    expect(shouldShowGuide({ ...base, dismissedThisSession: true })).toBe(false);
  });
});

describe("GUIDE_STEPS", () => {
  it("altı adımdır ve her adımın hedefi benzersizdir", () => {
    expect(GUIDE_STEP_COUNT).toBe(6);
    expect(GUIDE_STEPS).toHaveLength(GUIDE_STEP_COUNT);
    const targets = GUIDE_STEPS.map((s) => s.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("adım kimlikleri ve i18n anahtarları benzersizdir", () => {
    expect(new Set(GUIDE_STEPS.map((s) => s.id)).size).toBe(GUIDE_STEP_COUNT);
    const keys = GUIDE_STEPS.flatMap((s) => [s.titleKey, s.bodyKey]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her adım `guide.` altında i18n anahtarı taşır", () => {
    for (const step of GUIDE_STEPS) {
      expect(step.titleKey.startsWith("guide.")).toBe(true);
      expect(step.bodyKey.startsWith("guide.")).toBe(true);
    }
  });

  it("alt gezinme çubuğundaki hedefler `fixed` işaretlidir (boşuna kaydırma yok)", () => {
    const fixedTargets = GUIDE_STEPS.filter((s) => s.fixed).map((s) => s.target);
    expect(fixedTargets).toEqual(["aliases-tab", "fab", "history-tab", "settings-tab"]);
  });
});
