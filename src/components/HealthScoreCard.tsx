import { Activity } from "lucide-react";
import { computeHealthScore } from "../lib/healthScore";
import type { Nutrition } from "../types";
import { useTranslation } from "react-i18next";

interface HealthScoreCardProps {
  total: Nutrition;
  goal: Nutrition;
}

export function HealthScoreCard({ total, goal }: HealthScoreCardProps) {
  const { t } = useTranslation();
  const { score, message } = computeHealthScore(total, goal, t);

  const barColor = score < 4 ? "bg-danger" : score < 7 ? "bg-warn" : "bg-emerald-500";

  return (
    <div className="relative overflow-hidden rounded-card border border-calBorder bg-calCard p-4 sm:p-5 shadow-card backdrop-blur-md h-[184px] sm:h-[188px] flex flex-col justify-between select-none transition-all duration-200">
      {/* Background soft glow */}
      <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />

      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <Activity className="h-4 w-4 text-accent" />
            <span>{t("cards.healthScore")}</span>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {score}
            <span className="text-sm font-semibold text-ink-tertiary">/10</span>
          </div>
        </div>

        <div className="mt-3.5 h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ width: `${score * 10}%` }}
          />
        </div>
      </div>

      <p className="mt-2 text-xs sm:text-sm text-ink-secondary leading-relaxed">{message}</p>
    </div>
  );
}
