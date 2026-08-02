import { useState } from "react";
import { DayView } from "../components/DayView";
import { WeekStrip } from "../components/WeekStrip";
import { formatLongDate, todayISO } from "../lib/format";

interface DailyPageProps {
  triggerAddMeal?: boolean;
  onResetTriggerAddMeal?: () => void;
  triggerScan?: boolean;
  onResetTriggerScan?: () => void;
}

export function DailyPage({
  triggerAddMeal,
  onResetTriggerAddMeal,
  triggerScan,
  onResetTriggerScan,
}: DailyPageProps = {}) {
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());

  return (
    <div className="flex flex-col gap-4">
      <WeekStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <p className="text-sm font-semibold text-ink-secondary">{formatLongDate(selectedDate)}</p>

      <DayView
        date={selectedDate}
        emptyLabel="Bu gün henüz bir şey yok."
        enableScan
        triggerAddMeal={triggerAddMeal}
        onResetTriggerAddMeal={onResetTriggerAddMeal}
        triggerScan={triggerScan}
        onResetTriggerScan={onResetTriggerScan}
      />
    </div>
  );
}
