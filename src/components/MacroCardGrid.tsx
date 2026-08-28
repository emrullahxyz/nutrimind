import { Beef, Wheat, Droplet } from "lucide-react";
import type { ComponentType } from "react";
import { formatNumber } from "../lib/format";
import type { Nutrition } from "../types";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { usePressSpring } from "../hooks/usePressSpring";
import { DirectionalTextSwap, type SwapMode } from "./DirectionalTextSwap";
import { useTranslation } from "react-i18next";

interface MacroItem {
  key: keyof Nutrition;
  sublabel: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  consumed: number;
  target: number;
  unit: string;
}

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
          stroke="var(--svg-well)"
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

function MacroCardItem({
  item,
  showRatio,
  onToggleRatio,
  delayClass = "",
}: {
  item: MacroItem;
  showRatio: boolean;
  onToggleRatio: () => void;
  delayClass?: string;
}) {
  const { t } = useTranslation();
  const remaining = Math.max(0, item.target - item.consumed);
  const pct = item.target > 0 ? item.consumed / item.target : 0;

  // Animate numbers
  const rawDisplay = item.target > 0 ? remaining : item.consumed;
  const animVal = useAnimatedNumber(showRatio ? item.consumed : rawDisplay, 650);
  const animTarget = useAnimatedNumber(item.target, 650);

  const press = usePressSpring({ pressScale: 0.97 });

  const mode: SwapMode = showRatio ? "EATEN" : "LEFT";

  let displayVal: string;
  let subText: string;

  if (showRatio) {
    displayVal = item.target > 0
      ? `${formatNumber(animVal, 0)}/${formatNumber(animTarget, 0)}${item.unit}`
      : `${formatNumber(animVal, 0)}${item.unit}`;
    subText = t("cards.eatenOverTarget");
  } else {
    displayVal = `${formatNumber(animVal, 0)}${item.unit}`;
    subText = item.sublabel;
  }

  const textSizeClass =
    displayVal.length > 7
      ? "text-xs sm:text-sm"
      : displayVal.length > 5
        ? "text-sm sm:text-base"
        : "text-base sm:text-lg";

  return (
    <div
      onClick={onToggleRatio}
      className={`flex flex-col justify-between rounded-[22px] bg-calCard p-3 sm:p-4 min-h-[125px] shadow-card transition-all duration-200 hover:bg-cal-hover cursor-pointer select-none active:scale-[0.98] glass-card anim-glass-rise spring-press ${delayClass}`}
      title={t("cards.toggleAllTitle")}
      {...press.handlers}
      style={press.style}
    >
      <div>
        <DirectionalTextSwap
          mode={mode}
          layout="value-first"
          value={
            <div className="font-black text-white leading-tight tabular-nums tracking-tight truncate flex items-baseline">
              {showRatio && item.target > 0 ? (
                <>
                  <span className="text-lg sm:text-xl">{formatNumber(animVal, 0)}</span>
                  <span className="ml-1.5 text-[10px] sm:text-xs font-bold text-ink-secondary whitespace-nowrap">
                    <span style={{ marginRight: 3 }}>/</span>
                    {formatNumber(animTarget, 0)} {item.unit}
                  </span>
                </>
              ) : (
                <span className={textSizeClass}>{displayVal}</span>
              )}
            </div>
          }
          label={
            <div className="mt-1 text-[11px] sm:text-xs font-semibold text-ink-secondary truncate">
              {subText}
            </div>
          }
          durationMs={300}
        />
      </div>

      <div className="mt-2 flex items-center justify-end">
        <SmallDonut pct={pct} color={item.color} icon={item.icon} />
      </div>
    </div>
  );
}

interface MacroCardGridProps {
  total: Nutrition;
  goal: Nutrition;
  showRatio: boolean;
  onToggleRatio: () => void;
}

export function MacroCardGrid({ total, goal, showRatio, onToggleRatio }: MacroCardGridProps) {
  const { t } = useTranslation();
  const mainMacros: MacroItem[] = [
    {
      key: "protein",
      sublabel: goal.protein > 0 ? t("cards.remainingProtein") : t("cards.protein"),
      icon: Beef,
      color: "var(--svg-protein)",
      consumed: total.protein,
      target: goal.protein,
      unit: "g",
    },
    {
      key: "carbs",
      sublabel: goal.carbs > 0 ? t("cards.remainingCarbs") : t("cards.carbs"),
      icon: Wheat,
      color: "var(--svg-carb)",
      consumed: total.carbs,
      target: goal.carbs,
      unit: "g",
    },
    {
      key: "fat",
      sublabel: goal.fat > 0 ? t("cards.remainingFat") : t("cards.fat"),
      icon: Droplet,
      color: "var(--svg-fat)",
      consumed: total.fat,
      target: goal.fat,
      unit: "g",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {mainMacros.map((item, i) => (
        <MacroCardItem key={item.key} item={item} showRatio={showRatio} onToggleRatio={onToggleRatio} delayClass={["rise-d-140","rise-d-190","rise-d-240"][i]} />
      ))}
    </div>
  );
}

