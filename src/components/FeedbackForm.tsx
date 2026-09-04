import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { submitFeedback, type FeedbackCategory } from "../lib/feedbackApi";
import { APP_VERSION } from "../lib/version";
import { ErrorText, Label, fieldCls } from "./FormBits";

/**
 * Uygulama-içi geri bildirim formu — Settings "Özellik İste & Geri Bildirim"
 * subview'unun tamamı. Eski statik mailto kutusunun YERİNE geçer (SettingsSheet
 * feedback bloğunda tek kök olarak render ediliyor; kendi scroll/title'ı yok).
 *
 * Görsel desen SettingsSheet subview kartlarından birebir: `rounded-2xl border
 * border-white/10 bg-row p-4` kabı + FormBits'ten `fieldCls`/`Label`/`ErrorText`
 * (bkz. AllowlistForm, PasswordForm). Seçim vurgusu `bg-accent/10 text-accent
 * border-accent/40` — Ayarlar tema seçicinin aynısı (SettingsSheet.tsx ~868).
 *
 * Ad GÖSTERİLİR ama DÜZENLENEMEZ: `user.name` yalnızca gönderimde eklenir.
 */
export function FeedbackForm() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length >= 10 && !busy;
  const displayName = user?.name?.trim() || null;

  async function handleSubmit() {
    if (!canSend) return;
    setBusy(true);
    setErr(null);
    try {
      await submitFeedback({
        category,
        message: message.trim(),
        name: displayName,
        app_version: APP_VERSION,
      });
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setCategory("feature");
    setMessage("");
    setErr(null);
    setSent(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="text-sm font-extrabold text-emerald-300">
            {t("feedbackForm.successTitle")}
          </div>
          <p className="text-xs leading-relaxed text-white/70">
            {t("feedbackForm.successBody")}
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-[0.98]"
        >
          {t("feedbackForm.newOne")}
        </button>
      </div>
    );
  }

  const CATEGORIES: FeedbackCategory[] = ["feature", "bug", "other"];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
      <div className="text-sm font-extrabold text-white">{t("feedbackForm.title")}</div>

      <div>
        <Label>{t("feedbackForm.categoryLabel")}</Label>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("feedbackForm.categoryLabel")}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`rounded-xl border px-2 py-2 text-xs font-semibold transition active:scale-[0.98] ${
                category === c
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]"
              }`}
            >
              {t(`feedbackForm.cat${c[0].toUpperCase()}${c.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t("feedbackForm.messageLabel")}</Label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("feedbackForm.messagePlaceholder")}
          maxLength={4000}
          rows={4}
          className={`${fieldCls} resize-y leading-relaxed`}
        />
        <div className="mt-1 px-1 text-right font-mono text-[10px] text-white/35">
          {message.length}/4000
        </div>
      </div>

      {displayName && (
        <div className="px-1 text-[11px] text-white/40">{t("feedbackForm.sentAs", { name: displayName })}</div>
      )}

      {err && (
        <ErrorText>
          <span className="font-bold">{t("feedbackForm.errorTitle")}: </span>
          {err}
        </ErrorText>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!canSend}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-extrabold text-accent-ink transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? t("feedbackForm.sending") : t("feedbackForm.send")}
      </button>
    </div>
  );
}
