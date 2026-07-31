// ============================================================================
// Nutrimind — geçmişe dayalı miktar tahmini (medyan hesabı).
// ============================================================================
import type { Alias } from "../types";
import type { Days } from "./days";
import { datesDesc } from "./days";
import { parseNum } from "./nutrition";

export interface QuantityEstimate {
  value: number;
  sampleCount: number;
}

/**
 * Eski kayıtlar için regex ile etiket parçalama yedeği.
 * Biçimler: "Yoğurt (150g)", "Yumurta (2 adet)", "Süt (250 ml)", "Tavuk (200g) + Pilav (150g)".
 * Yalnızca yapısal veri (sources) yokken kullanılır.
 * UYARI: Bu yedek kırılgandır; etiket elle değiştirildiyse veya parantez biçimi farklıysa
 * miktarı yanlış çıkarabilir veya hiç çıkaramayabilir.
 */
function parseQuantityFromLabel(
  label: string,
  targetAliasId: string,
  unit: string,
  aliases?: Alias[]
): number | null {
  if (!label) return null;
  const parts = label.split(/\s*\+\s*/);
  const targetAlias = aliases?.find((a) => a.id === targetAliasId);
  const candidateNames = new Set<string>();
  candidateNames.add(targetAliasId.toLowerCase());
  if (targetAlias) {
    candidateNames.add(targetAlias.name.toLowerCase());
    for (const tr of targetAlias.triggers) {
      candidateNames.add(tr.toLowerCase());
    }
  }

  for (const part of parts) {
    // Matches "ItemName (150g)" or "ItemName (2 adet)" or "ItemName (150 g)"
    const match = part.match(/^(.+?)\s*\(\s*([\d.,]+)\s*([^\d\s\(\)]+)?\s*\)$/);
    if (!match) continue;

    const itemName = match[1].trim().toLowerCase();
    const qtyStr = match[2];
    const unitStr = (match[3] ?? "g").trim().toLowerCase();

    const normalizedTargetUnit = (unit || "g").trim().toLowerCase();

    if (candidateNames.has(itemName) && unitStr === normalizedTargetUnit) {
      const qty = parseNum(qtyStr);
      if (qty > 0 && Number.isFinite(qty)) {
        return qty;
      }
    }
  }

  return null;
}

/**
 * Bir besin ve birim için geçmiş kayıtların medyan miktarını ve örnek sayısını hesaplar.
 * En son 10 kaydı alıp medyanını döndürür. En az 2 kayıt yoksa null döndürür.
 */
export function usualQuantity(
  days: Days,
  aliasId: string,
  unit: string,
  aliases?: Alias[]
): QuantityEstimate | null {
  if (!days || !aliasId || !unit) return null;

  const samples: number[] = [];
  const dates = datesDesc(days);

  for (const date of dates) {
    const meals = days[date];
    if (!meals) continue;

    for (const meal of meals) {
      if (samples.length >= 10) break;

      if (Array.isArray(meal.sources)) {
        // Yapısal veri mevcut: `sources` dizisini kontrol et
        for (const s of meal.sources) {
          if (samples.length >= 10) break;
          if (
            s.aliasId === aliasId &&
            s.unit === unit &&
            typeof s.qty === "number" &&
            s.qty > 0 &&
            Number.isFinite(s.qty)
          ) {
            samples.push(s.qty);
          }
        }
      } else {
        // Yapısal veri yoksa regex yedeğini kullan
        const fallbackQty = parseQuantityFromLabel(meal.label, aliasId, unit, aliases);
        if (fallbackQty !== null) {
          samples.push(fallbackQty);
        }
      }
    }

    if (samples.length >= 10) break;
  }

  if (samples.length < 2) {
    return null;
  }

  // Medyan hesabı
  const sorted = [...samples].sort((a, b) => a - b);
  const len = sorted.length;
  const mid = Math.floor(len / 2);

  const median = len % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    value: median,
    sampleCount: len,
  };
}
