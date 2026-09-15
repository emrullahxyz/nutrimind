import type { TFunction } from "i18next";
import type { Nutrition } from "../types";
import { formatList } from "./format";

export interface HealthScore {
  score: number; // 0-10 tam sayı
  message: string;
}

/** Besin adı `nutrient.*` anahtarlarından gelir — eskiden burada Türkçe ad
 *  tabloları (`kalori`/`proteinde`…) vardı ve cümle Türkçe eklerle kuruluyordu:
 *  İngilizce arayüzde "Kalori ve protein You're on track." çıkıyordu. */
function nutrientName(key: string, t: TFunction): string {
  return t(`nutrient.${key}`);
}

/** Cümle kurulumu TAMAMEN anahtarlara taşındı; liste bağlacı ("ve"/"and"/"i")
 *  `formatList` içinde `Intl.ListFormat` ile dile göre üretilir. */
export function computeHealthScore(total: Nutrition, goal: Nutrition, t: TFunction): HealthScore {
  if (total.kcal <= 0) {
    return {
      score: 0,
      message: t("healthScore.noRecords"),
    };
  }

  const keys: (keyof Nutrition & ("kcal" | "protein" | "carbs" | "fat"))[] = [
    "kcal",
    "protein",
    "carbs",
    "fat",
  ];
  const activeKeys = keys.filter((k) => (goal[k] ?? 0) > 0);

  if (activeKeys.length === 0) {
    return {
      score: 5,
      message: t("healthScore.noGoal"),
    };
  }

  const subScores: number[] = [];
  const goodKeys: string[] = [];
  const lowKeys: string[] = [];
  const highKeys: string[] = [];

  for (const k of activeKeys) {
    const val = total[k] ?? 0;
    const target = goal[k]!;
    const ratio = val / target;

    if (k === "protein") {
      const diff = ratio > 1 ? 0 : Math.abs(1 - ratio);
      const rawSub = 10 - Math.min(10, diff * 20);
      const sub = Math.max(0, Math.min(10, rawSub));
      subScores.push(sub);

      if (ratio >= 0.7) {
        goodKeys.push(k);
      } else {
        lowKeys.push(k);
      }
    } else {
      const diff = Math.abs(1 - ratio);
      const rawSub = 10 - Math.min(10, diff * 20);
      const sub = Math.max(0, Math.min(10, rawSub));
      subScores.push(sub);

      if (ratio < 0.7) {
        lowKeys.push(k);
      } else if (ratio > 1.15) {
        highKeys.push(k);
      } else {
        goodKeys.push(k);
      }
    }
  }

  const avg = subScores.reduce((a, b) => a + b, 0) / subScores.length;
  const score = Math.max(0, Math.min(10, Math.round(avg)));

  if (goodKeys.length === activeKeys.length) {
    return {
      score,
      message: t("healthScore.perfect"),
    };
  }

  const namesOf = (list: string[]) => formatList(list.map((k) => nutrientName(k, t)));
  const sentences: string[] = [];

  if (goodKeys.length > 0) {
    sentences.push(t("healthScore.onTrackList", { nutrients: namesOf(goodKeys) }));
  }

  if (lowKeys.length > 0 && highKeys.length > 0) {
    sentences.push(
      t("healthScore.underOverList", { low: namesOf(lowKeys), high: namesOf(highKeys) }),
    );
  } else if (lowKeys.length > 0) {
    sentences.push(t("healthScore.underList", { nutrients: namesOf(lowKeys) }));
  } else if (highKeys.length > 0) {
    sentences.push(t("healthScore.overList", { nutrients: namesOf(highKeys) }));
  }

  return {
    score,
    message: sentences.join(" "),
  };
}
