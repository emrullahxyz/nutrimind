/** Kalıcı UI tercihleri için localStorage anahtarları. Yeni anahtar eklerken
 *  `nutrimind.ui.` önekini koru — başka bir amaçla kullanılan localStorage
 *  girdileriyle çakışmasın. */
export const PREF = {
  supplementsOpen: "nutrimind.ui.supplementsOpen",
  microsOpen: "nutrimind.ui.microsOpen",
  theme: "nutrimind.ui.theme",
} as const;

export type PrefKey = (typeof PREF)[keyof typeof PREF];

/** Ham string'i bool'a çevirir; tanınmayan/eksik değerde `fallback` döner. */
export function parseBoolPref(raw: string | null, fallback: boolean): boolean {
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

/** `localStorage` yoksa (SSR/node/gizli sekme kısıtlaması) veya erişim
 *  patlarsa sessizce `fallback` döner — bu bir UI tercihi, kritik veri değil. */
export function readBoolPref(key: PrefKey, fallback: boolean): boolean {
  if (!hasLocalStorage()) return fallback;
  try {
    return parseBoolPref(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

export function writeBoolPref(key: PrefKey, value: boolean): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // sessizce yut — pref kalıcılığı kritik değil, kullanıcı akışını bozmasın
  }
}

/** `localStorage` yoksa (SSR/node/gizli sekme) veya erişim patlarsa sessizce
 *  `fallback` döner; aksi hâlde kayıtlı string'i olduğu gibi verir. */
export function readStringPref(key: string, fallback: string): string {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function writeStringPref(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // sessizce yut — pref kalıcılığı kritik değil, kullanıcı akışını bozmasın
  }
}
