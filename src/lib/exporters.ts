// ============================================================================
// Nutrimind — Faz 9: Dışa Aktarma (Export) / İçe Aktarma (Import) Mantığı.
//
// 1. CSV Dışa Aktarma:
//    - UTF-8 BOM (`\uFEFF`) ile başlatılır (Excel Türkçe/Lehçe karakter uyumu).
//    - Ayırıcı `;` (noktalı virgül).
//    - Sayılar tr-TR biçiminde (ondalık ayırıcı `,`) yazılır.
//    - Sütunlar `NUTRIENTS` besin kaydından dinamik olarak türetilir.
//    - "Bilinmiyor ≠ sıfır": girilmemiş mikro besin hücreleri BOŞ bırakılır.
//
// 2. JSON Yedek:
//    - Tam veri bloğu (`goals`, `days`, `aliases`).
//
// 3. JSON Geri Yükleme (Import):
//    - Tam doğrulama (yarım yazma yok).
//    - Doğrudan `api.ts` fonksiyonları çağrılır, en sonda tek `refresh()` yapılır.
// ============================================================================

import type { Alias, GoalConfig, MealItem, MealPayload, Nutrition } from "../types";
import { NUTRIENTS } from "./nutrients";
import { deleteAlias, deleteDay, parseGoals, saveAlias, saveDay, saveGoals } from "./api";
import type { AppData } from "./api";

const BOM = "\uFEFF";

export function formatCsvNumber(val: number, decimals: number = 1): string {
  if (!Number.isFinite(val)) return "0";
  const rounded = Number(Math.round(Number(val + "e" + decimals)) + "e-" + decimals);
  return String(rounded).replace(".", ",");
}

