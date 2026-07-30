import { Card } from "./Card";

/** Küçük istatistik kutusu: etiket + mono değer + isteğe bağlı alt not.
 *  HistoryPage'in hafta özetleri ile TrendPage'in trend özetleri aynı görünümü
 *  paylaşsın diye buraya taşındı (eskiden HistoryPage'e gömülüydü).
 *  `valueClassName` yalnızca değerin rengini değiştirir; varsayılanı eski
 *  görünümle birebir aynıdır. */
export function Stat({
  label,
  value,
  hint,
  valueClassName = "text-ink-primary",
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="flex flex-col gap-0.5 p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className={`font-mono text-lg font-extrabold ${valueClassName}`}>{value}</div>
      {hint && <div className="text-[11px] text-ink-tertiary">{hint}</div>}
    </Card>
  );
}
