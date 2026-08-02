import { CalorieRing } from "./CalorieRing";
import { ringState } from "../lib/ring";
import { formatNumber } from "../lib/format";

interface HeroCalorieCardProps {
  consumed: number;
  target: number;
}

export function HeroCalorieCard({ consumed, target }: HeroCalorieCardProps) {
  const state = ringState(consumed, target);
  
  const subtitleLabel = state.isOver
    ? "Aşılan kalori"
    : state.isMet
      ? "Hedef tamamlandı"
      : state.hasTarget
        ? "Kalan kalori"
        : "Tüketilen kalori";

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-calBorder bg-calCard p-5 shadow-card backdrop-blur-md">
      {/* Background soft radial glow inside card */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />

      <div className="flex items-center justify-between gap-4">
        {/* Left Side: Calorie Stats */}
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-1">
            <span className="text-base">🔥</span>
            <span>{subtitleLabel}</span>
          </div>

          <div className="font-mono text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            {state.headline}
          </div>

          {state.hasTarget && (
            <div className="mt-2 text-xs font-mono text-ink-secondary flex items-center gap-1">
              <span>{formatNumber(consumed)}</span>
              <span className="text-ink-tertiary">/</span>
              <span className="text-ink-tertiary">{formatNumber(target)} kcal</span>
            </div>
          )}
        </div>

        {/* Right Side: Calorie Ring */}
        <div className="flex-none flex items-center justify-center">
          <CalorieRing consumed={consumed} target={target} size={140} />
        </div>
      </div>
    </div>
  );
}
