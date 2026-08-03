import { Flame, Dumbbell } from "lucide-react";
import { CalorieRing } from "./CalorieRing";
import { ringState } from "../lib/ring";
import { formatNumber } from "../lib/format";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";

interface HeroCalorieCardProps {
  consumed: number;
  target: number;
  burnedKcal?: number;
  showRatio: boolean;
  onToggleRatio: () => void;
  onOpenExercise?: () => void;
}

export function HeroCalorieCard({
  consumed,
  target,
  burnedKcal = 0,
  showRatio,
  onToggleRatio,
  onOpenExercise,
}: HeroCalorieCardProps) {
  const adjustedTarget = target + burnedKcal;
  const state = ringState(consumed, adjustedTarget);

  // Animated numbers
  const animConsumed = useAnimatedNumber(consumed, 700);
  const animTarget = useAnimatedNumber(adjustedTarget, 700);
  const animRemaining = useAnimatedNumber(Math.max(0, adjustedTarget - consumed), 700);
  const animOver = useAnimatedNumber(Math.max(0, consumed - adjustedTarget), 700);

  const subtitleLabel = showRatio
    ? "Tüketilen / Hedef"
    : state.isOver
      ? "Aşılan kalori"
      : state.isMet
        ? "Hedef tamamlandı"
        : state.hasTarget
          ? "Kalan kalori"
          : "Tüketilen kalori";

  const bigNum = showRatio
    ? animConsumed
    : state.isOver
      ? animOver
      : state.hasTarget
        ? animRemaining
        : animConsumed;

  const displayBigVal = showRatio
    ? state.hasTarget
      ? `${formatNumber(animConsumed)} / ${formatNumber(animTarget)}`
      : `${formatNumber(animConsumed)}`
    : `${formatNumber(bigNum)}`;

  return (
    <div
      onClick={onToggleRatio}
      className="relative overflow-hidden rounded-card border border-calBorder bg-calCard p-5 shadow-card backdrop-blur-md cursor-pointer select-none transition-all duration-200 hover:border-white/20 active:scale-[0.98] min-h-[176px] flex flex-col justify-center group"
      title="Tıklayarak Tüketilen/Kalan görünümünü değiştir"
    >
      {/* Background glow */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />

      <div className="flex items-center justify-between gap-4">
        {/* Left Stats */}
        <div key={`stats-${showRatio}`} className="anim-spring-fade flex flex-col justify-center min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-1">
            <Flame className="h-4 w-4 text-accent" />
            <span>{subtitleLabel}</span>
          </div>

          <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight tabular-nums">
            {displayBigVal}
          </div>

          {state.hasTarget && (
            <div className="mt-2 text-xs font-mono text-ink-secondary flex items-center flex-wrap gap-2">
              {showRatio ? (
                <span className="text-accent font-semibold">Tıklayarak Kalan Kaloriyi Göster</span>
              ) : (
                <>
                  <span>{formatNumber(animConsumed)}</span>
                  <span className="text-ink-tertiary">/</span>
                  <span className="text-ink-tertiary">{formatNumber(animTarget)} kcal</span>
                </>
              )}

              {burnedKcal > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/30">
                  🔥 +{burnedKcal} yakıldı
                </span>
              )}
            </div>
          )}

          {onOpenExercise && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenExercise();
              }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/80 border border-white/10 w-fit transition-colors"
            >
              <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
              <span>Egzersiz Ekle</span>
            </button>
          )}
        </div>

        {/* Right Ring */}
        <div key={`ring-${showRatio}`} className="anim-ring-pulse flex-none flex items-center justify-center">
          <CalorieRing consumed={consumed} target={adjustedTarget} size={140} />
        </div>
      </div>
    </div>
  );
}
