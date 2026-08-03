import { Flame } from "lucide-react";
import { CalorieRing } from "./CalorieRing";
import { ringState } from "../lib/ring";
import { formatNumber } from "../lib/format";
import { SlideValue } from "./SlideValue";

interface HeroCalorieCardProps {
  consumed: number;
  target: number;
  showRatio: boolean;
  onToggleRatio: () => void;
}

export function HeroCalorieCard({ consumed, target, showRatio, onToggleRatio }: HeroCalorieCardProps) {
  const state = ringState(consumed, target);
  
  const subtitleLabel = showRatio
    ? "Tüketilen / Hedef"
    : state.isOver
      ? "Aşılan kalori"
      : state.isMet
        ? "Hedef tamamlandı"
        : state.hasTarget
          ? "Kalan kalori"
          : "Tüketilen kalori";

  const displayBigVal = showRatio
    ? state.hasTarget
      ? `${formatNumber(consumed)} / ${formatNumber(target)}`
      : `${formatNumber(consumed)}`
    : state.headline;

  return (
    <div
      onClick={onToggleRatio}
      className="relative overflow-hidden rounded-card border border-calBorder bg-calCard p-5 shadow-card backdrop-blur-md cursor-pointer select-none transition-all duration-200 hover:border-white/20 active:scale-[0.99] min-h-[176px] flex flex-col justify-center"
      title="Tıklayarak tüm değerleri dönüştür"
    >
      {/* Arka plan yumuşak ışık efekti */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />

      <div className="flex items-center justify-between gap-4">
        {/* Sol Taraf: Kalori İstatistikleri */}
        <div key={`${showRatio}-${displayBigVal}`} className="anim-slide-up flex flex-col justify-center min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-1">
            <Flame className="h-4 w-4 text-accent" />
            <span>{subtitleLabel}</span>
          </div>

          <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            {displayBigVal}
          </div>

          {state.hasTarget && (
            <div className="mt-2 text-xs font-mono text-ink-secondary flex items-center gap-1">
              {showRatio ? (
                <span className="text-accent font-semibold">Tıklayarak Kalan Kaloriyi Göster</span>
              ) : (
                <>
                  <span>{formatNumber(consumed)}</span>
                  <span className="text-ink-tertiary">/</span>
                  <span className="text-ink-tertiary">{formatNumber(target)} kcal</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sağ Taraf: Kalori Halkası */}
        <div key={`ring-${showRatio}`} className="anim-ring-pulse flex-none flex items-center justify-center">
          <CalorieRing consumed={consumed} target={target} size={140} />
        </div>
      </div>
    </div>
  );
}
