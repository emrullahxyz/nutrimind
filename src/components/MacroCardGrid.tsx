import { useState } from "react";
import { formatNumber } from "../lib/format";
import type { Nutrition } from "../types";

interface MacroItem {
  key: keyof Nutrition;
  label: string;
  sublabel: string;
  emoji: string;
  color: string;
  consumed: number;
  target: number;
}

function SmallDonut({ pct, color, emoji }: { pct: number; color: string; emoji: string }) {
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
      <span className="absolute inset-0 flex items-center justify-center text-base">
        {emoji}
      </span>
    </div>
  );
}

export function MacroCardGrid({ total, goal }: { total: Nutrition; goal: Nutrition }) {
  const [toggledKeys, setToggledKeys] = useState<Record<string, boolean>>({});

  const toggleKey = (key: string) => {
    setToggledKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const items: MacroItem[] = [
    {
      key: "protein",
      label: "Protein",
      sublabel: goal.protein > 0 ? "Kalan Protein" : "Protein",
      emoji: "🥩",
      color: "#FF6B8A",
      consumed: total.protein,
      target: goal.protein,
    },
    {
      key: "carbs",
      label: "Karb",
      sublabel: goal.carbs > 0 ? "Kalan Karb" : "Karbonhidrat",
      emoji: "🌾",
      color: "#FFB84D",
      consumed: total.carbs,
      target: goal.carbs,
    },
    {
      key: "fat",
      label: "Yağ",
      sublabel: goal.fat > 0 ? "Kalan Yağ" : "Yağ",
      emoji: "🫐",
      color: "#5B8DEF",
      consumed: total.fat,
      target: goal.fat,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {items.map((item) => {
        const isToggled = !!toggledKeys[item.key];
        const remaining = Math.max(0, item.target - item.consumed);
        const pct = item.target > 0 ? item.consumed / item.target : 0;

        let displayVal: string;
        let subText: string;

        if (isToggled) {
          displayVal = item.target > 0 
            ? `${formatNumber(item.consumed, 0)}/${formatNumber(item.target, 0)}g`
            : `${formatNumber(item.consumed, 0)}g`;
          subText = "Alınan / Hedef";
        } else {
          displayVal = `${formatNumber(item.target > 0 ? remaining : item.consumed, 0)}g`;
          subText = item.sublabel;
        }

        return (
          <div
            key={item.key}
            onClick={() => toggleKey(item.key)}
            className="flex flex-col justify-between rounded-[20px] border border-calBorder bg-calCard p-3 sm:p-4 min-h-[130px] shadow-card backdrop-blur-sm transition-all duration-200 hover:border-white/20 cursor-pointer select-none active:scale-[0.98]"
            title="Tıklayarak görünümü değiştir"
          >
            <div>
              <div className="font-mono text-base sm:text-lg font-extrabold text-white leading-tight transition-all">
                {displayVal}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-ink-secondary truncate">
                {subText}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end">
              <SmallDonut pct={pct} color={item.color} emoji={item.emoji} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

