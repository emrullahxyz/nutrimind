// ============================================================================
// Number/date formatting helpers — tr-TR locale, matches hifi mockup style
// (mono numbers, "%96" confidence, "3g önce" relative dates, etc.)
// ============================================================================

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatKcal(value: number): string {
  return `${formatNumber(value)} kcal`;
}

export function formatGrams(value: number, digits = 0): string {
  return `${formatNumber(value, digits)}g`;
}

/** ratio 0..1 -> "%96" */
export function formatPercent(ratio: number): string {
  return `%${Math.round(ratio * 100)}`;
}

export function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysISO(iso: string, delta: number): string {
  // Saf tarih aritmetiği (UTC) — yerel-ayrıştır + UTC-serialize kaymasını önler.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export const WEEKDAY_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** Haftanın günü: 0=Pazar … 6=Cumartesi.
 *  `addDaysISO` ile AYNI sözleşme (saf tarih, UTC) — gün-tipli hedeflerin
 *  haftalık şablonu ile tarih aritmetiği aynı takvimi görmek zorunda. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayShort(iso: string): string {
  return WEEKDAY_SHORT[weekdayIndex(iso)] ?? "";
}

/** "bugün" / "dün" / "3g önce" / "22 Tem" */
export function formatRelativeDay(iso: string): string {
  const dateOnly = iso.slice(0, 10);
  const today = todayISO();
  if (dateOnly === today) return "bugün";
  if (dateOnly === addDaysISO(today, -1)) return "dün";
  const diffMs = new Date(`${today}T00:00:00`).getTime() - new Date(`${dateOnly}T00:00:00`).getTime();
  const days = Math.round(diffMs / 86_400_000);
  if (days > 0 && days < 14) return `${days}g önce`;
  return formatShortDate(dateOnly);
}

function greetingForHour(hour: number): string {
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

export function currentGreeting(): string {
  return greetingForHour(new Date().getHours());
}
