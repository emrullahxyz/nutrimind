import { useState } from "react";
import type { PrefKey } from "./prefs";
import { readBoolPref, writeBoolPref } from "./prefs";

/** `useState<boolean>` gibi davranır ama başlangıç değerini localStorage'dan
 *  okur ve her değişiklikte geri yazar. Feature-detect + try/catch `prefs.ts`
 *  içinde olduğu için burada ekstra korumaya gerek yok. */
export function usePersistedBool(key: PrefKey, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => readBoolPref(key, fallback));

  function set(next: boolean) {
    setValue(next);
    writeBoolPref(key, next);
  }

  return [value, set];
}
