// ============================================================================
// Nutrimind — dil seçici (paylaşılan bileşen).
//
// NEREDEN: iki yerden çağrılır — Ayarlar > Dil (bugüne kadarki tek yer) ve
// giriş/kayıt ekranı. Kayıt olurken dilin İLK iş seçilebilmesi isteği üzerine
// ortak bileşene çıkarıldı: iki kopya ayrı ayrı sürüklenmez.
//
// VARSAYILAN: cihaz dili (`navigator.language` → en/tr/pl, EN fallback).
// Bu davranış `src/i18n/i18n.ts`'te yaşar — seçici onu yalnızca GÖRÜNÜR kılar
// ve gerektiğinde `setLang` ile değiştirir.
//
// NEDEN AÇILIR MENÜ (popover) DEĞİL: 3 dil için satır içi bir segment yeterli
// ve böylece yeni bir overlay/diyalog doğmaz — odak tuzağı, geri tuşu ve
// kaydırma kilidi reçetesi (AGENTS.md K9) hiç zorlanmaz.
// ============================================================================
import { useTranslation } from "react-i18next";
import { setLang, SUPPORTED_LANGS } from "../i18n/i18n";
import type { Lang } from "../i18n/i18n";

const LABEL_KEY: Record<Lang, string> = {
  tr: "settings.languageTr",
  en: "settings.languageEn",
  pl: "settings.languagePl",
};

interface LanguagePickerProps {
  /** `compact`: giriş ekranı için dar pill grubu · `full`: Ayarlar satırı. */
  variant?: "compact" | "full";
  className?: string;
}

export function LanguagePicker({ variant = "full", className = "" }: LanguagePickerProps) {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "en") as Lang;

  const base =
    variant === "compact"
      ? "rounded-full border px-3 py-1.5 text-[11px] font-bold"
      : "flex-1 rounded-pill border px-3 py-2 text-sm font-semibold";

  return (
    <div
      className={`flex gap-2 ${className}`}
      role="group"
      aria-label={t("settings.language")}
      data-compact={variant === "compact" ? "" : undefined}
    >
      {SUPPORTED_LANGS.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => setLang(lng)}
          aria-pressed={current === lng}
          className={`${base} transition ${
            current === lng
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
              : "border-line bg-white/[0.04] text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {t(LABEL_KEY[lng])}
        </button>
      ))}
    </div>
  );
}
