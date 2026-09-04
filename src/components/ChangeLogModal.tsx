import { useTranslation } from "react-i18next";
import { CHANGELOG } from "../lib/changelog";
import { CHANGELOG_SEEN_KEY, markAllSeen, parseSeen, unseenVersions } from "../lib/changelogUi";
import { readStringPref } from "../lib/prefs";
import { Modal } from "./Modal";

/** Görülmemiş sürümleri özetleyen popup. Ancak bir "yeni" sürüm varsa açılır. */
export function ChangeLogModal({ onDismiss }: { onDismiss: () => void }) {
  const { t, i18n } = useTranslation();
  const seen = parseSeen(readStringPref(CHANGELOG_SEEN_KEY, "[]"));
  const unseen = unseenVersions(CHANGELOG.map((v) => v.version), seen);

  // Görülmemiş sürüm yoksa hiçbir şey render etme (Task 3 koşullu mount edecek ama savunmacı ol).
  if (unseen.length === 0) return null;

  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const lang = locale === "tr" ? "tr" : "en";

  const onDismissAndSeen = () => {
    markAllSeen();
    onDismiss();
  };

  const footer = (
    <button
      type="button"
      onClick={onDismissAndSeen}
      className="w-full rounded-xl bg-accent py-3 text-sm font-extrabold text-accent-ink transition hover:bg-accent/90 active:scale-[0.98]"
    >
      {t("changelog.gotIt")}
    </button>
  );

  return (
    <Modal title={t("changelog.title")} onClose={onDismissAndSeen} footer={footer}>
      <div className="flex flex-col gap-3">
        {unseen.map((version) => {
          const entry = CHANGELOG.find((e) => e.version === version);
          if (!entry) return null;
          return (
            <div key={version} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-row p-4">
              <div className="text-sm font-extrabold text-white">
                {t("changelog.versionLabel", { version })}
              </div>
              <p className="text-xs leading-relaxed text-white/70">{entry.summary[lang]}</p>
            </div>
          );
        })}
        <p className="px-1 text-[11px] leading-relaxed text-white/40">{t("changelog.hintSettings")}</p>
      </div>
    </Modal>
  );
}
