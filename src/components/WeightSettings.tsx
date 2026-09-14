import { useMemo, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useData } from "../lib/data";
import { formatNumber, formatRelativeDay, formatShortDate, todayISO } from "../lib/format";
import {
  latestEntry,
  parseBodyStats,
  parseWeightConfig,
  sortedEntries,
  weightDelta,
  weightProgress,
} from "../lib/weight";
import type { TrendRange } from "../lib/trend";
import { Card } from "./Card";
import { RangePicker } from "./RangePicker";
import { WeightCard } from "./WeightCard";
import { WeightTrendCard } from "./WeightTrendCard";
import { useToast } from "./Toast";
import { haptic } from "../lib/haptics";
import { sectionLabelCls } from "./FormBits";

/**
 * Ayarlar > Kilo & Vücut Geçmişi.
 *
 * ⚠️ Bu ekran eskiden gerçek veriye bağlı DEĞİLDİ: "Mevcut Kilo" profil formunun
 * (localStorage) değerini, "Hedef Kilo" üç dilde sabit yazılmış `"75 kg"`
 * metnini, ilerleme çubuğu da sabit `w-3/4` sınıfını gösteriyordu ve geçmiş
 * listesi hiç yoktu — "Geçmişi" adlı ekran geçmişi okumuyordu. Bu yüzden
 * kullanıcı aylar önce girilmiş bir kiloyu "mevcut" olarak görüyordu.
 *
 * Şimdi gösterilen HER sayı `config.weight.entries`'ten türetilir; hedef kilo
 * ise sihirbazın 2. adımında sorulan `config.profile.targetWeightKg`'dir
 * (daha önce hiçbir yerde okunmayan ölü alan). Uydurma değer yoktur: veri
 * yoksa "—" ve dürüst bir açıklama gösterilir.
 */
