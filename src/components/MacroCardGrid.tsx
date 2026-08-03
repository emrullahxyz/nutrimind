import { useState } from "react";
import { Beef, Wheat, Droplet, Apple, Candy, Droplets, Activity } from "lucide-react";
import type { ComponentType } from "react";
import { formatNumber } from "../lib/format";
import type { Nutrition } from "../types";
import { computeHealthScore } from "../lib/healthScore";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";

interface MacroItem {
  key: keyof Nutrition;
  label: string;
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

function MacroCardItem({
  item,
  showRatio,
  onToggleRatio,
}: {
  item: MacroItem;
  showRatio: boolean;
  onToggleRatio: () => void;
}) {
  const remaining = Math.max(0, item.target - item.consumed);
  const pct = item.target > 0 ? item.consumed / item.target : 0;

  // Animate the number that's being displayed
  const rawDisplay = item.target > 0 ? remaining : item.consumed;
  const animVal = useAnimatedNumber(showRatio ? item.consumed : rawDisplay, 650);
  const animTarget = useAnimatedNumber(item.target, 650);

  let displayVal: string;
  let subText: string;

  if (showRatio) {
    displayVal = item.target > 0
      ? `${formatNumber(animVal, 0)}/${formatNumber(animTarget, 0)}${item.unit}`
      : `${formatNumber(animVal, 0)}${item.unit}`;
    subText = "Alınan / Hedef";
  } else {
    displayVal = `${formatNumber(animVal, 0)}${item.unit}`;
    subText = item.sublabel;
  }

  return (
    <div
      onClick={onToggleRatio}
      className="flex flex-col justify-between rounded-card border border-calBorder bg-calCard p-3 sm:p-4 min-h-[130px] shadow-card backdrop-blur-sm transition-all duration-200 hover:border-white/20 cursor-pointer select-none active:scale-[0.98]"
      title="Tıklayarak tüm değerleri dönütür"
    >
      <div>
        <div className="text-lg sm:text-xl font-black text-white leading-tight tabular-nums">
          {displayVal}
        </div>
        <div className="mt-0.5 text-[11px] font-medium text-ink-secondary truncate">
          {subText}
        </div>
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
  const [slide, setSlide] = useState<0 | 1 | 2>(0);

  const mainMacros: MacroItem[] = [
    {
      key: "protein",
      label: "Protein",
      sublabel: goal.protein > 0 ? "Kalan Protein" : "Protein",
      icon: Beef,
      color: "#FF6B8A",
      consumed: total.protein,
      target: goal.protein,
      unit: "g",
    },
    {
      key: "carbs",
      label: "Karb",
      sublabel: goal.carbs > 0 ? "Kalan Karb" : "Karbonhidrat",
      icon: Wheat,
      color: "#FFB84D",
      consumed: total.carbs,
      target: goal.carbs,
      unit: "g",
    },
    {
      key: "fat",
      label: "Yağ",
      sublabel: goal.fat > 0 ? "Kalan Yağ" : "Yağ",
      icon: Droplet,
      color: "#5B8DEF",
      consumed: total.fat,
      target: goal.fat,
      unit: "g",
    },
  ];

  const microMacros: MacroItem[] = [
    {
      key: "fiber",
      label: "Lif",
      sublabel: goal.fiber > 0 ? "Kalan Lif" : "Lif (Fiber)",
      icon: Apple,
      color: "#A78BFA",
      consumed: total.fiber,
      target: goal.fiber,
      unit: "g",
    },
    {
      key: "sugar",
      label: "Şeker",
      sublabel: "Tüketilen Şeker",
      icon: Candy,
      color: "#EC4899",
      consumed: total.sugar ?? 0,
      target: 50,
      unit: "g",
    },
    {
      key: "sodium",
      label: "Sodyum",
      sublabel: "Tüketilen Sodyum",
      icon: Droplets,
      color: "#38BDF8",
      consumed: total.sodium ?? 0,
      target: 2300,
      unit: "mg",
    },
  ];

  const healthScore = computeHealthScore(total, goal);

  return (
    <div className="space-y-2">
      {/* Slide 0: Primary Macros */}
      {slide === 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 anim-fadeIn">
          {mainMacros.map((item) => (
            <MacroCardItem key={item.key} item={item} showRatio={showRatio} onToggleRatio={onToggleRatio} />
          ))}
        </div>
      )}

      {/* Slide 1: Micro / Secondary Macros */}
      {slide === 1 && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 anim-fadeIn">
          {microMacros.map((item) => (
            <MacroCardItem key={item.key} item={item} showRatio={showRatio} onToggleRatio={onToggleRatio} />
          ))}
        </div>
      )}

      {/* Slide 2: Health Score Card */}
      {slide === 2 && (
        <div className="rounded-card border border-calBorder bg-calCard p-4 shadow-card backdrop-blur-sm anim-fadeIn flex items-center justify-between gap-4 min-h-[130px]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent mb-1">
              <Activity className="w-4 h-4" />
              <span>Günlük Beslenme Skoru</span>
            </div>
            <div className="text-sm font-medium text-white/90 line-clamp-2">{healthScore.message}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-black text-accent">{healthScore.score}<span className="text-xs text-white/40 font-normal">/10</span></div>
            <div className="text-[10px] text-white/40 mt-0.5">Denge Puanı</div>
          </div>
        </div>
      )}

      {/* Carousel Dots */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => setSlide(i as 0 | 1 | 2)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              slide === i ? "w-6 bg-accent" : "w-1.5 bg-white/20 hover:bg-white/40"
            }`}
            title={`Sayfa ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
