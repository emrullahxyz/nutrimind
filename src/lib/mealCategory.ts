import type { MealCategory } from "../types";

export const MEAL_CATEGORIES: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];

// NOT: sabit bir `MEAL_CATEGORY_LABELS` tablosu vardı ve TÜRKÇE metin taşıyordu —
// hiçbir yerden okunmuyordu (ölü kod). Görünen adlar `meal.category*` i18n
// anahtarlarından gelir (bkz. DayView'daki CATEGORY_LABEL_KEY).

/** Saat (0-23) -> otomatik kategori. 05-10 Kahvaltı, 11-14 Öğle, 15-20 Akşam,
 *  21-04 Atıştırmalık. */
export function categoryForHour(hour: number): MealCategory {
  if (hour >= 5 && hour <= 10) return "breakfast";
  if (hour >= 11 && hour <= 14) return "lunch";
  if (hour >= 15 && hour <= 20) return "dinner";
  return "snack";
}

export function categoryForLoggedAt(loggedAt: string): MealCategory {
  return categoryForHour(new Date(loggedAt).getHours());
}

/** meals'ı kategoriye göre gruplar, SIRAYLA Kahvaltı→Öğle→Akşam→Atıştırmalık→Diğer.
 *  `category` alanı olmayan öğünler "Diğer"e düşer (TAHMİN YAPILMAZ). Her öğe
 *  orijinal düz-dizi `index`'ini TAŞIR — DayView'daki seçim/birleştirme mantığı
 *  bu index'e göre çalışıyor, ASLA yeniden numaralandırma. Boş gruplar dizide
 *  hiç yer almaz. */
export function groupMealsByCategory<T extends { category?: MealCategory }>(
  meals: T[],
): { category: MealCategory | "other"; items: { meal: T; index: number }[] }[] {
  const order: (MealCategory | "other")[] = ["breakfast", "lunch", "dinner", "snack", "other"];
  const buckets: Record<MealCategory | "other", { meal: T; index: number }[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
    other: [],
  };
  meals.forEach((meal, index) => {
    const key = meal.category ?? "other";
    buckets[key].push({ meal, index });
  });
  return order
    .filter((k) => buckets[k].length > 0)
    .map((category) => ({ category, items: buckets[category] }));
}
