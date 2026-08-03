import type { Nutrition } from "../types";

export interface HealthScore {
  score: number; // 0-10 tam sayı
  message: string;
}

function getPlainName(key: string): string {
  switch (key) {
    case "kcal":
      return "kalori";
    case "protein":
      return "protein";
    case "carbs":
      return "karbonhidrat";
    case "fat":
      return "yağ";
    default:
      return key;
  }
}

function getLocativeName(key: string): string {
  switch (key) {
    case "kcal":
      return "kaloride";
    case "protein":
      return "proteinde";
    case "carbs":
      return "karbonhidratta";
    case "fat":
      return "yağda";
    default:
      return key;
  }
}

function formatPlainList(keys: string[]): string {
  if (keys.length === 0) return "";
  if (keys.length === 1) return getPlainName(keys[0]);
  const head = keys.slice(0, -1).map(getPlainName).join(", ");
  const tail = getPlainName(keys[keys.length - 1]);
  return `${head} ve ${tail}`;
}

function formatLocativeList(keys: string[]): string {
  if (keys.length === 0) return "";
  if (keys.length === 1) return getLocativeName(keys[0]);
  const head = keys.slice(0, -1).map(getPlainName).join(", ");
  const tail = getLocativeName(keys[keys.length - 1]);
  return `${head} ve ${tail}`;
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function computeHealthScore(total: Nutrition, goal: Nutrition): HealthScore {
  if (total.kcal <= 0) {
    return {
      score: 0,
      message: "Bugün için henüz kayıt yok. Öğün ekleyince skorun burada görünecek.",
    };
  }

  const keys: (keyof Nutrition & ("kcal" | "protein" | "carbs" | "fat"))[] = ["kcal", "protein", "carbs", "fat"];
  const activeKeys = keys.filter((k) => (goal[k] ?? 0) > 0);

  if (activeKeys.length === 0) {
    return {
      score: 5,
      message: "Hedef belirlenmemiş.",
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
      message: "Bugün tüm makrolar hedefinde, harika gidiyor!",
    };
  }

  const sentences: string[] = [];

  if (goodKeys.length > 0) {
    sentences.push(`${capitalize(formatPlainList(goodKeys))} yolunda.`);
  }

  if (lowKeys.length > 0 && highKeys.length > 0) {
    sentences.push(`${capitalize(formatLocativeList(lowKeys))} düşüksün; ${formatLocativeList(highKeys)} yükseksin.`);
  } else if (lowKeys.length > 0) {
    sentences.push(`${capitalize(formatLocativeList(lowKeys))} düşüksün.`);
  } else if (highKeys.length > 0) {
    sentences.push(`${capitalize(formatLocativeList(highKeys))} yükseksin.`);
  }

  return {
    score,
    message: sentences.join(" "),
  };
}
