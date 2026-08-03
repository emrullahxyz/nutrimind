import { Flame } from "lucide-react";
import { ringState, ringGradient } from "../lib/ring";
import { useAnimatedValue } from "../lib/useAnimatedValue";
import { formatNumber } from "../lib/format";
import { bigNumCls } from "./FormBits";

interface CalorieRingProps {
  consumed: number;
  target: number;
  size?: number;
}

export function CalorieRing({ consumed, target, size }: CalorieRingProps) {
  const state = ringState(consumed, target);
  const animPct = useAnimatedValue(state.pct, { durationMs: 800, round: "none" });
  // isMet: `headline` tam hedefte "kalan" (~0) değil, tamamlanan tüketimi
  // gösterir (ring.ts'teki headline semantiğiyle birebir) — aksi halde
  // "Hedefe ulaşıldı" yazarken sayı 0 görünürdü.
  const animNum = useAnimatedValue(
    state.isOver ? Math.abs(state.diff) : state.isMet ? consumed : state.hasTarget ? state.diff : consumed,
    { durationMs: 800 },
  );

  const gradient = ringGradient(state.isOver, animPct);

  const displayNum = state.isOver ? `+${formatNumber(animNum)}` : formatNumber(animNum);

  return (
    <div
      role="img"
      aria-label={state.a11yLabel}
      className={
        size
          ? "relative flex items-center justify-center rounded-full shrink-0"
          : "relative mx-auto flex h-[208px] w-[208px] items-center justify-center rounded-full p-[15px] sm:h-[240px] sm:w-[240px] sm:p-[17px]"
      }
      style={{
        background: gradient,
        ...(size ? { width: `${size}px`, height: `${size}px`, padding: `${Math.round(size * 0.07)}px` } : {}),
      }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#13131C]"
        aria-hidden="true"
      >
        {size ? (
          // Küçük/gömülü halka (ör. HeroCalorieCard içinde): sade alev ikonu.
          // Sayı zaten kartın sol tarafında büyük olarak gösteriliyor — halkanın
          // İÇİNDE tekrar göstermek gereksiz tekrar yaratıyordu (kullanıcı geri
          // bildirimi). aria-label yine de TAM bilgiyi taşır, ekran okuyucu
          // kaybı yok — sadece GÖRSEL sadeleşme.
          <Flame size={Math.round(size * 0.32)} className="text-accent" />
        ) : (
          <>
            <span className={`${bigNumCls} text-[44px] leading-none text-ink-primary sm:text-[52px]`}>
              {displayNum}
            </span>
            <span className="mt-1 text-xs text-ink-secondary">{state.caption}</span>
            {state.ratioText && (
              <span className="mt-0.5 font-mono text-[11px] text-ink-faint">{state.ratioText}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
