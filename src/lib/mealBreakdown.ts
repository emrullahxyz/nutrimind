import { MACROS, MICROS } from "./nutrients";
import type { NutrientDef } from "./nutrients";
import type { Nutrition } from "../types";

export interface BreakdownRow {
  def: NutrientDef;
  value: number;
}

/** Öğün panelindeki besin dökümü satırları: 4 makro HER ZAMAN registry
 *  sırasında (protein/karb/yağ/lif), mikrolar YALNIZCA kayıtta gerçekten
 *  varsa (`n[key] !== undefined`) — `0` girilmiş bir mikro GÖRÜNÜR (veridir),
 *  hiç girilmemiş mikro GÖRÜNMEZ (types.ts'teki "bilinmiyor" ≠ "sıfır"
 *  invariantı burada da korunur). */
export function breakdownRows(n: Nutrition): BreakdownRow[] {
  const macroRows = MACROS.map((def) => ({ def, value: n[def.key] ?? 0 }));
  const microRows = MICROS.filter((def) => n[def.key] !== undefined).map((def) => ({
    def,
    value: n[def.key] ?? 0,
  }));
  return [...macroRows, ...microRows];
}