export function escapeCsvCell(cell: string): string {
  if (cell.includes(";") || cell.includes('"') || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** Günlük öğünleri CSV biçiminde üretir. */
export function exportMealsToCsv(data: AppData): string {
  const headers = ["Tarih", "Öğün Adı", ...NUTRIENTS.map((def) => `${def.label} (${def.unit})`)].join(";");

  const rows: string[] = [headers];
  const datesAsc = Object.keys(data.days).sort();

  for (const date of datesAsc) {
    const meals = data.days[date] ?? [];
    for (const meal of meals) {
      const lineCells: string[] = [date, escapeCsvCell(meal.label)];

      for (const def of NUTRIENTS) {
        const val = meal.computed[def.key];
        if (def.group === "micro" && val === undefined) {
          lineCells.push("");
        } else if (val === undefined) {
          lineCells.push("0");
        } else {
          lineCells.push(formatCsvNumber(val, def.decimals));
        }
      }

      rows.push(lineCells.join(";"));
    }
  }

  return BOM + rows.join("\r\n");
}

/** Besin hafızasını (alias) CSV biçiminde üretir. */
export function exportAliasesToCsv(aliases: Alias[]): string {
  const headers = [
    "Ad",
    "Marka",
    "Porsiyon (g)",
    "Tetikleyiciler",
    "Birimler",
    "Barkod",
    "OFF ID",
    ...NUTRIENTS.map((def) => `${def.label} (${def.unit})`),
  ].join(";");

  const rows: string[] = [headers];

  for (const alias of aliases) {
    const triggersStr = (alias.triggers ?? []).join(", ");
    const unitsStr = alias.units ? alias.units.map((u) => `${u.name}:${u.grams}g`).join(", ") : "";

    const lineCells: string[] = [
      escapeCsvCell(alias.name),
      escapeCsvCell(alias.brand ?? ""),
      formatCsvNumber(alias.serving_g ?? 100, 1),
      escapeCsvCell(triggersStr),
      escapeCsvCell(unitsStr),
      escapeCsvCell(alias.barcode ?? ""),
      escapeCsvCell(alias.off_id ?? ""),
    ];

    for (const def of NUTRIENTS) {
      const val = alias.nutrition[def.key];
      if (def.group === "micro" && val === undefined) {
        lineCells.push("");
      } else if (val === undefined) {
        lineCells.push("0");
      } else {
        lineCells.push(formatCsvNumber(val, def.decimals));
      }
    }

    rows.push(lineCells.join(";"));
  }

  return BOM + rows.join("\r\n");
}

export interface BackupBlob {
  version: number;
  exportedAt: string;
  goals: GoalConfig;
  days: Record<string, MealItem[]>;
  aliases: Alias[];
}

/** Tüm veriyi kapsayan JSON yedeği üretir. */
export function exportBackupToJson(data: AppData): string {
  const blob: BackupBlob = {
    version: 1,
    exportedAt: new Date().toISOString(),
    goals: data.goals,
    days: data.days,
    aliases: data.aliases,
  };
  return JSON.stringify(blob, null, 2);
}

/** İstemci tarafında indirme tetikler. */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ValidationSuccess {
  ok: true;
  goals: GoalConfig;
  days: Record<string, MealPayload[]>;
  aliases: Alias[];
  daysCount: number;
  mealsCount: number;
  aliasesCount: number;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationSuccess | ValidationError;

/** Yüklenen JSON ham verisini eksiksiz doğrular. Yarım kalmış/bozuk veriyi saptar. */
export function validateBackup(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Geçersiz dosya biçimi: JSON nesnesi bekleniyor." };
  }

  const obj = raw as Record<string, unknown>;

  if (!("goals" in obj) || !("days" in obj) || !("aliases" in obj)) {
    return { ok: false, error: "Yedek dosyası eksik alanlar içeriyor (goals, days veya aliases eksik)." };
  }

  // 1. Hedefler doğrulaması
  let goals: GoalConfig;
  try {
    goals = parseGoals(obj.goals);
  } catch (e) {
    return { ok: false, error: `Hedef verisi doğrulanamadı: ${String(e)}` };
  }

  // 2. Günler doğrulaması
  if (typeof obj.days !== "object" || obj.days === null || Array.isArray(obj.days)) {
    return { ok: false, error: "Geçersiz 'days' yapısı: gün sözlüğü bekleniyor." };
  }

  const rawDays = obj.days as Record<string, unknown>;
  const parsedDays: Record<string, MealPayload[]> = {};
  let totalMeals = 0;

  for (const [date, rawMeals] of Object.entries(rawDays)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: `Geçersiz tarih biçimi: '${date}' (YYYY-MM-DD bekleniyor).` };
    }
    if (!Array.isArray(rawMeals)) {
      return { ok: false, error: `'${date}' gününün öğün verisi dizi olmalıdır.` };
    }

    const mealPayloads: MealPayload[] = [];
    for (let i = 0; i < rawMeals.length; i++) {
      const m = rawMeals[i];
      if (typeof m !== "object" || m === null) {
        return { ok: false, error: `'${date}' tarihindeki ${i + 1}. öğün nesne olmalıdır.` };
      }

      const rec = m as Record<string, unknown>;
      const name = typeof rec.name === "string" ? rec.name : typeof rec.label === "string" ? rec.label : "";
      if (!name.trim()) {
        return { ok: false, error: `'${date}' tarihindeki ${i + 1}. öğünün adı eksik.` };
      }

      const rawNutr = (rec.nutrition ?? rec.computed) as Record<string, unknown> | undefined;
      if (typeof rawNutr !== "object" || rawNutr === null) {
        return { ok: false, error: `'${date}' tarihindeki '${name}' öğününün besin değerleri eksik.` };
      }

      const kcal = Number(rawNutr.kcal);
      if (!Number.isFinite(kcal)) {
        return { ok: false, error: `'${date}' tarihindeki '${name}' öğününün kalori değeri geçersiz.` };
      }

      // Besin değerlerini MealPayload biçimine normalize et
      const nutrition: Nutrition = {
        kcal: Number(rawNutr.kcal ?? 0),
        protein: Number(rawNutr.protein ?? 0),
        carbs: Number(rawNutr.carbs ?? 0),
        fat: Number(rawNutr.fat ?? 0),
        fiber: Number(rawNutr.fiber ?? 0),
        ...(rawNutr.sugar !== undefined && rawNutr.sugar !== null ? { sugar: Number(rawNutr.sugar) } : {}),
        ...(rawNutr.satFat !== undefined && rawNutr.satFat !== null ? { satFat: Number(rawNutr.satFat) } : {}),
        ...(rawNutr.sodium !== undefined && rawNutr.sodium !== null ? { sodium: Number(rawNutr.sodium) } : {}),
      };

      mealPayloads.push({
        name: name.trim(),
        nutrition,
        ...(Array.isArray(rec.sources) ? { sources: rec.sources as MealPayload["sources"] } : {}),
      });
      totalMeals++;
    }
    parsedDays[date] = mealPayloads;
  }

  // 3. Besin hafızası (aliases) doğrulaması
  if (!Array.isArray(obj.aliases)) {
    return { ok: false, error: "Geçersiz 'aliases' yapısı: dizi bekleniyor." };
  }

  const parsedAliases: Alias[] = [];
  for (let i = 0; i < obj.aliases.length; i++) {
    const a = obj.aliases[i];
    if (typeof a !== "object" || a === null) {
      return { ok: false, error: `Hafızadaki ${i + 1}. besin nesnesi geçersiz.` };
    }
    const rec = a as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) {
      return { ok: false, error: `Hafızadaki ${i + 1}. besinin adı eksik.` };
    }
    const triggers = Array.isArray(rec.triggers)
      ? rec.triggers.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : [];

    const rawNutr = rec.nutrition as Record<string, unknown> | undefined;
    if (typeof rawNutr !== "object" || rawNutr === null) {
      return { ok: false, error: `Hafızadaki '${name}' besininin besin değerleri eksik.` };
    }

    const nutrition: Nutrition = {
      kcal: Number(rawNutr.kcal ?? 0),
      protein: Number(rawNutr.protein ?? 0),
      carbs: Number(rawNutr.carbs ?? 0),
      fat: Number(rawNutr.fat ?? 0),
      fiber: Number(rawNutr.fiber ?? 0),
      ...(rawNutr.sugar !== undefined && rawNutr.sugar !== null ? { sugar: Number(rawNutr.sugar) } : {}),
      ...(rawNutr.satFat !== undefined && rawNutr.satFat !== null ? { satFat: Number(rawNutr.satFat) } : {}),
      ...(rawNutr.sodium !== undefined && rawNutr.sodium !== null ? { sodium: Number(rawNutr.sodium) } : {}),
    };

    parsedAliases.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : `import_${Date.now()}_${i}`,
      triggers,
      name,
      brand: typeof rec.brand === "string" ? rec.brand : null,
      serving_g: typeof rec.serving_g === "number" && rec.serving_g > 0 ? rec.serving_g : 100,
      nutrition,
      ...(rec.units ? { units: rec.units as Alias["units"] } : {}),
      ...(rec.barcode ? { barcode: String(rec.barcode) } : {}),
      ...(rec.off_id ? { off_id: String(rec.off_id) } : {}),
      ...(rec.recipe ? { recipe: rec.recipe as Alias["recipe"] } : {}),
    });
  }

  return {
    ok: true,
    goals,
    days: parsedDays,
    aliases: parsedAliases,
    daysCount: Object.keys(parsedDays).length,
    mealsCount: totalMeals,
    aliasesCount: parsedAliases.length,
  };
}

