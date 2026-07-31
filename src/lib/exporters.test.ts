import { describe, expect, it, vi } from "vitest";
import {
  escapeCsvCell,
  exportAliasesToCsv,
  exportBackupToJson,
  exportMealsToCsv,
  executeRestore,
  formatCsvNumber,
  validateBackup,
} from "./exporters";
import type { Alias, GoalConfig, MealItem } from "../types";
import type { AppData } from "./api";
import { NUTRIENTS } from "./nutrients";
import * as api from "./api";

// Mock API functions for batch restore testing
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    saveGoals: vi.fn().mockResolvedValue({ ok: true }),
    saveDay: vi.fn().mockResolvedValue({ ok: true }),
    deleteDay: vi.fn().mockResolvedValue({ ok: true }),
    saveAlias: vi.fn().mockResolvedValue({ ok: true, id: "mock_id" }),
    deleteAlias: vi.fn().mockResolvedValue({ ok: true, id: "mock_id" }),
  };
});

const mockGoals: GoalConfig = {
  version: 2,
  profiles: [
    {
      id: "default",
      name: "Varsayılan",
      nutrition: { kcal: 2500, protein: 150, carbs: 300, fat: 70, fiber: 30 },
    },
  ],
  defaultProfileId: "default",
  weekday: {},
  overrides: {},
};

const mockMeals: MealItem[] = [
  {
    id: "2026-07-31_0",
    label: "Köfte ve Salata",
    computed: {
      kcal: 450,
      protein: 35.5,
      carbs: 12,
      fat: 20,
      fiber: 4,
      sodium: 400, // micro nutrient present
      // sugar & satFat are undefined (unknown)
    },
  },
];

const mockAliases: Alias[] = [
  {
    id: "yogurt",
    triggers: ["yoğurt", "taze yoğurt"],
    name: "Süzme Yoğurt",
    brand: "Sütaş",
    serving_g: 100,
    nutrition: {
      kcal: 60,
      protein: 10,
      carbs: 4,
      fat: 0,
      fiber: 0,
      // sugar, satFat, sodium undefined
    },
  },
];

const mockAppData: AppData = {
  goals: mockGoals,
  days: {
    "2026-07-31": mockMeals,
  },
  aliases: mockAliases,
};

