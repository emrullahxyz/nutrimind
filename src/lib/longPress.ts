// ============================================================================
// Nutrimind — uzun basmanın SAF kararları.
//
// Kablolama `src/hooks/useLongPress.ts`'te (pointer olayları, zamanlayıcı);
// burada yalnızca karar verilebilir kısımlar durur ki jsdom'suz test edilebilsin.
// ============================================================================

/** Uzun basma eşiği — 500 ms, mobil platformların yerleşik hissiyle aynı. */
export const LONG_PRESS_MS = 500;

/** Parmak/kursor bu kadar pikselden fazla kayarsa basış İPTAL edilir: kaydırma
 *  listeyi kaydırırken menü açılmasın (yaygın mobil kusuru). */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export interface PressPoint {
  x: number;
  y: number;
}

/** Basış noktasından bu yana tolerans aşıldı mı? */
export function exceededMoveTolerance(
  from: PressPoint,
  to: PressPoint,
  tolerance = LONG_PRESS_MOVE_TOLERANCE_PX,
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > tolerance;
}

/** Basış kendi butonuna mı geldi? Satırdaki "⋮" butonunun kendi `click`'i var;
 *  uzun basma da tetiklenirse menü iki kez açılır. */
export function shouldIgnorePressTarget(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest("button, a, input, textarea, select, [role='button']") !== null;
}
