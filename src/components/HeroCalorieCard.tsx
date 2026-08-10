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

  const consumedStr = formatNumber(animConsumed);
  const textSizeClass =
    displayBigVal.length > 11
      ? "text-xl sm:text-2xl font-extrabold"
      : displayBigVal.length > 7
        ? "text-2xl sm:text-3xl font-black"
        : "text-3xl sm:text-4xl font-black";

  // "Tüketilen / Hedef" modunda tüketilen büyük ve vurgulu, hedef küçük ve soluk.
  const consumedBigClass =
    consumedStr.length > 6
      ? "text-xl sm:text-2xl font-extrabold"
      : consumedStr.length > 4
        ? "text-2xl sm:text-3xl font-black"
        : "text-3xl sm:text-4xl font-black";

  const subtextNode = state.hasTarget ? (
    <div className="mt-1.5 flex items-center flex-wrap gap-2 text-xs font-mono text-[#A5A2B8]">
      {showRatio ? (
        <span className="text-[#A5A2B8] hover:text-white font-medium transition-colors">Kalanı göster →</span>
      ) : (
        <>
          <span>{formatNumber(animConsumed)}</span>
          <span className="text-[#A5A2B8]/40">/</span>
          <span className="text-[#A5A2B8]/60">{formatNumber(animTarget)} kcal</span>
        </>
      )}

      {burnedKcal > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-protein/10 text-protein border border-protein/20 text-[10px] font-bold">
          🔥 +{burnedKcal} yakıldı
        </span>
      )}
    </div>
  ) : null;

  return (
    <div
      onClick={onToggleRatio}
      className="relative overflow-hidden rounded-[24px] bg-[#22202E] p-5 shadow-card backdrop-blur-md cursor-pointer select-none transition-all duration-200 hover:bg-[#282637] active:scale-[0.99] flex items-center justify-between gap-3 h-[180px] sm:h-[188px] group"
      title="Tıklayarak Tüketilen/Kalan görünümünü değiştir"
    >
      {/* Left Column: Title, Compact Number, Subtext, Exercise Button */}
      <div className="flex flex-col justify-center min-w-0 flex-1">
        <DirectionalTextSwap
          mode={mode}
          layout="label-first"
          label={
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#A5A2B8] mb-1.5">
              <Flame className="h-4 w-4 text-carb" />
              <span>{subtitleLabel}</span>
            </div>
          }
          value={
            <div className="flex items-baseline gap-1.5 flex-wrap text-white tracking-tight tabular-nums leading-none">
              {showRatio && state.hasTarget ? (
                <>
                  <span className={consumedBigClass}>{formatNumber(animConsumed)}</span>
                  <span className="text-[12px] sm:text-sm font-semibold text-[#A5A2B8] font-mono whitespace-nowrap">
                    <span style={{ marginRight: 3 }}>/</span>
                    {formatNumber(animTarget)} kcal
                  </span>
                </>
              ) : (
                <>
                  <span className={textSizeClass}>{displayBigVal}</span>
                  <span className="text-[11px] font-semibold text-[#A5A2B8] font-mono whitespace-nowrap">kcal</span>
                </>
              )}
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#2A283A] hover:bg-[#343248] text-xs font-bold text-white transition active:scale-95"
            >
              <Dumbbell className="w-3.5 h-3.5 text-carb" />
              <span>Egzersiz Ekle</span>
            </button>
          </div>
        )}
      </div>

      {/* Right Column: Ring scaled to match full hero height (136px) */}
      <div className="flex-none flex items-center justify-center">
        <CalorieRing consumed={consumed} target={adjustedTarget} size={120} />
      </div>
    </div>
  );
}
