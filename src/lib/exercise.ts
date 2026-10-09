import type { Exercise, ExerciseCategory } from "../types";

export interface ExerciseConfig {
  exercises: Exercise[];
}

export const EMPTY_EXERCISE_CONFIG: ExerciseConfig = { exercises: [] };

const VALID_CATEGORIES: Set<ExerciseCategory> = new Set([
  "run",
  "weights",
  "walk",
  "swim",
  "cycle",
  "custom",
]);

/** Single exercise item parser with strict defensive checks */
export function parseExerciseItem(raw: unknown): Exercise | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;

  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!id || !name) return null;

  const categoryStr = typeof rec.category === "string" ? rec.category.trim() : "";
  const category: ExerciseCategory = VALID_CATEGORIES.has(categoryStr as ExerciseCategory)
    ? (categoryStr as ExerciseCategory)
    : "custom";

  const durationMinutes = rec.durationMinutes;
  if (
    typeof durationMinutes !== "number" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }

  const caloriesBurned = rec.caloriesBurned;
  if (
    typeof caloriesBurned !== "number" ||
    !Number.isFinite(caloriesBurned) ||
    caloriesBurned < 0
  ) {
    return null;
  }

  const loggedAt =
    typeof rec.loggedAt === "string" && rec.loggedAt.trim().length > 0
      ? rec.loggedAt.trim()
      : undefined;

  return {
    id,
    name,
    category,
    durationMinutes,
    caloriesBurned,
    ...(loggedAt ? { loggedAt } : {}),
  };
}

/**
 * Parses exercise configuration defensively.
 * Accepts raw exercise objects (e.g. `{ exercises: [...] }`), or config entries.
 */
export function parseExerciseConfig(raw: unknown): ExerciseConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return EMPTY_EXERCISE_CONFIG;
  }
  const rec = raw as Record<string, unknown>;
  const rawExercises = rec.exercises;
  if (!Array.isArray(rawExercises)) {
    return EMPTY_EXERCISE_CONFIG;
  }

  const exercises: Exercise[] = [];
  for (const item of rawExercises) {
    const parsed = parseExerciseItem(item);
    if (parsed) {
      exercises.push(parsed);
    }
  }

  return { exercises };
}

// ---------------------------------------------------------------------------
// TEK config anahtarı: `exercise` → `{ entries: { "2026-08-05": Exercise[] } }`
//
// Eskiden gün başına ayrı bir anahtar kullanılıyordu (`exercise_2026-08-05`).
// İKİ sorun vardı:
//   1. `server/index.js`'in CONFIG_KEY_PATTERN'i (`/^[a-z][a-z0-9_]{0,31}$/`)
//      TİRE kabul etmiyor; ISO tarih tire içerdiği için her yazma 400 dönüyordu
//      — yani egzersiz kaydı bugüne kadar HİÇ kalıcı olmadı. (Canlı veritabanında
//      tek bir `exercise_*` satırı yok; bu da bunu doğruluyor.)
//   2. Gün başına anahtar, config blob'unu sonsuza kadar büyütürdü; `GET /api/data`
//      onu her açılışta gönderiyor.
// `weight` özelliği zaten bu `{entries}` desenini kullanıyor — aynısı izlendi.
// Göç gerekmedi: taşınacak veri yoktu.
// ---------------------------------------------------------------------------

/** Backend'in anahtar deseni: `/^[a-z][a-z0-9_]{0,31}$/` — tire YOK. */
export const EXERCISE_CONFIG_KEY = "exercise";

export type ExerciseEntries = Record<string, Exercise[]>;

/** Tüm günleri savunmacı biçimde ayrıştırır; bozuk kayıtlar sessizce düşer. */
export function parseExerciseEntries(raw: unknown): ExerciseEntries {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const rec = (raw as Record<string, unknown>).entries;
  if (typeof rec !== "object" || rec === null || Array.isArray(rec)) return {};

  const out: ExerciseEntries = {};
  for (const [date, list] of Object.entries(rec as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const parsed = list.map(parseExerciseItem).filter((x): x is Exercise => x !== null);
    if (parsed.length > 0) out[date] = parsed;
  }
  return out;
}

export function exercisesFor(entries: ExerciseEntries, date: string): Exercise[] {
  return entries[date] ?? [];
}

/** Bir günün listesini değiştirir. Boş liste = o günü tamamen düşür
 *  (config blob'unda boş dizi biriktirmemek için). Girdi mutasyona uğramaz. */
export function withExercises(
  entries: ExerciseEntries,
  date: string,
  list: Exercise[],
): ExerciseEntries {
  const next = { ...entries };
  if (list.length === 0) delete next[date];
  else next[date] = list;
  return next;
}

/** Tek günün yakılan kalori toplamı. `DayView` ile `ExerciseModal` AYNI
 *  config anahtarını okumak ZORUNDA: eskiden `DayView` eski
 *  `exercise_${date}` anahtarını okuyordu, `ExerciseModal` ise tek
 *  `exercise` anahtarına yazıyordu — göç yarı kalmıştı ve yakılan kalori
 *  hedefe hiç yansımıyordu (burnedKcal daima 0). */
export function burnedKcalFor(rawConfig: unknown, date: string): number {
  return exercisesFor(parseExerciseEntries(rawConfig), date).reduce(
    (acc, ex) => acc + ex.caloriesBurned,
    0,
  );
}
