// ============================================================================
// NutriMind — TDEE & BMR Hesaplama Lib
// Mifflin-St Jeor Formülü ile TDEE ve Makro Önerisi Türetme
// ============================================================================

export type Gender = "male" | "female";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "extra_active";

export type PrimaryGoal = "weight_loss" | "maintenance" | "weight_gain";

export interface UserProfileInput {
  name: string;
  gender: Gender;
  age: number;
  weightKg: number;
  heightCm: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  primaryGoal: PrimaryGoal;
}

export interface TDEECalculationResult {
  bmr: number;
  tdee: number;
  recommendedKcal: number;
  recommendedProtein: number;
  recommendedCarbs: number;
  recommendedFat: number;
  recommendedFiber: number;
}

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, { title: string; desc: string; icon: string; multiplier: number }> = {
  sedentary: {
    title: "Masa Başı / Hareketsiz",
    desc: "Masa başı iş veya okul, az/hiç egzersiz yok",
    icon: "🛋️",
    multiplier: 1.2,
  },
  light: {
    title: "Hafif Aktif",
    desc: "Haftada 1-3 gün hafif tempolu egzersiz veya yürüyüş",
    icon: "🚶",
    multiplier: 1.375,
  },
  moderate: {
    title: "Orta Aktif",
    desc: "Haftada 3-5 gün düzenli antrenman veya orta fiziksel aktivite",
    icon: "🏃",
    multiplier: 1.55,
  },
  active: {
    title: "Çok Aktif",
    desc: "Haftada 6-7 gün ağır spor veya yüksek fiziksel tempolu iş",
    icon: "🏋️",
    multiplier: 1.725,
  },
  extra_active: {
    title: "Aşırı Aktif / Atletik",
    desc: "Günde 2 kez ağır antrenman veya profesyonel sporcu temposu",
    icon: "⚡",
    multiplier: 1.9,
  },
};

export const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, { title: string; desc: string; icon: string; kcalOffset: number }> = {
  weight_loss: {
    title: "Kilo Ver & Yağ Yak",
    desc: "Güvenli ve kalıcı yağ yakımı için 500 kcal kalori açığı",
    icon: "📉",
    kcalOffset: -500,
  },
  maintenance: {
    title: "Kilo Koru & Formda Kal",
    desc: "Mevcut kilonu korumak ve formunu dengelemek için",
    icon: "⚖️",
    kcalOffset: 0,
  },
  weight_gain: {
    title: "Kilo Al & Kas Yap",
    desc: "Kas kütlesi kazanımı ve hacimlenmek için 350 kcal fazlalık",
    icon: "📈",
    kcalOffset: 350,
  },
};

/**
 * Mifflin-St Jeor Formülü ile BMR & TDEE Hesaplar
 */
export function calculateTDEE(input: UserProfileInput): TDEECalculationResult {
  const { gender, age, weightKg, heightCm, activityLevel, primaryGoal } = input;

  // BMR (Mifflin-St Jeor)
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") {
    bmr += 5;
  } else {
    bmr -= 161;
  }
  bmr = Math.round(bmr);

  // TDEE
  const actMultiplier = ACTIVITY_LEVEL_LABELS[activityLevel]?.multiplier ?? 1.375;
  const tdee = Math.round(bmr * actMultiplier);

  // Recommended Kcal
  const goalOffset = PRIMARY_GOAL_LABELS[primaryGoal]?.kcalOffset ?? 0;
  const minKcal = gender === "male" ? 1400 : 1200;
  const recommendedKcal = Math.max(minKcal, Math.round(tdee + goalOffset));

  // Recommended Protein (Yaklaşık 2.0g per kg body weight)
  const proteinPerKg = primaryGoal === "weight_loss" ? 2.1 : primaryGoal === "weight_gain" ? 2.0 : 1.8;
  const recommendedProtein = Math.max(60, Math.round(weightKg * proteinPerKg));

  // Recommended Fat (Yaklaşık 0.9g per kg body weight)
  const recommendedFat = Math.max(40, Math.round(weightKg * 0.9));

  // Recommended Carbs (Kalan kaloriler karbonhidrata)
  const proteinKcal = recommendedProtein * 4;
  const fatKcal = recommendedFat * 9;
  const remainingKcal = Math.max(200, recommendedKcal - (proteinKcal + fatKcal));
  const recommendedCarbs = Math.max(50, Math.round(remainingKcal / 4));

  // Recommended Fiber (14g per 1000 kcal)
  const recommendedFiber = Math.max(25, Math.min(45, Math.round((recommendedKcal / 1000) * 14)));

  return {
    bmr,
    tdee,
    recommendedKcal,
    recommendedProtein,
    recommendedCarbs,
    recommendedFat,
    recommendedFiber,
  };
}