/** Doğrulanmış yedek verisini sunucuya tek tek yazar ve en sonda `refresh()` çağırır.
 *  `data.tsx` aksiyon döngülerinden kaçınmak için API uçlarını doğrudan kullanır. */
export async function executeRestore(
  validated: ValidationSuccess,
  currentData: AppData,
  refresh: () => Promise<void>,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const currentDates = Object.keys(currentData.days);
  const newDates = Object.keys(validated.days);
  const datesToDelete = currentDates.filter((d) => !newDates.includes(d));

  const currentAliasIds = currentData.aliases.map((a: Alias) => a.id);
  const newAliasIds = validated.aliases.map((a: Alias) => a.id);
  const aliasesToDelete = currentAliasIds.filter((id: string) => !newAliasIds.includes(id));

  const totalSteps =
    1 + // saveGoals
    datesToDelete.length +
    newDates.length +
    aliasesToDelete.length +
    validated.aliases.length;

  let currentStep = 0;
  const tick = () => {
    currentStep++;
    if (onProgress) onProgress(currentStep, totalSteps);
  };

  // 1. Hedefleri yaz
  await saveGoals(validated.goals);
  tick();

  // 2. Silinmesi gereken eski günleri sil
  for (const date of datesToDelete) {
    await deleteDay(date);
    tick();
  }

  // 3. İçe aktarılan günleri yaz
  for (const date of newDates) {
    await saveDay(date, validated.days[date]);
    tick();
  }

  // 4. Silinmesi gereken eski alias'ları sil
  for (const id of aliasesToDelete) {
    await deleteAlias(id);
    tick();
  }

  // 5. İçe aktarılan alias'ları yaz
  for (const alias of validated.aliases) {
    await saveAlias(alias);
    tick();
  }

  // 6. En sonda TEK bir kez veriyi yenile
  await refresh();
}
