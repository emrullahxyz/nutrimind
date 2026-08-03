import { Sprout, Candy, Droplets } from "lucide-react";
import type { ComponentType } from "react";
import { formatNumber } from "../lib/format";
import { nutrientOf } from "../lib/nutrients";
import type { Nutrition } from "../types";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { DirectionalTextSwap, type SwapMode } from "./DirectionalTextSwap";

function SmallDonut({ pct, color, icon: Icon }: { pct: number; color: string; icon: ComponentType<{ className?: string }> }) {
  const size = 48;
  const stroke = 4.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dashoffset = circ * (1 - Math.min(1, Math.max(0, pct)));

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 transform">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon className="w-4 h-4 text-white" />
      </span>
    </div>
  );
}

interface MicroCardGridProps {
  total: Nutrition;
  goal: Nutrition;
  showRatio: boolean;
  onToggleRatio: () => void;
}

export function MicroCardGrid({ total, goal, showRatio, onToggleRatio }: MicroCardGridProps) {
  const items = [
    {
      def: nutrientOf("fiber"),
      val: total.fiber,
      goalVal: goal.fiber ?? 0,
      sublabel: (goal.fiber ?? 0) > 0 ? "Kalan Lif" : "Lif",
      icon: Sprout,
      isUndefined: false,
    },
    {
      def: nutrientOf("sugar"),
      val: total.sugar,
      goalVal: goal.sugar ?? 0,
      sublabel: (goal.sugar ?? 0) > 0 ? "Kalan Şeker" : "Tüketilen Şeker",
      icon: Candy,
      isUndefined: total.sugar === undefined,
    },
    {
      def: nutrientOf("sodium"),
      val: total.sodium,
      goalVal: goal.sodium ?? 0,
      sublabel: (goal.sodium ?? 0) > 0 ? "Kalan Sodyum" : "Tüketilen Sodyum",
      icon: Droplets,
      isUndefined: total.sodium === undefined,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {items.map(({ def, val, goalVal, sublabel, icon, isUndefined }) => {
        const consumed = val ?? 0;
        const target = goalVal;
        const remaining = Math.max(0, target - consumed);
        const pct = !isUndefined && target > 0 ? consumed / target : 0;

        const rawDisplay = target > 0 ? remaining : consumed;
        const animVal = useAnimatedNumber(showRatio ? consumed : rawDisplay, 650);
        const animTarget = useAnimatedNumber(target, 650);

        const mode: SwapMode = showRatio ? "EATEN" : "LEFT";

        let displayVal: string;
        let subText: string;

        if (isUndefined) {
          displayVal = "—";
          subText = def.label;
        } else if (showRatio) {
          displayVal = target > 0
            ? `${formatNumber(animVal, 0)}/${formatNumber(animTarget, 0)}${def.unit}`
            : `${formatNumber(animVal, 0)}${def.unit}`;
          subText = "Alınan / Hedef";
        } else {
          displayVal = `${formatNumber(animVal, 0)}${def.unit}`;
          subText = sublabel;
        }

        const textSizeClass =
          displayVal.length > 7
            ? "text-xs sm:text-sm"
            : displayVal.length > 5
              ? "text-sm sm:text-base"
              : "text-base sm:text-lg";

        return (
          <div
            key={def.key}
            onClick={onToggleRatio}
            className="flex flex-col justify-between rounded-card border border-calBorder bg-calCard p-2.5 sm:p-4 min-h-[125px] shadow-card backdrop-blur-sm transition-all duration-200 hover:border-white/20 cursor-pointer select-none active:scale-[0.98]"
            title="Tıklayarak tüm değerleri dönüştür"
          >
            <div>
              <DirectionalTextSwap
                mode={mode}
                layout="value-first"
                value={
                  <div
                    className={`${textSizeClass} font-black leading-tight tabular-nums tracking-tight truncate ${
                      isUndefined ? "text-ink-tertiary" : "text-white"
                    }`}
                  >
                    {displayVal}
                  </div>
                }
                label={
                  <div className="mt-0.5 text-[10px] sm:text-[11px] font-medium text-ink-secondary truncate">
                    {subText}
                  </div>
                }
                durationMs={300}
              />
            </div>

            <div className="mt-2 flex items-center justify-end">
              <SmallDonut pct={pct} color={isUndefined ? "rgba(255,255,255,0.08)" : def.hex} icon={icon} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
