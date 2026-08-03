import { useRef, useState, type UIEvent } from "react";
import type { Nutrition } from "../types";
import { HeroCalorieCard } from "./HeroCalorieCard";
import { HealthScoreCard } from "./HealthScoreCard";
import { MacroCardGrid } from "./MacroCardGrid";
import { MicroCardGrid } from "./MicroCardGrid";

interface StatCardCarouselProps {
  total: Nutrition;
  goal: Nutrition;
  burnedKcal?: number;
  showRatio: boolean;
  onToggleRatio: () => void;
  onOpenExercise?: () => void;
}

export function StatCardCarousel({
  total,
  goal,
  burnedKcal = 0,
  showRatio,
  onToggleRatio,
  onOpenExercise,
}: StatCardCarouselProps) {
  const [activePage, setActivePage] = useState<0 | 1>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.clientWidth > 0) {
      const page = Math.round(el.scrollLeft / el.clientWidth);
      setActivePage(page === 1 ? 1 : 0);
    }
  }

  function scrollToPage(page: 0 | 1) {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        left: page * scrollRef.current.clientWidth,
        behavior: "smooth",
      });
      setActivePage(page);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Sayfa 1: Kalori Kartı + Makro Kartları */}
        <div className="w-full flex-none snap-center flex flex-col gap-4">
          <HeroCalorieCard
            consumed={total.kcal}
            target={goal.kcal}
            burnedKcal={burnedKcal}
            showRatio={showRatio}
            onToggleRatio={onToggleRatio}
            onOpenExercise={onOpenExercise}
          />
          <MacroCardGrid total={total} goal={goal} showRatio={showRatio} onToggleRatio={onToggleRatio} />
        </div>

        {/* Sayfa 2: Sağlık Skoru Kartı + Mikro Kartları */}
        <div className="w-full flex-none snap-center flex flex-col gap-4">
          <HealthScoreCard total={total} goal={goal} />
          <MicroCardGrid total={total} goal={goal} showRatio={showRatio} onToggleRatio={onToggleRatio} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 py-1">
        <button
          type="button"
          onClick={() => scrollToPage(0)}
          aria-label="Sayfa 1"
          className={`h-1.5 rounded-full transition-all duration-300 ${
            activePage === 0 ? "w-6 bg-accent" : "w-1.5 bg-white/20 hover:bg-white/40"
          }`}
        />
        <button
          type="button"
          onClick={() => scrollToPage(1)}
          aria-label="Sayfa 2"
          className={`h-1.5 rounded-full transition-all duration-300 ${
            activePage === 1 ? "w-6 bg-accent" : "w-1.5 bg-white/20 hover:bg-white/40"
          }`}
        />
      </div>
    </div>
  );
}
