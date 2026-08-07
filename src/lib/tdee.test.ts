import { describe, it, expect } from "vitest";
import { calculateTDEE, type UserProfileInput } from "./tdee";

describe("calculateTDEE", () => {
  it("calculates BMR and TDEE correctly for males", () => {
    const input: UserProfileInput = {
      name: "Ahmet Yılmaz",
      gender: "male",
      age: 28,
      weightKg: 80,
      heightCm: 180,
      targetWeightKg: 75,
      activityLevel: "moderate", // multiplier 1.55
      primaryGoal: "weight_loss", // offset -500
    };

    const res = calculateTDEE(input);
    // BMR = (10*80) + (6.25*180) - (5*28) + 5 = 800 + 1125 - 140 + 5 = 1790
    expect(res.bmr).toBe(1790);
    // TDEE = Math.round(1790 * 1.55) = 2775
    expect(res.tdee).toBe(2775);
    // Kcal = 2775 - 500 = 2275
    expect(res.recommendedKcal).toBe(2275);
    // Protein = Math.round(80 * 2.1) = 168
    expect(res.recommendedProtein).toBe(168);
    // Fat = Math.round(80 * 0.9) = 72
    expect(res.recommendedFat).toBe(72);
    // Carbs = Math.round((2275 - (168*4 + 72*9)) / 4) = Math.round((2275 - (672 + 648)) / 4) = Math.round(955/4) = 239
    expect(res.recommendedCarbs).toBe(239);
  });

  it("calculates BMR and TDEE correctly for females", () => {
    const input: UserProfileInput = {
      name: "Ayşe Kaya",
      gender: "female",
      age: 25,
      weightKg: 60,
      heightCm: 165,
      targetWeightKg: 58,
      activityLevel: "light", // multiplier 1.375
      primaryGoal: "maintenance", // offset 0
    };

    const res = calculateTDEE(input);
    // BMR = (10*60) + (6.25*165) - (5*25) - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 -> 1345
    expect(res.bmr).toBe(1345);
    // TDEE = Math.round(1345 * 1.375) = 1849
    expect(res.tdee).toBe(1849);
    expect(res.recommendedKcal).toBe(1849);
  });
});
