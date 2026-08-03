import { addDaysISO, todayISO, weekdayShort } from "../lib/format";
import { useData } from "../lib/data";
import { effectiveGoal } from "../lib/goals";
import { dayTotal } from "../lib/days";

interface WeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function WeekStrip({ selectedDate, onSelectDate }: WeekStripProps) {
  const { days, goals } = useData();
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  // En sağda 'Yarın' olacak şekilde 7 günlük şerit
  let endIso = tomorrow;
  if (selectedDate > endIso) {
    endIso = selectedDate;
  } else if (selectedDate < addDaysISO(endIso, -6)) {
    endIso = addDaysISO(selectedDate, 6);
  }

  // 7 gün: en solda geçmiş günler, en sağda Yarın (endIso)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(endIso, i - 6));

  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto py-1 no-scrollbar sm:gap-2">
      {weekDays.map((dateIso) => {
        const isSelected = dateIso === selectedDate;
        const isToday = dateIso === today;
        const dayNumber = dateIso.slice(8);

        const dayGoalKcal = effectiveGoal(goals, dateIso).kcal;
        const total = dayTotal(days, dateIso);
        const hasData = total.kcal > 0;
        const isExceeded = hasData && dayGoalKcal > 0 && total.kcal > dayGoalKcal;
        const isWithinGoal = hasData && dayGoalKcal > 0 && total.kcal <= dayGoalKcal;

        // Dairesel çerçeve stilleri:
        // - Boş günler: kesik çizgi (dashed)
        // - Dolu/Kayıtlı günler: yumuşak tonlu düz çizgi (solid)
        let circleStyle = "border border-dashed border-white/20 text-white/50 bg-transparent";
        if (isExceeded) {
          circleStyle = "border border-solid border-rose-500/60 text-rose-400 bg-rose-500/10";
        } else if (isWithinGoal) {
          circleStyle = "border border-solid border-emerald-500/60 text-emerald-400 bg-emerald-500/10";
        }

        if (isSelected) {
          if (isExceeded) {
            circleStyle = "bg-black border border-solid border-rose-500/80 text-rose-400";
          } else if (isWithinGoal) {
            circleStyle = "bg-black border border-solid border-emerald-500/80 text-emerald-400";
          } else {
            circleStyle = "bg-black border border-dashed border-black/30 text-white";
          }
        }

        return (
          <button
            key={dateIso}
            type="button"
            onClick={() => onSelectDate(dateIso)}
            className={`flex flex-1 min-w-[44px] max-w-[56px] flex-col items-center justify-center rounded-[22px] py-2 px-1 transition-all duration-200 ${
              isSelected
                ? "bg-white text-black shadow-lg scale-105 font-bold"
                : isToday
                  ? "bg-white/10 text-white font-semibold"
                  : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wider ${
                isSelected ? "text-black/80" : isToday ? "text-white" : "text-white/50"
              }`}
            >
              {weekdayShort(dateIso)}
            </span>
            <span
              className={`mt-1.5 flex h-8 w-8 items-center justify-center rounded-full text-xs font-mono font-bold transition-all ${circleStyle}`}
            >
              {dayNumber}
            </span>
          </button>
        );
      })}
    </div>
  );
}
