import { Sprout, Candy, Droplets } from "lucide-react";
import type { ComponentType } from "react";
import { formatNumber } from "../lib/format";
import { nutrientOf } from "../lib/nutrients";
import type { Nutrition } from "../types";

function SmallDonut({ pct, color, icon: Icon }: { pct: number; color: string; icon: ComponentType<{ className?: string }> }) {
  const size = 52;
  const stroke = 5;
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
}

export function MicroCardGrid({ total, goal }: MicroCardGridProps) {
  const items = [
    {
      def: nutrientOf("fiber"),
      val: total.fiber,
      goalVal: goal.fiber ?? 0,
      icon: Sprout,
      isUndefined: false,
    },
    {
      def: nutrientOf("sugar"),
      val: total.sugar,
      goalVal: goal.sugar ?? 0,
      icon: Candy,
      isUndefined: total.sugar === undefined,
    },
    {
      def: nutrientOf("sodium"),
      val: total.sodium,
      goalVal: goal.sodium ?? 0,
      icon: Droplets,
      isUndefined: total.sodium === undefined,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {items.map(({ def, val, goalVal, icon, isUndefined }) => {
        const consumed = val ?? 0;
        const pct = !isUndefined && goalVal > 0 ? consumed / goalVal : 0;
        const displayVal = isUndefined ? "—" : `${formatNumber(consumed, 0)}${def.unit}`;

        return (
          <div
            key={def.key}
            className="flex flex-col justify-between rounded-card border border-calBorder bg-calCard p-3 sm:p-4 min-h-[130px] shadow-card backdrop-blur-sm transition-all duration-200 select-none"
          >
            <div>
              <div
                className={`text-xl sm:text-2xl font-extrabold leading-tight transition-all ${
                  isUndefined ? "text-ink-tertiary" : "text-white"
                }`}
              >
                {displayVal}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-ink-secondary truncate">
                {def.label}
              </div>
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
