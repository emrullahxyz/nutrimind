import { describe, expect, it } from "vitest";
import { calculateStreak } from "./streak";
import { addDaysISO, todayISO } from "./format";

const mealStub = [{ id: "x", label: "y", computed: { kcal: 1, protein: 0, carbs: 0, fat: 0, fiber: 0 } }];

describe("calculateStreak", () => {
  it("hiç kayıt yoksa 0 döner", () => {
    expect(calculateStreak({})).toBe(0);
  });

  it("bugün dahil ardışık günleri sayar", () => {
    const today = todayISO();
    const days = {
      [today]: mealStub,
      [addDaysISO(today, -1)]: mealStub,
      [addDaysISO(today, -2)]: mealStub,
    };
    expect(calculateStreak(days)).toBe(3);
  });

  it("bugün boşsa dünden başlar, seriyi bozmaz", () => {
    const today = todayISO();
    const days = {
      [addDaysISO(today, -1)]: mealStub,
      [addDaysISO(today, -2)]: mealStub,
    };
    expect(calculateStreak(days)).toBe(2);
  });

  it("aradaki boş gün seriyi keser", () => {
    const today = todayISO();
    const days = {
      [today]: mealStub,
      [addDaysISO(today, -2)]: mealStub, // -1 boş
    };
    expect(calculateStreak(days)).toBe(1);
  });

  it("boş öğün dizisi olan gün 'kayıt yok' sayılır", () => {
    const today = todayISO();
    const days = { [today]: [] };
    expect(calculateStreak(days)).toBe(0);
  });
});
