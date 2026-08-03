import { Card } from "./Card";
import { computeHealthScore } from "../lib/healthScore";
import type { Nutrition } from "../types";

interface HealthScoreCardProps {
  total: Nutrition;
  goal: Nutrition;
}

export function HealthScoreCard({ total, goal }: HealthScoreCardProps) {
  const { score, message } = computeHealthScore(total, goal);

  const barColor = score < 4 ? "bg-danger" : score < 7 ? "bg-warn" : "bg-accent";

  return (
    <Card className="p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink-secondary">Sağlık skoru</span>
        <span className="text-lg font-extrabold text-white">{score}/10</span>
      </div>

      <div className="mt-2.5 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${score * 10}%` }}
        />
      </div>

      <p className="mt-2 text-sm text-ink-secondary leading-relaxed">{message}</p>
    </Card>
  );
}
