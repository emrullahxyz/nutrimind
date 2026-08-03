import { Flame } from "lucide-react";
import { addDaysISO, todayISO } from "../lib/format";
import { Card } from "./Card";
import type { MealItem } from "../types";

const DAY_LETTERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

interface StreakCardProps {
  days: Record<string, MealItem[]>;
  streak: number;
}

/** Son 7 günün "o gün öğün kaydedildi mi" durumunu gösteren nokta sırası —
 *  CAL AI'nin "day streak" kartındaki hafta şeridiyle aynı ruhta. */
export function StreakCard({ days, streak }: StreakCardProps) {
  const today = todayISO();
  const last7 = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6));

  return (
    <Card className="flex flex-col items-center gap-3 p-5">
      <div className="flex items-center gap-2">
        <Flame className="h-7 w-7 text-accent" />
        <span className="text-3xl font-extrabold text-white">{streak}</span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Gün serisi</span>

      <div className="mt-1 flex gap-2">
        {last7.map((date) => {
          const hasData = (days[date]?.length ?? 0) > 0;
          const isToday = date === today;
          return (
            <div key={date} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold text-ink-tertiary">
                {DAY_LETTERS[(new Date(date).getUTCDay() + 6) % 7]}
              </span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  hasData
                    ? "bg-accent text-accent-ink"
                    : isToday
                      ? "border border-dashed border-white/30 text-ink-faint"
                      : "bg-white/[0.06] text-ink-faint"
                }`}
              >
                {hasData ? "✓" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
