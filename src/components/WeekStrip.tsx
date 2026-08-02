import { addDaysISO, todayISO, weekdayIndex, weekdayShort } from "../lib/format";

interface WeekStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

function getMondayISO(iso: string): string {
  const dow = weekdayIndex(iso);
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(iso, offset);
}

export function WeekStrip({ selectedDate, onSelectDate }: WeekStripProps) {
  const today = todayISO();
  const monday = getMondayISO(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));

  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto py-1 no-scrollbar sm:gap-2">
      {days.map((dateIso) => {
        const isSelected = dateIso === selectedDate;
        const isToday = dateIso === today;
        const isPast = dateIso < today;
        const dayNumber = dateIso.slice(8);

        return (
          <button
            key={dateIso}
            type="button"
            onClick={() => onSelectDate(dateIso)}
            className={`flex flex-1 min-w-[44px] max-w-[56px] flex-col items-center justify-center rounded-[18px] py-2 px-1 transition-all duration-200 ${
              isSelected
                ? "bg-white text-black shadow-lg scale-105 font-bold"
                : isToday
                  ? "bg-white/15 text-white border border-white/30 font-semibold"
                  : isPast
                    ? "border border-dashed border-white/20 text-white/80 hover:bg-white/5"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                isSelected ? "text-black/70" : isToday ? "text-white/90" : "text-ink-secondary"
              }`}
            >
              {weekdayShort(dateIso)}
            </span>
            <span
              className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono font-bold ${
                isSelected ? "bg-black text-white" : ""
              }`}
            >
              {dayNumber}
            </span>
          </button>
        );
      })}
    </div>
  );
}
