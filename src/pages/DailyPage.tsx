import { DayView } from "../components/DayView";
import { formatLongDate, todayISO } from "../lib/format";

export function DailyPage() {
  const date = todayISO();

  return (
    <div className="flex flex-col gap-4">
      {/* "Bugün" başlığı yok: aktif sekme zaten öyle diyor. Tarih tek satır
          kalıyor ki öğün listesi yukarıda dursun. */}
      <p className="text-sm text-ink-tertiary">{formatLongDate(date)}</p>

      <DayView date={date} emptyLabel="Bugün henüz bir şey yok." />
    </div>
  );
}
