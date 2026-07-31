import { DayView } from "../components/DayView";
import { formatLongDate, todayISO } from "../lib/format";

export function DailyPage() {
  const date = todayISO();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-ink-primary">Bugün</h2>
        <p className="text-sm text-ink-tertiary">{formatLongDate(date)}</p>
      </div>

      <DayView date={date} emptyLabel="Bugün henüz bir şey yok." />
    </div>
  );
}
