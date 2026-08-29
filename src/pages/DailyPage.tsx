import { useState } from "react";
import { DayView } from "../components/DayView";
import { WeekStrip } from "../components/WeekStrip";
import { formatLongDate, todayISO } from "../lib/format";
import { useData } from "../lib/data";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { useTranslation } from "react-i18next";

interface DailyPageProps {
  triggerAddMeal?: boolean;
  onResetTriggerAddMeal?: () => void;
  triggerScan?: boolean;
  onResetTriggerScan?: () => void;
  triggerExercise?: boolean;
  onResetTriggerExercise?: () => void;
  resetKey?: number;
  onOpenSupplementSettings?: () => void;
}

export function DailyPage({
  triggerAddMeal,
  onResetTriggerAddMeal,
  triggerScan,
  onResetTriggerScan,
  triggerExercise,
  onResetTriggerExercise,
  resetKey = 0,
  onOpenSupplementSettings,
}: DailyPageProps = {}) {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const { refresh } = useData();
  const { pulling, distance, refreshing } = usePullToRefresh(refresh);

  return (
    <div className="flex flex-col gap-4">
      {(pulling || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-xs text-ink-tertiary transition-[height]"
          style={{ height: refreshing ? 32 : Math.min(distance, 48) }}
        >
          {refreshing ? t("common.loading") : t("common.releaseToRefresh")}
        </div>
      )}
      <WeekStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <p className="text-sm font-semibold text-ink-secondary">{formatLongDate(selectedDate)}</p>

      <DayView
        date={selectedDate}
        emptyLabel={t("empty.dayView")}
        showWeightCard={false}
        onOpenSupplementSettings={onOpenSupplementSettings}
        triggerAddMeal={triggerAddMeal}
        onResetTriggerAddMeal={onResetTriggerAddMeal}
        triggerScan={triggerScan}
        onResetTriggerScan={onResetTriggerScan}
        triggerExercise={triggerExercise}
        onResetTriggerExercise={onResetTriggerExercise}
        resetKey={resetKey}
      />
    </div>
  );
}
