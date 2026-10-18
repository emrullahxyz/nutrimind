// ============================================================================
// ExerciseSettings'in SAF mantığı — DOM testi yok (projede jsdom/@testing-library
// yok), bu yüzden bileşenden dışarı çıkarılan üç saf fonksiyon test edilir:
//
//   1. `catalogWrite` — katalog YAZARKEN `entries` (günlük kayıtlar) korunur ve
//      canlı config'e referans sızmaz. `config.exercise` TEK config satırı ve
//      sunucu yazmada satırın tamamını değiştirdiği için bu iki yönlü koruma
//      sessiz veri kaybının tek kaynağı (bkz. ExerciseModal'daki simetri).
//   2. `parseMetInput` — MET alanı serbest; boş/geçersiz girdi `null` döner.
//   3. `buildCatalogEntry` — ad + kategori + MET'ten katalog satırı; MET boşsa
//      `metFor(category)` UYGULANIR (aksi hâlde `parseCatalog` `met <= 0`
//      satırı sessizce düşürür, kullanıcı kaydetti sanır).
//
// `useData`/`updateConfig` gerektiren dallanma (busy, hata yakalama) saf
// değil; tarayıcıda Task 8 doğrulayacak.
// ============================================================================
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  MAX_MET,
  buildCatalogEntry,
  catalogWrite,
  parseMetInput,
} from "./ExerciseSettings";
import {
  EXERCISE_CONFIG_KEY,
  metFor,
  parseCatalog,
  parseExerciseEntries,
} from "../lib/exercise";
import type { AppConfig } from "../types";
import type { CatalogEntry } from "../lib/exercise";
import en from "../i18n/locales/en.json";
import tr from "../i18n/locales/tr.json";
import pl from "../i18n/locales/pl.json";

const KEEP: CatalogEntry = { id: "ec_1", name: "Rampa yürüyüş", category: "walk", met: 5.5 };

describe("catalogWrite — katalog yazarken günlük kayıtlar KORUNUR", () => {
  const entries = {
    "2026-10-18": [
      { id: "ex_1", name: "exercise.presetRun", category: "run", durationMinutes: 30, caloriesBurned: 349 },
    ],
  };

  it("entries yanına catalog ekler", () => {
    const row = catalogWrite({ exercise: { entries } } as AppConfig, [KEEP]);
    expect(row.catalog).toEqual([KEEP]);
    expect(parseExerciseEntries(row)["2026-10-18"]).toHaveLength(1);
  });

  it("catalog'u SILMEK de entries'i bırakır (günlük kayıt silinmez)", () => {
    const row = catalogWrite({ exercise: { entries } } as AppConfig, []);
    expect(row.catalog).toEqual([]);
    expect(parseExerciseEntries(row)["2026-10-18"]).toHaveLength(1);
  });

  it("MEVCUT config'i yazmadan önce alır — render anındaki bayat kopya değil", () => {
    // Task 4'te yakalanan hatanın tersi: yazma, TAZE okumanın üstüne kurulur.
    const stale = { exercise: { entries: {} } } as AppConfig;
    const fresh = { exercise: { entries } } as AppConfig;
    expect(catalogWrite(fresh, [KEEP]).entries).toEqual(entries);
    expect(catalogWrite(stale, [KEEP]).entries).toEqual({});
  });

  it("config.exercise bozuksa yazma yine de çalışır", () => {
    for (const bad of [null, undefined, "bozuk", 42, [1, 2]]) {
      const row = catalogWrite({ exercise: bad } as unknown as AppConfig, [KEEP]);
      expect(row.catalog).toEqual([KEEP]);
    }
  });

  it("YAYMA SIZINTISI YOK — yazılan satır canlı config'e bağlı değil ⭐", () => {
    // Task 4'te gerçek bir hataydı: referans dönen yardımcı, çağıranın
    // üst düzeyde yaptığı değişikliği canlı config'e yazıyordu.
    const config = { exercise: { entries, catalog: [] as CatalogEntry[] } } as AppConfig;
    const nextCatalog = [KEEP];
    const row = catalogWrite(config, nextCatalog);

    row.entries = "yazildi";
    row.catalog = [];
    expect(config.exercise.entries).toEqual(entries);
    expect(config.exercise.catalog).toEqual([]);

    // Dizi de kopyalanır: `nextCatalog`'i sonradan boşaltmak yazılmış satırı
    // etkilememeli.
    const row2 = catalogWrite(config, nextCatalog);
    nextCatalog.length = 0;
    expect(row2.catalog).toEqual([KEEP]);
  });
});

