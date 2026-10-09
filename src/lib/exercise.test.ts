import { describe, expect, it } from "vitest";
import {
  parseExerciseConfig,
  EMPTY_EXERCISE_CONFIG,
  EXERCISE_CONFIG_KEY,
  exercisesFor,
  parseExerciseEntries,
  withExercises,
  burnedKcalFor,
} from "./exercise";
import type { ExerciseEntries } from "./exercise";
import type { Exercise } from "../types";

describe("parseExerciseConfig", () => {
  it("geçersiz/boş veri tipleri için boş konfigürasyon döner", () => {
    expect(parseExerciseConfig(null)).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig(undefined)).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig(123)).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig("invalid")).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig([])).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig({})).toEqual(EMPTY_EXERCISE_CONFIG);
  });

  it("exercises alanı dizi olmadığında (string, sayı, obje) boş döner", () => {
    expect(parseExerciseConfig({ exercises: "not-an-array" })).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig({ exercises: 123 })).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig({ exercises: {} })).toEqual(EMPTY_EXERCISE_CONFIG);
    expect(parseExerciseConfig({ exercises: null })).toEqual(EMPTY_EXERCISE_CONFIG);
  });

  it("dizi içindeki obje olmayan öğeleri atlar", () => {
    const raw = {
      exercises: [null, undefined, 42, "str", [1, 2]],
    };
    expect(parseExerciseConfig(raw)).toEqual(EMPTY_EXERCISE_CONFIG);
  });

  it("eksik veya boş id/name olan öğeleri atlar", () => {
    const raw = {
      exercises: [
        { id: "", name: "Koşu", category: "run", durationMinutes: 30, caloriesBurned: 200 },
        { id: "ex1", name: "  ", category: "run", durationMinutes: 30, caloriesBurned: 200 },
        { name: "Koşu", category: "run", durationMinutes: 30, caloriesBurned: 200 },
        { id: "ex2", category: "run", durationMinutes: 30, caloriesBurned: 200 },
      ],
    };
    expect(parseExerciseConfig(raw)).toEqual(EMPTY_EXERCISE_CONFIG);
  });

  it("geçersiz durationMinutes (<=0, negatif, NaN, Infinity, non-number) öğeleri atlar", () => {
    const raw = {
      exercises: [
        { id: "e1", name: "Koşu", category: "run", durationMinutes: 0, caloriesBurned: 100 },
        { id: "e2", name: "Koşu", category: "run", durationMinutes: -15, caloriesBurned: 100 },
        { id: "e3", name: "Koşu", category: "run", durationMinutes: NaN, caloriesBurned: 100 },
        { id: "e4", name: "Koşu", category: "run", durationMinutes: Infinity, caloriesBurned: 100 },
        { id: "e5", name: "Koşu", category: "run", durationMinutes: "30", caloriesBurned: 100 },
      ],
    };
    expect(parseExerciseConfig(raw)).toEqual(EMPTY_EXERCISE_CONFIG);
  });

  it("geçersiz caloriesBurned (<0, negatif, NaN, Infinity, non-number) öğeleri atlar", () => {
    const raw = {
      exercises: [
        { id: "e1", name: "Koşu", category: "run", durationMinutes: 30, caloriesBurned: -50 },
        { id: "e2", name: "Koşu", category: "run", durationMinutes: 30, caloriesBurned: NaN },
        { id: "e3", name: "Koşu", category: "run", durationMinutes: 30, caloriesBurned: Infinity },
        { id: "e4", name: "Koşu", category: "run", durationMinutes: 30, caloriesBurned: "200" },
      ],
    };
    expect(parseExerciseConfig(raw)).toEqual(EMPTY_EXERCISE_CONFIG);
  });

  it("0 kalori yakılan geçerli egzersizi kabul eder", () => {
    const raw = {
      exercises: [
        { id: "ex_zero", name: "Esneme", category: "custom", durationMinutes: 15, caloriesBurned: 0 },
      ],
    };
    expect(parseExerciseConfig(raw)).toEqual({
      exercises: [
        { id: "ex_zero", name: "Esneme", category: "custom", durationMinutes: 15, caloriesBurned: 0 },
      ],
    });
  });

  it("bilinmeyen kategoriyi 'custom' olarak ayarlar", () => {
    const raw = {
      exercises: [
        { id: "ex_1", name: "Uçma", category: "unknown_category", durationMinutes: 20, caloriesBurned: 150 },
      ],
    };
    expect(parseExerciseConfig(raw)).toEqual({
      exercises: [
        { id: "ex_1", name: "Uçma", category: "custom", durationMinutes: 20, caloriesBurned: 150 },
      ],
    });
  });

  it("tamamen geçerli veriyi eksiksiz ve temiz şekilde ayrıştırır", () => {
    const raw = {
      exercises: [
        {
          id: "ex_100",
          name: "Tempolu Yürüyüş",
          category: "walk",
          durationMinutes: 45,
          caloriesBurned: 180,
          loggedAt: "14:30",
        },
        {
          id: "ex_101",
          name: "Ağırlık",
          category: "weights",
          durationMinutes: 60,
          caloriesBurned: 350,
        },
      ],
    };
    expect(parseExerciseConfig(raw)).toEqual({
      exercises: [
        {
          id: "ex_100",
          name: "Tempolu Yürüyüş",
          category: "walk",
          durationMinutes: 45,
          caloriesBurned: 180,
          loggedAt: "14:30",
        },
        {
          id: "ex_101",
          name: "Ağırlık",
          category: "weights",
          durationMinutes: 60,
          caloriesBurned: 350,
        },
      ],
    });
  });
});

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
