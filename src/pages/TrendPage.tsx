// ============================================================================
// Nutrimind — Trend sekmesi.
//
// Besin ve aralık seçicileri KAYITTAN üretilir (`NUTRIENTS`): Faz 2'de eklenecek
// mikro besinler burada tek satır değişiklik olmadan çip olarak belirir.
//
// Faz 8 — hedefin İKİ YÜZÜ (bkz. `TrendGoal`): grafiğe çizilen çizgi haftalık
// ORTALAMA hedeftir (düz kalır), "hedef tutturma" oranı ise her günü KENDİ
// hedefiyle karşılaştırır.
// ============================================================================
import { useMemo, useState } from "react";
import { Card } from "../components/Card";
import { Stat } from "../components/Stat";
import { TrendChart } from "../components/TrendChart";
import { RangePicker } from "../components/RangePicker";
import { WeightTrendCard } from "../components/WeightTrendCard";
import { parseWeightConfig } from "../lib/weight";
import { useData } from "../lib/data";
import { formatNumber } from "../lib/format";
import { effectiveGoal, weeklyAverageGoal } from "../lib/goals";
import { NUTRIENTS, nutrientOf } from "../lib/nutrients";
import type { NutrientDef, NutrientKey } from "../lib/nutrients";
import { buildTrend, formatNutrientValue, trendStats } from "../lib/trend";
import type { TrendRange } from "../lib/trend";
import { formatTargetHitRate } from "../lib/trendFormat";

/** Seçici çipi — App.tsx'teki TabButton'ın küçük kardeşi (aynı aktif durumu). */
function Chip({
  active,
  label,
  onClick,
  dotClass,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-none items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "bg-memory text-memory-ink"
          : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
      }`}
    >
      {dotClass && <span className={`h-1.5 w-1.5 flex-none rounded-full ${dotClass}`} />}
      {label}
    </button>
  );
}

/** Değişim kutusunun tonu. Yön besinin `direction`'ına bağlı: proteinde hedefe
 *  YAKLAŞMAK iyidir, sodyum gibi limit besinlerde DÜŞMEK iyidir. Hedef yoksa
 *  "iyi/kötü" diye bir şey yok — nötr kalır. */
function changeTone(
  def: NutrientDef,
  goal: number | null,
  recent: number | null,
  prev: number | null,
): string {
  if (goal === null || recent === null || prev === null || recent === prev)
    return "text-ink-primary";
  const better =
    def.direction === "limit" ? recent < prev : Math.abs(recent - goal) < Math.abs(prev - goal);
  return better ? "text-accent" : "text-warn";
}

export function TrendPage() {
  const { days, goals, config } = useData();
  const weightConfig = parseWeightConfig(config);
  const [key, setKey] = useState<NutrientKey>("kcal");
  const [range, setRange] = useState<TrendRange>(30);

  const def = nutrientOf(key);
  const trendGoal = useMemo(
    () => ({ of: (date: string) => effectiveGoal(goals, date), line: weeklyAverageGoal(goals) }),
    [goals],
  );
  const series = useMemo(
    () => buildTrend(days, key, range, trendGoal),
    [days, key, range, trendGoal],
  );
  const stats = useMemo(() => trendStats(series, def), [series, def]);

  /** BU BESİNDE günler arasında hedef farkı var mı. Varsa çizgi bir ORTALAMA'dır
   *  ve etiketi bunu söylemek zorunda; yoksa "hedef 2.601" nereden çıktı belli
   *  olmaz. Profil sayısına değil gerçek değerlere bakılıyor: protein iki günde
   *  de aynı olduğu için protein grafiğinde "ort." yazmaz. */
  const goalVaries = useMemo(
    () =>
      series.goal !== null &&
      series.points.some((p) => p.goal !== null && Math.abs(p.goal - series.goal!) > 0.5),
    [series],
  );

  const gaps = series.points.length - series.dataCount;
  const hitRate = formatTargetHitRate(stats);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-ink-primary">Trend</h2>
        <p className="text-sm text-ink-tertiary">
          Kalın çizgi 7 günlük ortalama; asıl yön onda görünür. Kayıt olmayan günler sıfır sayılmaz.
          {goalVaries && " Hedef çizgisi haftalık ortalamadır — gün tipleri kendi hedefleriyle sayılır."}
        </p>
      </div>

      {/* besin seçici — kayıttan üretilir */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {NUTRIENTS.map((n) => (
          <Chip
            key={n.key}
            active={n.key === key}
            label={n.compactLabel ?? n.label}
            dotClass={n.classes.bg}
            onClick={() => setKey(n.key)}
          />
        ))}
      </div>

      {/* aralık seçici */}
      <RangePicker value={range} onChange={setRange} />

      {/* özet kutuları — trendin asıl bilgi değeri burada */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Son 7 gün ort."
          value={stats.recentAvg === null ? "—" : formatNutrientValue(def, stats.recentAvg)}
          hint={stats.recentAvg === null ? "bu aralıkta kayıt yok" : "kayıtlı son 7 gün"}
        />
        <Stat
          label="Önceki 7 güne göre"
          value={
            stats.changePct === null
              ? "—"
              : `${stats.changePct > 0 ? "↑" : stats.changePct < 0 ? "↓" : "→"} %${formatNumber(
                  Math.abs(stats.changePct),
                  0,
                )}`
          }
          hint={
            stats.prevAvg === null
              ? "karşılaştırmak için yeterli geçmiş yok"
              : `önceki: ${formatNutrientValue(def, stats.prevAvg)}`
          }
          valueClassName={changeTone(def, series.goal, stats.recentAvg, stats.prevAvg)}
        />
        {/* dar ekranda 2 sütun sığıyor; üçüncü kutu tek başına yarım kalmasın */}
        <div className="col-span-2 sm:col-span-1">
          <Stat
            label="Hedef tutturma"
            value={hitRate}
            hint={
              series.goal === null
                ? `${def.label} hedefi girilmemiş`
                : stats.ratedDays === 0
                  ? "bu aralıkta kayıtlı gün yok"
                  : `${stats.onTargetDays}/${stats.ratedDays} gün · ${
                      def.direction === "limit" ? "limit içinde" : `hedefin %90'ı+`
                    }${goalVaries ? " · her gün kendi hedefine göre" : ""}`
            }
          />
        </div>
      </div>

      <Card className="p-3 sm:p-4">
        <TrendChart series={series} def={def} goalIsAverage={goalVaries} />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px] text-ink-tertiary">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${def.classes.bg} opacity-50`} />
            günlük
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-[2px] w-4 rounded-full ${def.classes.bg}`} />7 günlük ortalama
          </span>
          <span className="font-mono">
            {series.dataCount}/{series.points.length} günde kayıt
          </span>
        </div>

        {gaps > 0 && series.dataCount >= 2 && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Kayıt olmayan {formatNumber(gaps)} günde çizgi bilinçli olarak kopar — boşluğun üstünden
            çizgi çekmek olmayan bir seyri gerçek gibi gösterirdi.
          </p>
        )}
      </Card>

      <WeightTrendCard entries={weightConfig.entries} range={range} />
    </div>
  );
}
