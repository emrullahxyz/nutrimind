import { describe, expect, it } from "vitest";
import {
  EXERCISE_CONFIG_KEY,
  exercisesFor,
  parseExerciseEntries,
  withExercises,
  burnedKcalFor,
  metFor,
  burnedKcal,
  exerciseWeight,
  parseCatalog,
  withCatalog,
  newCatalogId,
} from "./exercise";
import type { CatalogEntry, ExerciseEntries } from "./exercise";
import type { AppConfig, Exercise, ExerciseCategory } from "../types";

// ---------------------------------------------------------------------------
// Gün bazlı entries — eski `exercise_${date}` anahtarı backend'in anahtar
// desenine (tire yok) takıldığı için egzersiz kaydı HİÇ kalıcı olmuyordu.
// ---------------------------------------------------------------------------
describe("exercise entries", () => {
  const ex = (id: string): Exercise => ({
    id,
    name: "Koşu",
    category: "run",
    durationMinutes: 30,
    caloriesBurned: 300,
  });

  it("config anahtarı backend'in desenine uyar (tire/büyük harf yok)", () => {
    expect(EXERCISE_CONFIG_KEY).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
  });

  it("geçersiz girdilerde boş entries döner", () => {
    expect(parseExerciseEntries(null)).toEqual({});
    expect(parseExerciseEntries({})).toEqual({});
    expect(parseExerciseEntries({ entries: [] })).toEqual({});
    expect(parseExerciseEntries({ entries: { "2026-08-05": "bozuk" } })).toEqual({});
  });

  it("bozuk kayıtları düşürüp geçerli olanları korur", () => {
    const parsed = parseExerciseEntries({
      entries: { "2026-08-05": [ex("a"), { id: "b" }, null, ex("c")] },
    });
    expect(parsed["2026-08-05"].map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("tamamı bozuk olan günü hiç eklemez", () => {
    expect(parseExerciseEntries({ entries: { "2026-08-05": [{ id: "x" }] } })).toEqual({});
  });

  it("exercisesFor kayıtsız günde boş dizi döner", () => {
    expect(exercisesFor({}, "2026-08-05")).toEqual([]);
  });

  it("withExercises diğer günlere dokunmaz ve girdiyi mutasyona uğratmaz", () => {
    const before: ExerciseEntries = { "2026-08-04": [ex("eski")] };
    const after = withExercises(before, "2026-08-05", [ex("yeni")]);
    expect(after["2026-08-04"].map((e) => e.id)).toEqual(["eski"]);
    expect(after["2026-08-05"].map((e) => e.id)).toEqual(["yeni"]);
    expect(before["2026-08-05"]).toBeUndefined();
  });

  it("boş liste o günü tamamen düşürür (blob'da boş dizi birikmesin)", () => {
    const before: ExerciseEntries = { "2026-08-05": [ex("a")] };
    expect(withExercises(before, "2026-08-05", [])).toEqual({});
  });
});

describe("burnedKcalFor", () => {
  const ex = (id: string): Exercise => ({
    id,
    name: "Koşu",
    category: "run",
    durationMinutes: 30,
    caloriesBurned: 300,
  });

  it("bir günün yakılan kalorilerini toplar", () => {
    const raw = {
      entries: {
        "2026-08-05": [ex("a"), { ...ex("b"), caloriesBurned: 120 }],
      },
    };
    expect(burnedKcalFor(raw, "2026-08-05")).toBe(420); // 300 + 120
  });

  it("kayıtsız günde 0 döner", () => {
    expect(burnedKcalFor({ entries: {} }, "2026-08-05")).toBe(0);
    expect(burnedKcalFor(null, "2026-08-05")).toBe(0);
  });

  it("bozuk girdide 0 döner", () => {
    expect(burnedKcalFor("bozuk", "2026-08-05")).toBe(0);
    expect(burnedKcalFor({ entries: { "2026-08-05": [{ id: "x" }] } }, "2026-08-05")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MET tabanlı hesap — `caloriesBurned` kullanıcının yazdığı sayıydı, aynı
// aktivite aynı süreyle 250/200/200 kcal kaydediliyordu. Artık aktivite
// `category` + kilo + süre ile hesaplanıyor (bkz. burnedKcal).
// ---------------------------------------------------------------------------
describe("metFor", () => {
  it("her kategoride pozitif ve sonlu bir MET verir", () => {
    const all: ExerciseCategory[] = ["run", "weights", "walk", "swim", "cycle", "custom"];
    for (const cat of all) {
      const met = metFor(cat);
      expect(Number.isFinite(met)).toBe(true);
      expect(met).toBeGreaterThan(0);
    }
  });

  it("koşu MET değeri 8.3", () => {
    expect(metFor("run")).toBe(8.3);
  });
});

describe("burnedKcal", () => {
  // 8,3 × 3,5 × 80 / 200 × 30 = 348,6 → 349 (yuvarlama payı ±1)
  it("MET × 3,5 × kg / 200 × dakika formülünü uygular (tam sayı)", () => {
    expect(burnedKcal("run", 80, 30)).toBe(349);
  });

  it("kilo ile doğru orantılı", () => {
    expect(burnedKcal("run", 40, 30)).toBe(174);
    expect(
      Math.abs(burnedKcal("run", 80, 30) - burnedKcal("run", 40, 30) * 2),
    ).toBeLessThanOrEqual(1);
  });

  it("süre ile doğru orantılı", () => {
    expect(burnedKcal("run", 80, 60)).toBe(697);
    expect(
      Math.abs(burnedKcal("run", 80, 60) - burnedKcal("run", 80, 30) * 2),
    ).toBeLessThanOrEqual(1);
  });

  it("geçersiz kilo/süre 0 döner (uydurma değer üretmez)", () => {
    expect(burnedKcal("run", 0, 30)).toBe(0);
    expect(burnedKcal("run", -80, 30)).toBe(0);
    expect(burnedKcal("run", NaN, 30)).toBe(0);
    expect(burnedKcal("run", Infinity, 30)).toBe(0);
    expect(burnedKcal("run", 80, 0)).toBe(0);
    expect(burnedKcal("run", 80, -30)).toBe(0);
    expect(burnedKcal("run", 80, NaN)).toBe(0);
  });

  it("daha yoğun aktivite daha çok kalori verir", () => {
    expect(burnedKcal("run", 80, 30)).toBeGreaterThan(burnedKcal("walk", 80, 30));
    expect(burnedKcal("custom", 80, 30)).toBeLessThan(burnedKcal("run", 80, 30));
  });
});

// ---------------------------------------------------------------------------
// L21: kilo UYDURMA. `null` dönmek "bilmiyorum" demek; çağıran kullanıcıdan
// sorup `config.weight`'e yazmalı. Varsayılan kilo (70 kg, 0 kg) YOK.
// ---------------------------------------------------------------------------
describe("exerciseWeight", () => {
  it("son ölçüm varsa onu kullanır (profil kilosunu değil)", () => {
    const config = {
      weight: { entries: { "2026-08-01": 80, "2026-08-05": 78.5 } },
      profile: { weightKg: 90 },
    } as AppConfig;
    expect(exerciseWeight(config)).toBe(78.5);
  });

  it("ölçüm yoksa profil kilosuna düşer", () => {
    const config = { profile: { weightKg: 72 } } as AppConfig;
    expect(exerciseWeight(config)).toBe(72);
  });

  it("ölçüm bozuksa profil kilosuna düşer", () => {
    const config = {
      weight: { entries: { "2026-08-05": 0 } },
      profile: { weightKg: 72 },
    } as AppConfig;
    expect(exerciseWeight(config)).toBe(72);
  });

  it("hiçbir yerden pozitif kilo gelmezse null döner", () => {
    expect(exerciseWeight({} as AppConfig)).toBeNull();
    expect(exerciseWeight({ profile: {} } as AppConfig)).toBeNull();
  });

  it("bozuk değerler varsayılana düşmez, null döner", () => {
    expect(exerciseWeight({ profile: { weightKg: 0 } } as AppConfig)).toBeNull();
    expect(exerciseWeight({ profile: { weightKg: -70 } } as AppConfig)).toBeNull();
    expect(exerciseWeight({ profile: { weightKg: NaN } } as AppConfig)).toBeNull();
    expect(exerciseWeight({ profile: { weightKg: "70" } } as unknown as AppConfig)).toBeNull();
    expect(exerciseWeight({ profile: null } as unknown as AppConfig)).toBeNull();
    expect(exerciseWeight({ profile: "bozuk" } as unknown as AppConfig)).toBeNull();
  });

  it("ölçüm geçersiz ve profil de yoksa null döner", () => {
    const config = {
      weight: { entries: { "2026-08-05": -5, "2026-08-06": NaN } },
    } as AppConfig;
    expect(exerciseWeight(config)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Kullanıcının egzersiz KATALOĞU — config.exercise.catalog altında `entries`
// (günlük kayıtlar) ile YAN YANA yaşar.
// ---------------------------------------------------------------------------
describe("parseCatalog", () => {
  const ok: CatalogEntry = { id: "ec_1", name: "Masa tenisi", category: "custom", met: 4.3 };

  it("geçersiz girdide boş katalog döner", () => {
    expect(parseCatalog(null)).toEqual([]);
    expect(parseCatalog(undefined)).toEqual([]);
    expect(parseCatalog({})).toEqual([]);
    expect(parseCatalog("bozuk")).toEqual([]);
    expect(parseCatalog({ catalog: "bozuk" })).toEqual([]);
    expect(parseCatalog({ catalog: {} })).toEqual([]);
  });

  it("geçerli satırları temizler", () => {
    expect(parseCatalog({ catalog: [{ ...ok, name: "  Masa tenisi  " }] })).toEqual([ok]);
  });

  it("bozuk satır TÜM listeyi düşürmez", () => {
    const parsed = parseCatalog({
      catalog: [
        null,
        "metin",
        42,
        [1, 2],
        { id: "", name: "Adsız", met: 4 },
        { id: "x", name: "   ", met: 4 },
        { id: "y", met: 4 },
        { id: "z", name: "Met'siz", category: "run" },
        { ...ok, met: 0 },
        { ...ok, met: -3 },
        { ...ok, met: NaN },
        { ...ok, met: "4.3" },
        ok,
      ],
    });
    expect(parsed).toEqual([ok]);
  });

  it("bilinmeyen kategoriyi 'custom' yapar", () => {
    const parsed = parseCatalog({ catalog: [{ ...ok, category: "uçma" }] });
    expect(parsed[0].category).toBe("custom");
  });

  it("geçerli kategoriyi korur", () => {
    const parsed = parseCatalog({ catalog: [{ ...ok, category: "run" }] });
    expect(parsed[0].category).toBe("run");
  });
});

describe("withCatalog", () => {
  const catalog: CatalogEntry[] = [
    { id: "ec_1", name: "Masa tenisi", category: "custom", met: 4.3 },
  ];

  it("günlük kayıtları (entries) KORUR — katalog yazmak geçmişi silmez", () => {
    const entries = {
      "2026-08-05": [
        {
          id: "ex_1",
          name: "Koşu",
          category: "run" as const,
          durationMinutes: 30,
          caloriesBurned: 336,
        },
      ],
    };
    const config = { exercise: { entries } } as AppConfig;
    const next = withCatalog(config, catalog);

    expect(parseExerciseEntries(next.exercise)["2026-08-05"].map((e) => e.id)).toEqual(["ex_1"]);
    expect(next.exercise.catalog).toEqual(catalog);
  });

  it("girdi config'i mutasyona uğratmaz", () => {
    const config = { exercise: { entries: {} } } as AppConfig;
    const next = withCatalog(config, catalog);
    expect(config.exercise.catalog).toBeUndefined();
    expect(next).not.toBe(config);
    expect(next.exercise).not.toBe(config.exercise);
  });

  it("config.exercise bozuksa yine de yazılır", () => {
    expect(withCatalog({} as AppConfig, catalog).exercise).toEqual({ catalog });
    expect(withCatalog({ exercise: null } as unknown as AppConfig, catalog).exercise).toEqual({
      catalog,
    });
    expect(withCatalog({ exercise: "bozuk" } as unknown as AppConfig, catalog).exercise).toEqual({
      catalog,
    });
  });
});

describe("newCatalogId", () => {
  it("egzersiz id'lerinden ayrı bir alan kullanır ve benzersizdir", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i += 1) ids.add(newCatalogId());
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^ec_\d+_[a-z0-9]{1,6}$/);
  });
});
