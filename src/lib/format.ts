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

/** Gün adları OKUMA ANINDA ve aktif locale'e göre üretilir.
 *
 *  Eskiden `WEEKDAY_SHORT` import anında BİR KEZ hesaplanan bir sabitti: Ayarlar'dan
 *  dil değiştiren kullanıcı takvim adlarını (WeekStrip, TrendChart, ReportView,
 *  WeekBars) sayfa yenilenene kadar eski dilde görüyordu. Önbellek locale
 *  anahtarına bağlı — dil değişirse kendiliğinden tazelenir. */
let cachedWeekdayLocale: string | null = null;
let cachedWeekdays: string[] = [];

export function weekdayShortList(): string[] {
  const locale = activeLocale();
  if (locale !== cachedWeekdayLocale) {
    cachedWeekdays = weekdaysShortFor(locale);
    cachedWeekdayLocale = locale;
  }
  return cachedWeekdays;
}

/** `Intl.ListFormat` ES2022'de geldi; bu proje ES2020 hedefliyor. Bu yüzden
tip düzeyinde değil, ÇALIŞMA ZAMANINDA korumalı erişim yapılır: yoksa
düzgün bir `join(", ")` yeterlidir. */
type ListFormatLike = { format(items: string[]): string };
type ListFormatCtor = new (locale: string, opts: { style: string; type: string }) => ListFormatLike;
const ListFormatCtor: ListFormatCtor | undefined = (
  Intl as unknown as { ListFormat?: ListFormatCtor }
).ListFormat;

/** Diziyi aktif dile göre doğal biçimde birleştirir: TR "Kalori ve protein",
 *  EN "Calories and protein", PL "Kalorie i białko". Elle `" ve "` yazmak
 *  cümleyi dile bağlar (bkz. `healthScore.ts` eski hâli). */
export function formatList(items: string[], locale: string = activeLocale()): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (!ListFormatCtor) return items.join(", ");
  try {
    return new ListFormatCtor(locale, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

/** Haftanın günü: 0=Pazar … 6=Cumartesi.
 *  `addDaysISO` ile AYNI sözleşme (saf tarih, UTC) — gün-tipli hedeflerin
 *  haftalık şablonu ile tarih aritmetiği aynı takvimi görmek zorunda. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayShort(iso: string): string {
  return weekdayShortList()[weekdayIndex(iso)] ?? "";
}

/** "bugün" / "dün" / "3g önce" / "22 Tem" — locale-aware. */
export function formatRelativeDay(iso: string): string {
  const dateOnly = iso.slice(0, 10);
  const today = todayISO();
  const locale = activeLocale();
  if (dateOnly === today) return i18n.t("relative.today");
  if (dateOnly === addDaysISO(today, -1)) return i18n.t("relative.yesterday");
  const diffMs =
    new Date(`${today}T00:00:00`).getTime() - new Date(`${dateOnly}T00:00:00`).getTime();
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