describe("exporters — CSV & JSON", () => {
  it("formatCsvNumber tr-TR ondalık ayırıcı (virgül) kullanır", () => {
    expect(formatCsvNumber(12.5, 1)).toBe("12,5");
    expect(formatCsvNumber(500, 0)).toBe("500");
    expect(formatCsvNumber(0, 1)).toBe("0");
  });

  it("escapeCsvCell noktalı virgül, tırnak ve satır sonlarını doğru tırnak içine alır", () => {
    expect(escapeCsvCell("Normal")).toBe("Normal");
    expect(escapeCsvCell("A;B")).toBe('"A;B"');
    expect(escapeCsvCell('Tavuk "Special"')).toBe('"Tavuk ""Special"""');
    expect(escapeCsvCell("Satır1\nSatır2")).toBe('"Satır1\nSatır2"');
  });

  it("CSV dışa aktarma UTF-8 BOM (\\uFEFF) ile başlar", () => {
    const mealsCsv = exportMealsToCsv(mockAppData);
    const aliasCsv = exportAliasesToCsv(mockAppData.aliases);

    expect(mealsCsv.startsWith("\uFEFF")).toBe(true);
    expect(aliasCsv.startsWith("\uFEFF")).toBe(true);
  });

  it("CSV sütun başlıkları besin kaydından (NUTRIENTS) dinamik türetilir", () => {
    const mealsCsv = exportMealsToCsv(mockAppData);
    const lines = mealsCsv.split("\r\n");
    const headerRow = lines[0].replace("\uFEFF", "");

    for (const def of NUTRIENTS) {
      expect(headerRow).toContain(def.label);
    }
  });

  it("girilmemiş mikro besin hücreleri CSV'de BOŞ bırakılır (0 yazılmaz)", () => {
    const mealsCsv = exportMealsToCsv(mockAppData);
    const lines = mealsCsv.split("\r\n");
    const dataRow = lines[1];
    const cells = dataRow.split(";");

    // sugar (şeker) ve satFat (doymuş yağ) undefined olarak verilmişti
    // NUTRIENTS sırasına göre sodyum 400 olmalı, şeker ve doymuş yağ boş string olmalı
    const sugarIndex = NUTRIENTS.findIndex((n) => n.key === "sugar") + 2; // +2 for Tarih, Öğün Adı
    const satFatIndex = NUTRIENTS.findIndex((n) => n.key === "satFat") + 2;
    const sodiumIndex = NUTRIENTS.findIndex((n) => n.key === "sodium") + 2;

    expect(cells[sugarIndex]).toBe("");
    expect(cells[satFatIndex]).toBe("");
    expect(cells[sodiumIndex]).toBe("400");
  });

  it("JSON yedeği tam tur (export → validate) kayıpsız veri üretir", () => {
    const jsonStr = exportBackupToJson(mockAppData);
    const parsed = JSON.parse(jsonStr);

    const validation = validateBackup(parsed);
    expect(validation.ok).toBe(true);

    if (validation.ok) {
      expect(validation.daysCount).toBe(1);
      expect(validation.mealsCount).toBe(1);
      expect(validation.aliasesCount).toBe(1);
      expect(validation.days["2026-07-31"][0].name).toBe("Köfte ve Salata");
      expect(validation.aliases[0].id).toBe("yogurt");
    }
  });

  it("bozuk veya eksik JSON yedeğini anlaşılır Türkçe hatayla reddeder", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup("gecersiz json string").ok).toBe(false);
    expect(validateBackup({}).ok).toBe(false);

    // Eksik alan
    expect(validateBackup({ goals: mockGoals }).ok).toBe(false);

    // Bozuk öğün verisi
    const badDays = {
      "2026-07-31": [{ name: "", nutrition: null }],
    };
    const badRes = validateBackup({ goals: mockGoals, days: badDays, aliases: [] });
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) {
      expect(badRes.error).toContain("adı eksik");
    }
  });

  it("executeRestore batch yazma yapar ve refresh() fonksiyonunu en sonda TEK bir kez çağırır", async () => {
    const validation = validateBackup(JSON.parse(exportBackupToJson(mockAppData)));
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    const progressFn = vi.fn();

    // Mevcut veride farklı bir gün ve farklı bir alias olsun ki delete tetiklensin
    const currentData: AppData = {
      goals: mockGoals,
      days: {
        "2026-07-01": [{ id: "old", label: "Eski", computed: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 } }],
      },
      aliases: [{ id: "old_alias", triggers: ["eski"], name: "Eski Alias", brand: null, serving_g: 100, nutrition: { kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: 1 } }],
    };

    await executeRestore(validation, currentData, mockRefresh, progressFn);

    // saveGoals 1 kez çağrıldı
    expect(api.saveGoals).toHaveBeenCalledTimes(1);

    // deleteDay eski gün için 1 kez çağrıldı
    expect(api.deleteDay).toHaveBeenCalledWith("2026-07-01");

    // saveDay yeni gün için 1 kez çağrıldı
    expect(api.saveDay).toHaveBeenCalledWith("2026-07-31", expect.any(Array));

    // deleteAlias eski alias için 1 kez çağrıldı
    expect(api.deleteAlias).toHaveBeenCalledWith("old_alias");

    // saveAlias yeni alias için 1 kez çağrıldı
    expect(api.saveAlias).toHaveBeenCalledWith(expect.objectContaining({ id: "yogurt" }));

    // refresh en sonda TEK bir kez çağrıldı!
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    // İlerleme bildirimi çağrıldı
    expect(progressFn).toHaveBeenCalled();
  });
});
