import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { FeedbackError, submitFeedback, type FeedbackCategory } from "../lib/feedbackApi";
import { APP_VERSION } from "../lib/version";
import { collectAndFormatDiagnostics, DIAGNOSTICS_MARKER } from "../lib/deviceReport";
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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ status: number; retryAfter: number | null } | null>(null);
  const [sent, setSent] = useState(false);

  const canSend = message.trim().length >= 10 && !busy;
  const displayName = user?.name?.trim() || null;
  // Rapor metne EKLENİR ve kullanıcı onu textarea'da GÖRÜR — gizli gönderim
  // yok. Aynı rapor iki kez eklenmesin diye işaretçiye bakılır (kamera
  // kayıtları her açılışta çoğaldığı için ikinci ekleme gürültü olurdu).
  const attached = message.includes(DIAGNOSTICS_MARKER);

  /** iPhone'dan teknik kanıt toplamanın tek yolu: arkadaşın telefonunda
   *  Web Inspector yok, bu yüzden gerçekler uygulamadan çıkarılıp mevcut geri
   *  bildirim yolundan gönderilir. PII yok (bkz. `lib/deviceReport.ts`). */
  function attachDiagnostics() {
    if (attached) return;
    const report = collectAndFormatDiagnostics(i18n.language ?? "en");
    const next = `${message.trimEnd()}\n\n${report}`.trim();
    setMessage(next.slice(0, 4000));
  }

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
      setErr(e instanceof FeedbackError ? { status: e.status, retryAfter: e.retryAfter } : { status: 0, retryAfter: null });
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
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={attachDiagnostics}
            disabled={attached}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
          >
            {attached ? t("feedbackForm.diagnosticsAttached") : t("feedbackForm.attachDiagnostics")}
          </button>
          <span className="font-mono text-[10px] text-white/35">{message.length}/4000</span>
        </div>
        {attached && (
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-white/40">
            {t("feedbackForm.diagnosticsHint")}
          </p>
        )}
      </div>

      {displayName && (
        <div className="px-1 text-[11px] text-white/40">{t("feedbackForm.sentAs", { name: displayName })}</div>
      )}

      {err && (
        <ErrorText>
          <span className="font-bold">{t("feedbackForm.errorTitle")}: </span>
          {err.status === 429 && err.retryAfter != null
            ? t("feedbackForm.err429", { s: err.retryAfter })
            : t(`feedbackForm.err${err.status}`)}
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
