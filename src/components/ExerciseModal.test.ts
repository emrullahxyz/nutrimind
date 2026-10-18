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
import {
  EXERCISE_PRESETS,
  MAX_WEIGHT_KG,
  WEIGHT_CONFIG_KEY,
  displayExerciseName,
  existingExerciseConfig,
  parseWeightInput,
  resolveKcal,
} from "./ExerciseModal";
import {
  EXERCISE_CONFIG_KEY,
  burnedKcal,
  metFor,
  parseExerciseEntries,
  withCatalog,
  withExercises,
} from "../lib/exercise";
import type { AppConfig, Exercise } from "../types";
import type { CatalogEntry } from "../lib/exercise";
import en from "../i18n/locales/en.json";
import tr from "../i18n/locales/tr.json";
import pl from "../i18n/locales/pl.json";

const ex: Exercise = {
  id: "ex_1",
  name: "exercise.presetRun",
  category: "run",
  durationMinutes: 30,
  caloriesBurned: 349,
};

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

describe("displayExerciseName", () => {
  const fakeT = (key: string) => `TR:${key}`;

  it("kayda yazılmış PRESET ANAHTARINI çevirir (hesap dili değişse de ad durmaz)", () => {
    // Kayıt "exercise.presetWeights" taşır; ekran o anki dilde gösterir.
    expect(displayExerciseName("exercise.presetWeights", fakeT)).toBe("TR:exercise.presetWeights");
  });

  it("kullanıcının kendi yazdığı ad olduğu gibi gösterilir (çevrilmez)", () => {
    expect(displayExerciseName("Rampa yürüyüş", fakeT)).toBe("Rampa yürüyüş");
  });

  it("ESKİ kayıtlar (çevrilerek yazılmış düz metin) bozulmadan görünür", () => {
    // Canlı veride "Trening siłowy" gibi yazılmış preset adları var; bunlar
    // listeden DÜŞER olsaydı kullanıcının geçmişi kaybolurdu.
    expect(displayExerciseName("Trening siłowy", fakeT)).toBe("Trening siłowy");
    expect(displayExerciseName("Ağırlık Antrenmanı", fakeT)).toBe("Ağırlık Antrenmanı");
  });

  it("hiçbir preset adı KAYDA çevrilerek yazılmaz (bozulmanın kökü kapatıldı)", () => {
    for (const p of EXERCISE_PRESETS) {
      const short = p.nameKey.replace(/^exercise\./, "") as keyof typeof tr.exercise;
      // Kayda yazılan şey çeviri metni DEĞİL — ne tam anahtar ne de öneksiz
      // hali. `t()` ile yazılmış olsaydı biri bunlardan biriyle eşleşirdi.
      expect([short, p.nameKey]).not.toContain(tr.exercise[short]);
      expect([short, p.nameKey]).not.toContain(en.exercise[short]);
      expect([short, p.nameKey]).not.toContain(pl.exercise[short]);
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

  it("sınırdan büyük kilo null döner — Infinity kalorili KAYIT YAZILMAZ (sessiz veri kaybı)", () => {
    // `Number("1e308")` sonludur ama `burnedKcal` → Infinity üretir ve
    // `parseExerciseItem` bu kaydı reddeder: kullanıcı kaydetti sanır, reload'da
    // kaybolurdu. Sınır büyükse de reddedilmelidir.
    expect(parseWeightInput("1e308")).toBeNull();
    expect(parseWeightInput(String(MAX_WEIGHT_KG + 1))).toBeNull();
    expect(parseWeightInput(String(MAX_WEIGHT_KG))).toBe(MAX_WEIGHT_KG);
  });
});

describe("config anahtarları (egzersiz ve kilo AYRI satırlarda)", () => {
  it("egzersiz kaydı ile kilo ölçümü birbirini silmez", () => {
    expect(EXERCISE_CONFIG_KEY).toBe("exercise");
    expect(WEIGHT_CONFIG_KEY).toBe("weight");
    expect(EXERCISE_CONFIG_KEY).not.toBe(WEIGHT_CONFIG_KEY);
    // İkisi de backend'in anahtar desenine uyar (tire/büyük harf yok).
    for (const key of [EXERCISE_CONFIG_KEY, WEIGHT_CONFIG_KEY]) {
      expect(key).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
    }
  });
});

describe("existingExerciseConfig — günlük kayıt yazarken `catalog` KORUNUR", () => {
  const catalog: CatalogEntry[] = [
    { id: "ec_1", name: "Rampa yürüyüş", category: "walk", met: 5.5 },
  ];

  it("kataloglu config'i olduğu gibi yaylar", () => {
    const base = existingExerciseConfig({ exercise: { entries: {}, catalog } });
    expect(base.catalog).toEqual(catalog);
  });

  it("catalog YANINA günlük kayıt yazınca katalog düşmez ⭐ simetri", () => {
    // `withCatalog`'un "entries KORUNUR" vaadi tek yönlüydü; bu yazma yolu
    // ters yönü koruyor. İkisi birleşince `catalog` da `entries` de yaşar.
    const raw = existingExerciseConfig({ exercise: { entries: {}, catalog } });
    const next: Record<string, unknown> = {
      ...raw,
      entries: withExercises({}, "2026-10-18", [ex]),
    };
    expect(parseExerciseEntries(next)["2026-10-18"]).toHaveLength(1);
    expect(next.catalog).toEqual(catalog);
  });

  it("withCatalog SONRASI günlük kayıt yazmak katalog'u düşürmez", () => {
    const withCat = withCatalog({ exercise: { entries: {} } } as AppConfig, catalog);
    const base = existingExerciseConfig(withCat);
    const next: Record<string, unknown> = {
      ...base,
      entries: withExercises({}, "2026-10-18", [ex]),
    };
    expect(next.catalog).toEqual(catalog);
    expect(parseExerciseEntries(next)["2026-10-18"]).toHaveLength(1);
  });

  it("config.exercise bozuksa boş nesne döner (yazma yine de çalışır)", () => {
    for (const bad of [null, undefined, "bozuk", 42, [1, 2]]) {
      expect(existingExerciseConfig({ exercise: bad })).toEqual({});
    }
    expect(existingExerciseConfig(undefined)).toEqual({});
  });

  it("girdi config'i mutasyona uğratmaz", () => {
    const config = { exercise: { entries: {}, catalog } };
    const base = existingExerciseConfig(config);
    base.entries = "yazildi";
    expect(config.exercise.entries).toEqual({});
  });
});
