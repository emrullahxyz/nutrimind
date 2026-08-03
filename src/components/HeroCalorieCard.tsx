import { Flame, Dumbbell } from "lucide-react";
import { CalorieRing } from "./CalorieRing";
import { ringState } from "../lib/ring";
import { formatNumber } from "../lib/format";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { DirectionalTextSwap, type SwapMode } from "./DirectionalTextSwap";

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

  const animConsumed = useAnimatedNumber(consumed, 700);
  const animTarget = useAnimatedNumber(adjustedTarget, 700);
  const animRemaining = useAnimatedNumber(Math.max(0, adjustedTarget - consumed), 700);
  const animOver = useAnimatedNumber(Math.max(0, consumed - adjustedTarget), 700);

  const mode: SwapMode = showRatio ? "EATEN" : "LEFT";

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

  const subtextNode = state.hasTarget ? (
    <div className="mt-1.5 flex items-center flex-wrap gap-2 text-xs font-mono text-white/60">
      {showRatio ? (
        <span className="text-amber-400 font-bold">Kalanı göster →</span>
      ) : (
        <>
          <span>{formatNumber(animConsumed)}</span>
          <span className="text-white/40">/</span>
          <span className="text-white/40">{formatNumber(animTarget)} kcal</span>
        </>
      )}

      {burnedKcal > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold border border-orange-500/30">
          🔥 +{burnedKcal} yakıldı
        </span>
      )}
    </div>
  ) : null;

  return (
    <div
      onClick={onToggleRatio}
      className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:p-5 shadow-card backdrop-blur-md cursor-pointer select-none transition-all duration-200 hover:border-white/20 active:scale-[0.99] flex items-center justify-between gap-4 h-[180px] sm:h-[188px] group"
      title="Tıklayarak Tüketilen/Kalan görünümünü değiştir"
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl" />

      {/* Left Column: Title, Compact Number, Subtext, Exercise Button */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        <DirectionalTextSwap
          mode={mode}
          layout="label-first"
          label={
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-white/70 mb-1">
              <Flame className="h-4 w-4 text-amber-400 fill-amber-400/20" />
              <span>{subtitleLabel}</span>
            </div>
          }
          value={
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight tabular-nums leading-none">
              {displayBigVal} <span className="text-xs font-bold text-white/50 font-mono">kcal</span>
            </div>
          }
          subtext={subtextNode}
          durationMs={300}
        />

        {onOpenExercise && (
          <div className="mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenExercise();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-white border border-white/15 transition active:scale-95"
            >
              <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
              <span>Egzersiz Ekle</span>
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Ring scaled to match full hero height (136px) */}
      <div className="flex-none flex items-center justify-center">
        <CalorieRing consumed={consumed} target={adjustedTarget} size={136} />
      </div>
    </div>
  );
}
