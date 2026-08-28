import { formatNumber } from "../lib/format";
import type { NutrientDef } from "../lib/nutrients";
import { useAnimatedValue, useAnimatedPct } from "../lib/useAnimatedValue";
import { useValueSpring } from "../hooks/useValueSpring";
import { useTheme } from "../lib/theme";
import { useTranslation } from "react-i18next";

interface MacroBarProps {
  /** Besin kaydındaki tanım — etiket, birim, renk sınıfları ve `direction`. */
  def: NutrientDef;
  value: number;
  target: number;
}

/** Limit besinlerde "sona yaklaşıldı" eşiği: bu orandan sonra kendi rengi değil
 *  warn sarısı görünür. */
const LIMIT_WARN_PCT = 80;

/** Hedef durumu metni.
 *
 *  `target` (protein, karbonhidrat, yağ, lif): hedefe ULAŞILACAK — kalanı sayar,
 *  tam tutunca "✓ Tamamlandı", aşınca uyarır.
 *
 *  `limit` (sodyum, şeker, doymuş yağ): hedef AŞILMAYACAK bir üst sınır. Limite
 *  ulaşmak bir başarı olmadığı için "✓ Tamamlandı" bu dalda HİÇ görünmez —
 *  tam limitte metin "limitte", altında kalan pay, üstünde aşım. */
type StatusFn = (key: string, opts?: { value?: string }) => string;

function statusText(def: NutrientDef, diff: number, isOver: boolean, isMet: boolean, t: StatusFn): string {
  const value = `${formatNumber(Math.abs(diff), def.decimals)}${def.unit}`;
  if (def.direction === "limit") {
    if (isOver) return t("cards.limitExceeded", { value });
    if (isMet) return t("cards.atLimit");
    return t("cards.limitAvailable", { value });
  }
  return isOver
    ? t("cards.targetExceeded", { value })
    : isMet
      ? t("cards.targetMetShort")
      : t("cards.targetRemaining", { value });
}

/** Barın tonu — hangi rengin devraldığı.
 *  `own` = besinin kendi rengi, `warn` = sarı uyarı, `danger` = kırmızı aşım. */
export type BarTone = "own" | "warn" | "danger";

export interface BarState {
  /** Hedef girilmiş mi. Yoksa yüzde de bar da anlamsız (0'a bölme / boş bar). */
  hasTarget: boolean;
  /** Bar dolgusunun yüzdesi (0-100 arası kırpılmış). */
  pct: number;
  isOver: boolean;
  isMet: boolean;
  tone: BarTone;
  status: string;
}

/** Barın tüm karar mantığı — saf, test edilebilir, animasyondan bağımsız.
 *
 *  | | `target` (protein, lif…) | `limit` (sodyum, şeker, doymuş yağ) |
 *  |---|---|---|
 *  | < %80   | kendi rengi, "N g kaldı"  | kendi rengi, "N mg kullanılabilir" |
 *  | %80-100 | kendi rengi               | **warn** sarısı                    |
 *  | = %100  | "✓ Tamamlandı"            | "limitte" — ASLA ✓                 |
 *  | > %100  | danger, "aşıldı"          | danger, "limit aşıldı"             |
 *
 *  `0.05` eşiği bilinçli: 1 ondalıkla gösterilen bir değer 145,04 iken "aşıldı"
 *  demek kullanıcıya ekranda 145,0 / 145,0 gösterirken yalan söylemek olurdu. */
export function barState(def: NutrientDef, value: number, target: number, t?: StatusFn): BarState {
  const hasTarget = target > 0;
  const diff = target - value;
  const isOver = hasTarget && diff < -0.05;
  const isMet = hasTarget && Math.abs(diff) <= 0.05;
  const pct = hasTarget ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;

  const tone: BarTone = isOver
    ? "danger"
    : def.direction === "limit" && hasTarget && pct >= LIMIT_WARN_PCT
      ? "warn"
      : "own";

  // Hedef yokken durum metni de yok: "0 mg kullanılabilir" ya da "aşıldı"
  // demek, konmamış bir limit hakkında hüküm vermek olurdu.
  const status = hasTarget ? statusText(def, diff, isOver, isMet, t ?? ((k) => k)) : "";

  return { hasTarget, pct, isOver, isMet, tone, status };
}


/** Labeled nutrient progress bar (protein/carb/fat/fiber) with count-up number animation & smooth bar fill. */
export function MacroBar({ def, value, target }: MacroBarProps) {
  const { t } = useTranslation();
  const state = barState(def, value, target, t);
  const pct = useAnimatedPct(state.pct);
  const animatedValue = useAnimatedValue(value);
  const { hasTarget, isOver, isMet, tone } = state;
  const c = def.classes;
  const isGlass = useTheme().theme === "glass";
  const springPct = useValueSpring(state.pct, { tweenDurationMs: 0, round: "none" });
  const widthPct = isGlass ? springPct : pct;

  // Limiti girilmemiş bir mikro besinde bar anlamsız: %0 boş bar "hiç yemedin"
  // gibi, dolu kırmızı bar "limiti aştın" gibi okunurdu. Sayı tek başına yazılır.
  // (Kayıtlı `target` besinlerin hedefsiz görünümü bilinçli olarak DEĞİŞMEDİ.)
  if (!hasTarget && def.direction === "limit") {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[13px] font-bold ${c.text}`}>{t(`nutrient.${def.key}`)}</span>
          <span className="font-mono text-xs text-ink-secondary">
            {formatNumber(animatedValue)}
            {def.unit}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-ink-faint">{t("cards.noLimit")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-bold ${c.text}`}>{t(`nutrient.${def.key}`)}</span>
          {hasTarget && (
            <span
              className={`text-xs font-mono ${
                tone === "danger"
                  ? "font-bold text-danger animate-pulse"
                  : tone === "warn"
                    ? "font-bold text-warn"
                    : isMet
                  ? "font-bold text-accent"
                  : `${c.text} opacity-75 font-semibold`
              }`}
            >
              • {state.status}
            </span>
          )}
        </div>
        <span className={`font-mono text-xs ${isOver ? "font-bold text-danger" : "text-ink-secondary"}`}>
          {formatNumber(animatedValue)} / {formatNumber(target)}
          {def.unit}
        </span>
      </div>
      <div className={`h-2 rounded-full ${c.track} overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out spring-bar ${
            tone === "danger"
              ? "bg-danger shadow-[0_0_8px_rgba(255,128,128,0.5)]"
              : tone === "warn"
                ? "bg-warn"
                : c.bg
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