describe("parseMetInput", () => {
  it("sayıyı ve Türkçe virgüllü sayıyı kabul eder", () => {
    expect(parseMetInput("4.3")).toBe(4.3);
    expect(parseMetInput(" 6,5 ")).toBe(6.5);
  });

  it("boş girdi null döner → ortalamaya göre hesaplanır", () => {
    expect(parseMetInput("")).toBeNull();
    expect(parseMetInput("   ")).toBeNull();
  });

  it("bozuk/sıfır/negatif/sınırsız girdi null döner (uydurma MET YAZILMAZ)", () => {
    for (const bad of ["abc", "0", "-4", "NaN", "Infinity", "4 3"]) {
      expect(parseMetInput(bad), bad).toBeNull();
    }
    expect(parseMetInput(String(MAX_MET + 1))).toBeNull();
    expect(parseMetInput(String(MAX_MET))).toBe(MAX_MET);
  });
});

describe("buildCatalogEntry", () => {
  it("adsız giriş reddedilir (kayıt YAZILMAZ)", () => {
    expect(buildCatalogEntry("", "run", "")).toBeNull();
    expect(buildCatalogEntry("   ", "run", "")).toBeNull();
  });

  it("MET boş bırakılırsa metFor(category) UYGULANIR ⭐", () => {
    for (const c of CATEGORIES) {
      const entry = buildCatalogEntry("Futbol", c, "");
      expect(entry, c).not.toBeNull();
      expect(entry?.met).toBe(metFor(c));
      expect(entry?.met).toBeGreaterThan(0);
    }
  });

  it("elle yazılan MET kategorinin tahminini EZER", () => {
    expect(buildCatalogEntry("Masa tenisi", "custom", "4.3")?.met).toBe(4.3);
  });

  it("ürettiği satır parseCatalog'ten GEÇER (met <= 0 sessizce düşmez)", () => {
    for (const c of CATEGORIES) {
      const entry = buildCatalogEntry("Boş MET", c, "");
      expect(entry).not.toBeNull();
      expect(parseCatalog({ catalog: [entry] })).toEqual([entry]);
    }
  });

  it("adı kırpar, kategoriyi korur, katalog id'si üretir", () => {
    const entry = buildCatalogEntry("  Rampa yürüyüş  ", "walk", "5.5");
    expect(entry?.name).toBe("Rampa yürüyüş");
    expect(entry?.category).toBe("walk");
    expect(entry?.id).toMatch(/^ec_/);
  });

  it("iki kayıt aynı adı taşısa da id'leri ayrıdır (React key çakışmaz)", () => {
    expect(buildCatalogEntry("Koşu", "run", "")?.id).not.toBe(
      buildCatalogEntry("Koşu", "run", "")?.id,
    );
  });

  it("6 mevcut kategori sunulur — ExerciseCategory GENİŞLETİLMEDİ", () => {
    expect(CATEGORIES).toEqual(["run", "weights", "walk", "swim", "cycle", "custom"]);
  });
});

describe("i18n", () => {
  const NEW_KEYS = [
    "catalogNameLabel",
    "catalogNamePlaceholder",
    "categoryLabel",
    "metLabel",
    "metHint",
    "catalogEmpty",
    "catalogListTitle",
    "catalogAddTitle",
    "catalogNameRequired",
  ] as const;

  it("yeni egzersiz katalog anahtarları 3 dilde de tanımlıdır", () => {
    for (const key of NEW_KEYS) {
      expect(en.exercise[key], `en.exercise.${key}`).toBeTruthy();
      expect(tr.exercise[key], `tr.exercise.${key}`).toBeTruthy();
      expect(pl.exercise[key], `pl.exercise.${key}`).toBeTruthy();
    }
  });

  it("alt görünüm başlıkları 3 dilde de tanımlıdır (Task 6 bunları kullanır)", () => {
    const keys = ["exerciseTitle", "exerciseSubtitle", "subviewExercise"] as const;
    for (const key of keys) {
      expect(en.settings[key], `en.settings.${key}`).toBeTruthy();
      expect(tr.settings[key], `tr.settings.${key}`).toBeTruthy();
      expect(pl.settings[key], `pl.settings.${key}`).toBeTruthy();
    }
  });

  it("katalog ayrı bir config anahtarı DEĞİL — egzersiz kayıt satırıyla aynı", () => {
    expect(EXERCISE_CONFIG_KEY).toBe("exercise");
    expect(EXERCISE_CONFIG_KEY).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
  });
});