import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CHANGELOG } from "../lib/changelog";
import { markAllSeen } from "../lib/changelogUi";

/** Çip rengi — türe göre (koyu tema). Yeni → emerald, İyileştirildi → sky, Düzeltildi → amber. */
const CHIP_STYLE: Record<ChangeLogType, string> = {
  new: "bg-emerald-500/15 text-emerald-400",
  improved: "bg-sky-500/15 text-sky-400",
  fixed: "bg-amber-500/15 text-amber-400",
};

type ChangeLogType = "new" | "improved" | "fixed";

/** Ayarlar alt-görünümü: TÜM sürüm kayıtlarını listeler (yeni → eski). */
export function ChangeLogView() {
  const { t, i18n } = useTranslation();

  // Görüntülenen dil: tr ve en veri çift dilde var; pl kullanıcı en görür.
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const lang = locale === "tr" ? "tr" : "en";

  // Bu ekran HER açıldığında bütün sürümler "görüldü" sayılır.
  // localStorage yazımı idempotent olduğundan çift render güvenlidir.
  useEffect(() => {
    markAllSeen();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {CHANGELOG.map((entry) => (
        <div
          key={entry.version}
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-white">
              {t("changelog.versionLabel", { version: entry.version })}
            </div>
            <span className="flex-none text-[11px] text-white/40">
              {new Date(entry.date + "T00:00:00").toLocaleDateString(locale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>

          <p className="text-xs leading-relaxed text-white/70">{entry.summary[lang]}</p>

          {entry.items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {entry.items.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={`mt-px flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${CHIP_STYLE[item.type]}`}
                  >
                    {t(`changelog.${item.type}`)}
                  </span>
                  <span className="text-xs leading-relaxed text-white/70">{item[lang]}</span>
                </li>
              ))}
            </ul>
          )}

          {entry.dev.length > 0 && (
            <details className="text-[11px] text-white/40">
              <summary className="cursor-pointer font-semibold text-white/50 hover:text-white/70">
                {t("changelog.devTitle")}
              </summary>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-white/40">
                {entry.dev.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
