// ============================================================================
// ExerciseModal'ın SAF mantığı — DOM testi yok (projede jsdom/@testing-library
// yok), bu yüzden bileşenden dışarı aldığım üç saf fonksiyon test edilir:
//
//   1. `EXERCISE_PRESETS` — 13 preset, benzersiz `nameKey`, geçerli kategori.
//   2. `resolveKcal` — `kcalOverride` önceliği (L20: ekranda ne yazıyorsa
//      kayda o girer), yoksa `burnedKcal` (Task 3) devreye girer.
//   3. `parseWeightInput` — kilo sorusunun girdisi; bozuk/negatif girdi
//      `null` döner, yani uydurma kilo YAZILMAZ (L21).
//
// Kilo sorusunun `weightKg === null` tetiği bileşende: `handleSaveExercise`
// `weightKg === null` ise kaydı `pendingExercise`'a alıp soruyu açar. O dallanma
// `useData`/`updateConfig` gerektirdiği için saf değil; tarayıcıda Task 8
// doğrulayacak.
// ============================================================================
import { describe, expect, it } from "vitest";
import { EXERCISE_PRESETS, parseWeightInput, resolveKcal } from "./ExerciseModal";
import { burnedKcal, metFor } from "../lib/exercise";
import { EXERCISE_CONFIG_KEY } from "../lib/exercise";
import en from "../i18n/locales/en.json";
import tr from "../i18n/locales/tr.json";
import pl from "../i18n/locales/pl.json";

const CATEGORIES = ["run", "weights", "walk", "swim", "cycle", "custom"] as const;

describe("EXERCISE_PRESETS", () => {
  it("13 gömülü preset içerir", () => {
    expect(EXERCISE_PRESETS).toHaveLength(13);
  });

  it("nameKey'leri benzersizdir (React key + çeviri çakışması olmaz)", () => {
    const keys = EXERCISE_PRESETS.map((p) => p.nameKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her preset geçerli bir ExerciseCategory taşır (genişletilmedi)", () => {
    for (const p of EXERCISE_PRESETS) {
      expect(CATEGORIES).toContain(p.category);
    }
  });

  it("önerilen süre pozitif tam sayıdır", () => {
    for (const p of EXERCISE_PRESETS) {
      expect(Number.isInteger(p.durationMinutes)).toBe(true);
      expect(p.durationMinutes).toBeGreaterThan(0);
    }
  });

  it("nameKey 3 dilde de tanımlıdır (locale'de olmayan anahtar ekranda çıplak görünür)", () => {
    for (const p of EXERCISE_PRESETS) {
      const key = p.nameKey.replace(/^exercise\./, "") as keyof typeof tr.exercise;
      for (const loc of [en, tr, pl]) {
        expect(loc.exercise[key], `${p.nameKey} eksik`).toBeTruthy();
      }
    }
  });

  it("preset'te SABİT kalori yoktur —UNKAL da yoksa kayıt calorie'siz olurdu", () => {
    for (const p of EXERCISE_PRESETS) {
      expect(Object.keys(p)).not.toContain("caloriesBurned");
    }
  });

  it("brief'teki kategori eşlemesi birebir uygulanmıştır", () => {
    const by = (k: string) => EXERCISE_PRESETS.find((p) => p.nameKey.endsWith(k))?.category;
    expect(by("presetRun")).toBe("run");
    expect(by("presetWalk")).toBe("walk");
    expect(by("presetWeights")).toBe("weights");
    expect(by("presetSwim")).toBe("swim");
    expect(by("presetCycle")).toBe("cycle");
    expect(by("presetTreadmill")).toBe("run");
    expect(by("presetHiit")).toBe("run");
    // Bilinçli tavan: 6 aktivite `custom` (MET 4.0) ile kaydedilir.
    for (const k of [
      "presetYoga",
      "presetPilates",
      "presetTennis",
      "presetBasketball",
      "presetFootball",
      "presetDance",
    ]) {
      expect(by(k), k).toBe("custom");
      expect(metFor("custom")).toBe(4.0);
    }
  });
});

describe("resolveKcal", () => {
  it("kcalOverride varsa KULLANICININ yazdığı gerçek gider (formül ezilmez)", () => {
    // 80 kg, 30 dk koşu → formül 349 verir; kullanıcı 310 yazdıysa 310 kaydedilir.
    expect(resolveKcal(310, "run", 80, 30)).toBe(310);
    expect(burnedKcal("run", 80, 30)).toBe(349);
  });

  it("override yoksa hesaplanan kalori yazılır", () => {
    expect(resolveKcal(null, "run", 80, 30)).toBe(349);
    expect(resolveKcal(null, "run", 40, 30)).toBe(174);
    expect(resolveKcal(null, "run", 80, 60)).toBe(697);
  });

  it("geçersiz elle override (0/NaN) formüle düşer", () => {
    expect(resolveKcal(0, "run", 80, 30)).toBe(349);
    expect(resolveKcal(Number.NaN, "run", 80, 30)).toBe(349);
    expect(resolveKcal(Number.POSITIVE_INFINITY, "run", 80, 30)).toBe(349);
  });

  it("kilo ya da süre geçersizse 0 döner (uydurma değer üretmez)", () => {
    expect(resolveKcal(null, "run", 0, 30)).toBe(0);
    expect(resolveKcal(null, "run", 80, 0)).toBe(0);
  });
});

describe("parseWeightInput", () => {
  it("sayıyı ve Türkçe virgüllü sayıyı kabul eder", () => {
    expect(parseWeightInput("80")).toBe(80);
    expect(parseWeightInput(" 78,5 ")).toBe(78.5);
    expect(parseWeightInput("78.5")).toBe(78.5);
  });

  it("boş/bozuk/sıfır/negatif girdide null döner — uydurma kilo YAZILMAZ (L21)", () => {
    for (const bad of ["", "   ", "abc", "0", "-70", "NaN", "Infinity", "8 0"]) {
      expect(parseWeightInput(bad), bad).toBeNull();
    }
  });
});

describe("EXERCISE_CONFIG_KEY (kilo sorusu ayrı anahtara yazar)", () => {
  it("egzersiz ve kilo AYRI anahtarlarda yaşar (biri diğerini silmez)", () => {
    expect(EXERCISE_CONFIG_KEY).toBe("exercise");
    expect(EXERCISE_CONFIG_KEY).not.toBe("weight");
  });
});
