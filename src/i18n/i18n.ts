// ============================================================================
// Nutrimind — i18n altyapısı (Faz 5).
//
// Kullanıcı kararı: tarayıcı diline göre otomatik algılama, EN default.
// Manuel override localStorage'da saklanır. Üç dil: en, tr, pl.
//
// NEDEN 3 DİL: Plan, kullanıcı talebi ve "ana dili İngilizce, TR + PL destek".
// YAGNI: 4+ dil ekleme — yeterli talep yok.
//
// NEDEN REACT-I18NEXST: Standart React çözümü, küçük bundle, basit API.
// react-intl daha ağır, tag formatları zorunlu kılar; gerekmez.
// ============================================================================
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import tr from "./locales/tr.json";
import pl from "./locales/pl.json";

export const SUPPORTED_LANGS = ["en", "tr", "pl"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

const STORAGE_KEY = "nutrimind.lang";

/** navigator.language → "en" | "tr" | "pl" (fallback default). */
function detectLang(): Lang {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  const raw = (navigator.language || "").toLowerCase();
  for (const lang of SUPPORTED_LANGS) {
    if (raw === lang || raw.startsWith(lang + "-")) return lang;
  }
  return DEFAULT_LANG;
}

function getStoredLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (SUPPORTED_LANGS as readonly string[]).includes(v)) return v as Lang;
  } catch {}
  return null;
}

const initialLang: Lang = getStoredLang() ?? detectLang();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
    pl: { translation: pl },
  },
  lng: initialLang,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false }, // React zaten kaçış yapıyor
});

// İlk açılışta <html lang> senkronla — setLang yalnızca kullanıcı değiştirince
// çağrılıyor; init sonrası da doğru lang görünmeli (SEO / erişilebilirlik).
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLang;
}

/** <html lang> ve localStorage senkron. */
export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

export default i18n;
