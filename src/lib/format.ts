// ============================================================================
// Number/date formatting helpers — locale-aware (i18n.language), matches hifi
// mockup style (mono numbers, "%96" confidence, "3g önce" relative dates, etc.)
// ============================================================================

import i18n from "../i18n/i18n";

/** Aktif arayüz dili; i18n yüklenmediyse varsayılan olarak "en" (fallback). */
function activeLocale(): string {
  return i18n.resolvedLanguage || i18n.language || "en";
}

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(activeLocale(), {
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

/** Girilmemiş (`undefined`) bir mikro besin değeri "0g"/"0mg" gibi UYDURMA bir
 *  sayı olarak DEĞİL, "—" ("bilinmiyor") olarak gösterilmeli — projenin
 *  çekirdek kuralı ("Bilinmiyor ≠ sıfır"). Açıkça girilen `0` ise gerçek bir
 *  veridir, "—" göstermez. `NutritionSheet`'in Doymuş Yağ/Sodyum/Şeker
 *  satırları bunu kullanır (bkz. `MicroCardGrid`'in `isUndefined` deseni —
 *  aynı kuralın başka bir gösterimi). */
export function formatMicroOrDash(value: number | undefined, unit: string): string {
  return value !== undefined ? `${value}${unit}` : "—";
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
  return d.toLocaleDateString(activeLocale(), { weekday: "long", day: "numeric", month: "long" });
}

export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(activeLocale(), { day: "numeric", month: "short" });
}

/** Gün adları 0=Pazar…6=Cumartesi. Intl ile aktif locale'e göre üretilir;
 *  Pazar-bazlı diziyi korumak için Pazar günü (2026-01-04) referans alınır. */
function weekdaysShortFor(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(2026, 0, 4 + i)); // 2026-01-04 = Pazar
    out.push(fmt.format(d));
  }
  return out;
}

export const WEEKDAY_SHORT = weekdaysShortFor(activeLocale());

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

/** "bugün" / "dün" / "3g önce" / "22 Tem" — locale-aware. */
export function formatRelativeDay(iso: string): string {
  const dateOnly = iso.slice(0, 10);
  const today = todayISO();
  const locale = activeLocale();
  if (dateOnly === today) return i18n.t("relative.today");
  if (dateOnly === addDaysISO(today, -1)) return i18n.t("relative.yesterday");
  const diffMs = new Date(`${today}T00:00:00`).getTime() - new Date(`${dateOnly}T00:00:00`).getTime();
  const days = Math.round(diffMs / 86_400_000);
  if (days > 0 && days < 14) return i18n.t("relative.daysAgo", { count: days });
  return formatShortDate(dateOnly);
}

function greetingForHour(hour: number): string {
  if (hour < 6) return i18n.t("relative.goodNight");
  if (hour < 12) return i18n.t("relative.goodMorning");
  if (hour < 18) return i18n.t("relative.goodDay");
  return i18n.t("relative.goodEvening");
}

export function currentGreeting(): string {
  return greetingForHour(new Date().getHours());
}
