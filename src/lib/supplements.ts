import type { AppConfig } from "../types";

export interface SupplementItem {
  id: string;
  name: string;
  dose?: string;
}

export interface SupplementsConfig {
  items: SupplementItem[];
  log: Record<string, string[]>;
}

/** `config.supplements`'ı doğrular. Geçersiz `items` (id/name eksik) ve
 *  `log`'daki geçersiz girişler (dizi olmayan veya boş dizi) atlanır. */
export function parseSupplementsConfig(config: AppConfig): SupplementsConfig {
  if (typeof config !== "object" || config === null) {
    return { items: [], log: {} };
  }
  const rawSupplements = config.supplements;
  if (typeof rawSupplements !== "object" || rawSupplements === null || Array.isArray(rawSupplements)) {
    return { items: [], log: {} };
  }

  const items: SupplementItem[] = [];
  if (Array.isArray(rawSupplements.items)) {
    for (const item of rawSupplements.items) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id.trim() : "";
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!id || !name) continue;
      const dose = typeof rec.dose === "string" && rec.dose.trim().length > 0 ? rec.dose.trim() : undefined;
      items.push({ id, name, ...(dose ? { dose } : {}) });
    }
  }

  const log: Record<string, string[]> = {};
  if (typeof rawSupplements.log === "object" && rawSupplements.log !== null && !Array.isArray(rawSupplements.log)) {
    for (const [date, val] of Object.entries(rawSupplements.log as Record<string, unknown>)) {
      if (!Array.isArray(val)) continue;
      const validIds = val
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim());
      if (validIds.length > 0) {
        log[date] = validIds;
      }
    }
  }

  return { items, log };
}

/** Yeni takviye kimliği. Diğer id üretimleriyle çakışmaz (alias/meal id'lerinden
 *  bağımsız bir ad alanı — `s_` öneki). */
export function newSupplementId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
