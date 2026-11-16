import type { Days } from "./days";
import type { Week } from "./weeks";
import { normalizeTr } from "./aliasFilter";

/** Filter complete weeks without changing their totals or the saved meals. */
export function filterHistoryWeeks(all: Week[], days: Days, query: string): Week[] {
  const term = normalizeTr(query.trim());
  if (!term) return all;
  return all.filter((week) =>
    week.days.some(({ date }) =>
      days[date]?.some(
        (meal) =>
          normalizeTr(meal.label).includes(term) ||
          meal.items?.some((item) => normalizeTr(item.name).includes(term)),
      ),
    ),
  );
}
