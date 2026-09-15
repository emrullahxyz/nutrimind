// ============================================================================
// Nutrimind — giriş / kayıt ekranı (Faz F).
//
// Router YOK: mod (`giris` | `kayit`) düz bir `useState`. Uygulamanın kendi
// konvansiyonu bu (App.tsx'te sekmeler de öyle) ve bir giriş ekranı için router
// eklemek yeni bir bağımlılık demek olurdu.
//
// Doğrulama `src/lib/authRules.ts`'ten geliyor — sunucudaki kuralların aynası.
// Buradaki tek işi ANINDA geri bildirim; yetkili olan sunucu ve her kural orada
// tekrar uygulanıyor.
// ============================================================================
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ErrorText, Label, TextField, fieldCls } from "./FormBits";
import { LanguagePicker } from "./LanguagePicker";
import { useAuth } from "../lib/auth";
import { GOOGLE_START_URL, googleErrorMessage } from "../lib/authApi";
import { emailProblem, passwordProblem, registerProblem } from "../lib/authRules";
import { useTranslation } from "react-i18next";

type Mode = "giris" | "kayit";

export function AuthScreen() {
  const { t } = useTranslation();
  const { capabilities, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("giris");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [gizli, setGizli] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kayitMi = mode === "kayit";

  // Google akışı başarısız olduysa sunucu `/?auth_error=<kod>` ile geri
  // yönlendirdi. Mesajı gösterip parametreyi adres çubuğundan TEMİZLİYORUZ:
  // aksi hâlde sayfa her yenilendiğinde eski hata yeniden çıkardı.
  useEffect(() => {
    const kod = new URLSearchParams(window.location.search).get("auth_error");
    if (!kod) return;
    setErr(googleErrorMessage(kod));
    const temiz = new URL(window.location.href);
    temiz.searchParams.delete("auth_error");
    window.history.replaceState(window.history.state, "", temiz.pathname + temiz.search);
  }, []);

  // Aynı `saving`/`err` deseni GoalsForm.tsx:129-147'den — projenin form
  // konvansiyonu.
  const sorun = kayitMi
    ? registerProblem({ email, password, password2 })
    : emailProblem(email) || passwordProblem(password);
  const canSubmit = sorun === null && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErr(null);
    try {
      if (kayitMi) await register(email, password, name.trim() || undefined);
      else await login(email, password);
      // Başarılıysa AuthProvider `authed`'e geçiyor ve bu bileşen unmount
      // oluyor — burada yapılacak bir şey yok.
    } catch (e2) {
      setErr(String((e2 as Error)?.message ?? e2));
      setSaving(false);
    }
  }

  function modDegistir() {
    setMode(kayitMi ? "giris" : "kayit");
    setErr(null);
    setPassword2("");
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-6 py-10">
      {/* DİL SEÇİMİ — kayıt/giriş ekranında İLK iş.
          Varsayılan cihaz dilidir (`navigator.language` → en/tr/pl, EN fallback)
          ve seçim anında tüm ekranı çevirir. Üye olurken ekstra adım eklememek
          için sihirbaza değil, bu ekrana konuldu. */}
      <LanguagePicker variant="compact" className="mb-6 self-center justify-center" />

      <div className="mb-8 flex flex-col items-center gap-3">
        <picture>
          <source srcSet="/NutriMind_Logo.webp" type="image/webp" />
          <img src="/NutriMind_Logo.png" alt="" width={56} height={56} className="rounded-2xl" />
        </picture>
        <h1 className="text-xl font-extrabold tracking-tight text-ink-primary">Nutrimind</h1>
        <p className="text-center text-[12px] text-ink-tertiary">
          {kayitMi ? t("auth.subtitleRegister") : t("auth.subtitleLogin")}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {kayitMi && (
          <TextField
            label={t("auth.name") + t("auth.nameOptional")}
            value={name}
            onChange={setName}
            placeholder={t("auth.namePlaceholder")}
            autoComplete="name"
          />
        )}

        <TextField
          label={t("auth.email")}
          value={email}
          onChange={setEmail}
          placeholder={t("auth.emailPlaceholder")}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
        />

        <label className="block">
          <Label>{t("auth.password")}</Label>
          <div className="relative">
            <input
              className={`${fieldCls} pr-11`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={gizli ? "password" : "text"}
              // Yeni parola ile mevcut parola AYRI ipuçları: parola yöneticisi
              // kayıtta "kaydet mi?", girişte "doldur mu?" diye sorabilsin.
              autoComplete={kayitMi ? "new-password" : "current-password"}
              placeholder={kayitMi ? t("auth.passwordMin") : "••••••••"}
            />
            <button
              type="button"
              onClick={() => setGizli((v) => !v)}
              aria-label={gizli ? t("auth.showPassword") : t("auth.hidePassword")}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-tertiary transition hover:text-ink-primary"
            >
              {gizli ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
        </label>

        {kayitMi && (
          <TextField
            label={t("auth.passwordRepeat")}
            value={password2}
            onChange={setPassword2}
            type="password"
            autoComplete="new-password"
          />
        )}

        {err && <ErrorText>{err}</ErrorText>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 w-full rounded-pill bg-accent px-4 py-3 text-sm font-extrabold text-accent-ink transition disabled:opacity-40"
        >
          {saving ? "…" : kayitMi ? t("auth.createAccount") : t("auth.login")}
        </button>

        {/* Kullanıcı bir şey yazmaya başlamadan hata göstermek can sıkıcı;
            yalnızca alanlara dokunulduysa uyarıyoruz. */}
        {sorun && (email !== "" || password !== "") && !err && (
          <p className="text-center text-[11px] text-ink-tertiary">{sorun}</p>
        )}
      </form>

      {capabilities.googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              {t("common.or")}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {/* `fetch` DEĞİL, gerçek bir bağlantı: tarayıcının Google'a gidip
              geri dönmesi gereken ÜST SEVİYE bir navigasyon bu. */}
          <a
            href={GOOGLE_START_URL}
            className="flex w-full items-center justify-center gap-2.5 rounded-pill border border-line bg-white/[0.04] px-4 py-3 text-sm font-bold text-ink-primary transition hover:bg-white/[0.08]"
          >
            <GoogleLogo />
            {t("auth.signInWithGoogle")}
          </a>
        </>
      )}

      <div className="mt-6 text-center text-[12px] text-ink-tertiary">
        {kayitMi ? (
          <>
            {t("auth.alreadyHaveAccount")}{" "}
            <button type="button" onClick={modDegistir} className="font-bold text-accent underline">
              {t("auth.login")}
            </button>
          </>
        ) : capabilities.signupAllowed ? (
          <>
            {t("auth.noAccount")}{" "}
            <button type="button" onClick={modDegistir} className="font-bold text-accent underline">
              {t("auth.register")}
            </button>
          </>
        ) : (
          // Kayıt kapalıyken var olmayan bir düğme göstermek yerine sebebini
          // söylüyoruz — kişisel bir uygulamada bu normal bir durum.
          <span className="text-ink-faint">{t("auth.signupClosed")}</span>
        )}
      </div>
    </div>
  );
}

/** Google'ın marka rengi; tek kullanımlık olduğu için satır içi. */
function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
