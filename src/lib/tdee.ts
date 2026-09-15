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

// NOT: eskiden bu iki tabloda `title`/`desc` ALANLARI vardı ve TÜRKÇE metin
// taşıyorlardı — ama hiçbir yerden okunmuyorlardı (ölü kod): sihirbaz görünen
// metni `onboarding.activity.<key>.title` anahtarlarından alıyor. Buradan
// kaldırıldılar ki İngilizce arayüzde sessizce Türkçe görünmesinler.
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, { icon: string; multiplier: number }> = {
  sedentary: { icon: "🛋️", multiplier: 1.2 },
  light: { icon: "🚶", multiplier: 1.375 },
  moderate: { icon: "🏃", multiplier: 1.55 },
  active: { icon: "🏋️", multiplier: 1.725 },
  extra_active: { icon: "⚡", multiplier: 1.9 },
};

export const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, { icon: string; kcalOffset: number }> = {
  weight_loss: { icon: "📉", kcalOffset: -500 },
  maintenance: { icon: "⚖️", kcalOffset: 0 },
  weight_gain: { icon: "📈", kcalOffset: 350 },
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
  const proteinPerKg =
    primaryGoal === "weight_loss" ? 2.1 : primaryGoal === "weight_gain" ? 2.0 : 1.8;
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