export function WeightSettings({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const { t } = useTranslation();
  const { config, updateConfig } = useData();
  const { showToast } = useToast();

  const entries = parseWeightConfig(config).entries;
  const { weightKg: profileWeightKg, targetWeightKg } = parseBodyStats(config);

  const [range, setRange] = useState<TrendRange>(30);
  const [deleting, setDeleting] = useState<string | null>(null);

  const today = todayISO();
  /** Yeni → eski. `sortedEntries` artan verir; liste en son ölçümü üstte tutar. */
  const history = useMemo(() => sortedEntries(entries).reverse(), [entries]);
  const latest = useMemo(() => latestEntry(entries), [entries]);
  const progress = useMemo(
    () => weightProgress(entries, targetWeightKg),
    [entries, targetWeightKg],
  );

  /** Mevcut kilo: son ölçüm → (hiç ölçüm yoksa) profildeki kilo. İkisi de yoksa
   *  `null` ve ekran "—" gösterir; hiçbir aşamada literal bir kilo yazılmaz. */
  const currentKg = latest?.kg ?? profileWeightKg;

  const remaining = progress !== null ? progress.remainingKg : 0;
  /** Hedefe gelindi mi — yön duyarlı: kilo verirken `current <= target`, kilo
   *  alırken `current >= target`. `hold` (hedef yok / başlangıç = hedef) asla
   *  "ulaşıldı" sayılmaz. */
  const reached =
    progress !== null &&
    (progress.direction === "loss"
      ? progress.remainingKg <= 0
      : progress.direction === "gain"
        ? progress.remainingKg >= 0
        : false);

  async function sil(date: string) {
    if (deleting !== null) return;
    setDeleting(date);
    try {
      const nextEntries = { ...entries };
      delete nextEntries[date];
      await updateConfig("weight", { entries: nextEntries });
      haptic("light");
      showToast(t("settings.weightDeleted"), "success");
    } catch (e) {
      showToast(t("settings.weightDeleteError", { message: (e as Error).message }), "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 1. ÖZET — mevcut, hedef, gerçek ilerleme */}
      <Card className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-bold text-ink-secondary">
            {t("settings.currentWeight")}
          </span>
          <div className="text-right">
            <span className="font-mono text-base font-extrabold text-ink-primary">
              {currentKg === null ? "—" : `${formatNumber(currentKg, 1)} kg`}
            </span>
            <p className="text-[11px] text-ink-tertiary">
              {latest
                ? `${t("settings.weightLastMeasured")} ${formatRelativeDay(latest.date)}`
                : t("settings.weightNoMeasurement")}
            </p>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-line-faint pt-3">
          <span className="text-xs font-bold text-ink-secondary">{t("settings.targetWeight")}</span>
          <div className="text-right">
            <span className="font-mono text-base font-extrabold text-accent">
              {targetWeightKg === null ? "—" : `${formatNumber(targetWeightKg, 1)} kg`}
            </span>
            {targetWeightKg === null && onOpenProfile && (
              <button
                type="button"
                onClick={() => {
                  haptic("light");
                  onOpenProfile();
                }}
                className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-accent transition hover:text-accent/80"
              >
                {t("settings.targetFromProfile")}
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* İlerleme çubuğu YALNIZCA anlamlıysa çizilir: hedef yoksa, yol
            başlamamışsa (tek ölçüm) ya da başlangıç hedefe eşitse `pct` null'dır
            ve sahte bir yüzde göstermek yerine açıklama satırı gelir. */}
        {progress !== null && progress.pct !== null ? (
          <div className="flex flex-col gap-1.5 border-t border-line-faint pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`${sectionLabelCls} text-[10px]`}>
                {t("settings.weightPct", { pct: Math.round(progress.pct * 100) })}
              </span>
              <span className="font-mono text-[11px] text-ink-tertiary">
                {reached
                  ? t("settings.weightReached")
                  : t("settings.weightRemaining", { kg: formatNumber(Math.abs(remaining), 1) })}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={Math.round(progress.pct * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("settings.weightPct", { pct: Math.round(progress.pct * 100) })}
            >
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progress.pct * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-ink-faint">
              {t("settings.weightStartHint", {
                date: formatShortDate(progress.start.date),
                kg: formatNumber(progress.start.kg, 1),
              })}
            </p>
          </div>
        ) : (
          <p className="border-t border-line-faint pt-3 text-[11px] leading-relaxed text-ink-tertiary">
            {history.length === 0
              ? t("settings.weightProgressNoData")
              : t("settings.weightProgressNeedsTarget")}
          </p>
        )}
      </Card>

      {/* 2. BUGÜNKÜ ÖLÇÜM — yazma yolu WeightCard'ın kendisi (tek kaynak) */}
      <div className="flex flex-col gap-1.5">
        <h4 className={`${sectionLabelCls} px-1`}>{t("settings.weightTodayLabel")}</h4>
        <WeightCard date={today} />
      </div>

      {/* 3. TREND — aralık seçici + mevcut grafik (veri yoksa kendini gizler) */}
      {history.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className={`${sectionLabelCls} px-1`}>{t("settings.weightChartLabel")}</h4>
          <RangePicker value={range} onChange={setRange} />
          <WeightTrendCard entries={entries} range={range} />
        </div>
      )}

      {/* 4. ÖLÇÜM GEÇMİŞİ — yanlış/eski bir kaydı tek tek silme yolu */}
      <div className="flex flex-col gap-1.5">
        <h4 className={`${sectionLabelCls} px-1`}>
          {t("settings.weightHistoryTitle", { count: history.length })}
        </h4>
        <Card className="divide-y divide-line-faint overflow-hidden">
          {history.length === 0 ? (
            <p className="p-3 text-[11px] leading-relaxed text-ink-tertiary">
              {t("settings.weightHistoryEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-faint">
              {history.map((row) => {
                const delta = weightDelta(entries, row.date);
                return (
                  <li
                    key={row.date}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ink-primary">
                        {formatShortDate(row.date)}
                      </div>
                      <div className="text-[11px] text-ink-tertiary">
                        {formatRelativeDay(row.date)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-ink-primary">
                        {formatNumber(row.kg, 1)} kg
                      </span>
                      <span
                        className={`w-14 text-right font-mono text-[11px] ${
                          delta === null
                            ? "text-ink-faint"
                            : delta > 0
                              ? "text-warn"
                              : delta < 0
                                ? "text-accent"
                                : "text-ink-tertiary"
                        }`}
                      >
                        {delta === null
                          ? "—"
                          : delta > 0
                            ? `▲${formatNumber(delta, 1)}`
                            : delta < 0
                              ? `▼${formatNumber(Math.abs(delta), 1)}`
                              : "0,0"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void sil(row.date)}
                        disabled={deleting !== null}
                        aria-label={t("settings.weightDeleteLabel", {
                          date: formatShortDate(row.date),
                        })}
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-rose-500/15 hover:text-rose-400 active:scale-90 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
