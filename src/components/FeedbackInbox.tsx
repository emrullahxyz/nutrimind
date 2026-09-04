import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { FeedbackError, fetchFeedback, setFeedbackRead, type FeedbackItem } from "../lib/feedbackApi";
import { ErrorText } from "./FormBits";

/**
 * Admin gelen kutusu — Settings "Geri Bildirimler" subview'unun tamamı.
 * Yalnızca sahip (server'da OWNER_EMAIL ile doğrulanır) görür; gönderenin
 * e-postası KVKK'ya uygun şekilde LEFT JOIN'den gelir, hesap silinince satır
 * da silinir (null → anonim). Liste + okundu/okunmadı toggle; otomatik
 * yenileme yok. Görsel desen FeedbackForm kartiyla aynı.
 */
const CATEGORY_CHIP: Record<FeedbackItem["category"], string> = {
  feature: "bg-sky-500/15 text-sky-400",
  bug: "bg-rose-500/15 text-rose-400",
  other: "bg-white/10 text-white/70",
};

export function FeedbackInbox() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const locale = i18n.resolvedLanguage || i18n.language || "en";

  const yukle = async () => {
    try {
      setErr(null);
      setItems(await fetchFeedback());
    } catch (e) {
      setErr(e instanceof FeedbackError ? e.message : String((e as Error)?.message || e));
    }
  };

  useEffect(() => {
    void yukle();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleRead(item: FeedbackItem) {
    if (busyId !== null) return;
    setBusyId(item.id);
    try {
      await setFeedbackRead(item.id, !item.read);
      setItems((es) =>
        es ? es.map((it) => (it.id === item.id ? { ...it, read: !item.read } : it)) : es,
      );
    } catch (e) {
      setErr(e instanceof FeedbackError ? e.message : String((e as Error)?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  if (items === null && err === null) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
        <p className="text-xs text-white/50">{t("feedbackInbox.loading")}</p>
      </div>
    );
  }

  if (err !== null) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
        <ErrorText>{err}</ErrorText>
        <button
          type="button"
          onClick={() => void yukle()}
          className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
        >
          {t("feedbackInbox.retry")}
        </button>
      </div>
    );
  }

  const list = items ?? [];
  const unreadCount = list.filter((it) => !it.read).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        {unreadCount > 0 && (
          <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-[10px] font-bold text-accent">
            {t("feedbackInbox.unreadCount", { count: unreadCount })}
          </span>
        )}
        <button
          type="button"
          onClick={() => void yukle()}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-95"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{t("feedbackInbox.refresh")}</span>
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
          <p className="text-xs text-white/50">{t("feedbackInbox.empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((item) => {
            const from =
              item.user_email?.trim() || item.user_name?.trim() || t("feedbackInbox.anonymous");
            return (
              <div
                key={item.id}
                className={`flex flex-col gap-2.5 rounded-2xl border p-4 ${
                  item.read
                    ? "border-white/10 bg-row opacity-60"
                    : "border-white/10 border-l-2 border-l-accent bg-row"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CATEGORY_CHIP[item.category] ?? CATEGORY_CHIP.other}`}
                  >
                    {t(
                      `feedbackForm.cat${item.category[0].toUpperCase()}${item.category.slice(1)}`,
                    )}
                  </span>
                  <span className="text-[10px] text-white/40">
                    {new Date(item.created_at).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-white/80 break-words">
                  {item.message}
                </p>
                <div className="flex items-end justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 text-[10px] text-white/40">
                    <span className="truncate">{from}</span>
                    {item.app_version && (
                      <span className="flex-none rounded-full bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/50">
                        v{item.app_version}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleRead(item)}
                    disabled={busyId === item.id}
                    className={`flex-none rounded-xl px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] disabled:opacity-40 ${
                      item.read
                        ? "border border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/10"
                        : "bg-accent text-black hover:bg-accent/90"
                    }`}
                  >
                    {t(item.read ? "feedbackInbox.markUnread" : "feedbackInbox.markRead")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
