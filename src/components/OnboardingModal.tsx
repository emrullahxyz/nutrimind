// ============================================================================
// Nutrimind — ilk kurulum sihirbazı (profil → TDEE → hedef onayı).
//
// TASARIM KARARI: adım SAYISI değişmedi (5). Bu bir yeniden düzenleme:
//   • Sayaç artık i18n'li ve segmented ilerleme çubuğuyla birlikte okunuyor
//     (`onboarding.stepCounter` / `onboarding.stepStatus`).
//   • 320–360 px genişlikte taşma bitti: başlık `min-w-0` + `truncate`, sayaç
//     ve kapat düğmesi `shrink-0`; adım 5'in makro ızgarası dar ekranda 2 kolona
//     düşüyor ve inputlar tam sayıyı gösteriyor.
//   • `p-4.5` gibi GEÇERSİZ Tailwind sınıfları kaldırıldı (spacing ölçeğinde
//     `4.5` yok → iç boşluk hiç uygulanmıyordu).
//   • Adım değişiminde yön duygusu var (ileri/geri), seçenekler kademeli girer.
//
// DEĞİŞMEYEN SÖZLEŞME: prop'lar, TDEE hesabı, `handleFinish` akışı ve odak/
// kaydırma/çıkış reçetesi (`useDialogFocus` + `useBodyScrollLock` + `useModalExit`).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import {
  User,
  Activity,
  Target,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Flame,
  Beef,
  Wheat,
  Droplet,
  CheckCircle2,
  X,
  Scale,
} from "lucide-react";
import {
  calculateTDEE,
  ACTIVITY_LEVEL_LABELS,
  PRIMARY_GOAL_LABELS,
  type UserProfileInput,
  type ActivityLevel,
  type PrimaryGoal,
  type Gender,
} from "../lib/tdee";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useModalExit } from "../hooks/useModalExit";
import type { GoalConfig } from "../types";
import { singleProfileConfig } from "../lib/goals";
import { useTranslation } from "react-i18next";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProfileAndGoals: (
    profileData: UserProfileInput & { bmr: number; tdee: number },
    goalConfig: GoalConfig,
  ) => Promise<void>;
  initialName?: string;
}

/** Toplam adım sayısı — ilerleme çubuğu, sayaç ve ekran okuyucu metni TEK
 *  kaynaktan beslenir (eskiden anahtarın içine sabit "/ 5" yazılıydı). */
const TOTAL_STEPS = 5;

type Step = 1 | 2 | 3 | 4 | 5;

export function OnboardingModal({
  isOpen,
  onClose,
  onSaveProfileAndGoals,
  initialName = "",
}: OnboardingModalProps) {
  useBodyScrollLock(isOpen);
  const { closing, beginClose } = useModalExit(onClose);

  /** Bu tam-ekran sihirbaz `aria-modal="true"` İLAN EDİYORDU ama hiçbir odak
   *  tuzağı/odak iadesi yoktu: Tab perdenin arkasına kaçabiliyor, kapanışta
   *  odak gövdeye düşüyordu (iddia karşılıksız). Ortak hook bunu kapatıyor. */
  const rootRef = useRef<HTMLDivElement>(null);
  useDialogFocus({
    containerRef: rootRef,
    active: isOpen && !closing,
    onEscape: beginClose,
    autoFocus: "container",
  });

  const [step, setStep] = useState<Step>(1);
  const [gidisYonu, setGidisYonu] = useState<"ileri" | "geri">("ileri");
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

  /** Adım başlığı: adım değişince odak buraya taşınır ki ekran okuyucu yeni
   *  adımı DUYURSUN (tuzak içinde kalır — gövdeye kaçmaz). */
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Form State: Hepsi boş / seçilmemiş başlar
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<Gender | null>(null);
  const [age, setAge] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [targetWeightKg, setTargetWeightKg] = useState<string>("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null);

  // Step 5: Özelleştirilebilir Makro Değerleri
  const [customKcal, setCustomKcal] = useState<number | null>(null);
  const [customProtein, setCustomProtein] = useState<number | null>(null);
  const [customCarbs, setCustomCarbs] = useState<number | null>(null);
  const [customFat, setCustomFat] = useState<number | null>(null);
  const [customFiber, setCustomFiber] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // İlk açılışta da çalışır: giriş yapan kullanıcı hangi adımda olduğunu
    // ekran okuyucudan duyar.
    headingRef.current?.focus({ preventScroll: true });
  }, [isOpen, step]);

  if (!isOpen) return null;

  // Adım Geçerlilik Kontrolleri
  const isStep1Valid = name.trim().length > 0 && gender !== null && Number(age) > 0;
  const isStep2Valid = Number(weightKg) > 0 && Number(heightCm) > 0 && Number(targetWeightKg) > 0;
  const isStep3Valid = activityLevel !== null;
  const isStep4Valid = primaryGoal !== null;

  const currentStepValid =
    step === 1
      ? isStep1Valid
      : step === 2
        ? isStep2Valid
        : step === 3
          ? isStep3Valid
          : step === 4
            ? isStep4Valid
            : true;

  // Güvenli TDEE Girdisi (Varsayılan değerlerle hesaplama)
  const currentInput: UserProfileInput = {
    name: name.trim() || t("onboarding.defaultUserName"),
    gender: gender ?? "female",
    age: Number(age) > 0 ? Number(age) : 25,
    weightKg: Number(weightKg) > 0 ? Number(weightKg) : 65,
    heightCm: Number(heightCm) > 0 ? Number(heightCm) : 170,
    targetWeightKg: Number(targetWeightKg) > 0 ? Number(targetWeightKg) : 60,
    activityLevel: activityLevel ?? "moderate",
    primaryGoal: primaryGoal ?? "weight_loss",
  };

  const calculated = calculateTDEE(currentInput);

  const finalKcal = customKcal ?? calculated.recommendedKcal;
  const finalProtein = customProtein ?? calculated.recommendedProtein;
  const finalCarbs = customCarbs ?? calculated.recommendedCarbs;
  const finalFat = customFat ?? calculated.recommendedFat;
  const finalFiber = customFiber ?? calculated.recommendedFiber;

  function gitIleri() {
    setGidisYonu("ileri");
    setStep((s) => Math.min(TOTAL_STEPS, s + 1) as Step);
  }

  function gitGeri() {
    setGidisYonu("geri");
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    try {
      const goalConfig = singleProfileConfig({
        kcal: finalKcal,
        protein: finalProtein,
        carbs: finalCarbs,
        fat: finalFat,
        fiber: finalFiber,
      });

      await onSaveProfileAndGoals(
        {
          ...currentInput,
          bmr: calculated.bmr,
          tdee: calculated.tdee,
        },
        goalConfig,
      );
      beginClose();
    } finally {
      setSaving(false);
    }
  }

  /** Adım başlığı — odaklanabilir (tabIndex=-1) ve ekran okuyucuya duyurulur. */
  function AdimBasligi({
    icon,
    title,
    desc,
  }: {
    icon: React.ReactNode;
    title: string;
    desc: string;
  }) {
    return (
      <div className="space-y-1">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-xl font-extrabold text-white outline-none"
        >
          <span aria-hidden className="text-accent">
            {icon}
          </span>
          <span>{title}</span>
        </h3>
        <p className="text-xs text-ink-secondary">{desc}</p>
      </div>
    );
  }

  /** Seçenek düğmesi — kart görünümü, basma fiziği ve `aria-pressed` tek yerde. */
  function Secenek({
    secili,
    onClick,
    children,
    gecikmeMs = 0,
    className = "",
  }: {
    secili: boolean;
    onClick: () => void;
    children: React.ReactNode;
    gecikmeMs?: number;
    className?: string;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={secili}
        style={{ animationDelay: `${gecikmeMs}ms` }}
        className={`wizard-opt-in w-full rounded-card border p-4 text-left transition-all active:scale-[0.98] flex items-center gap-3.5 ${className} ${
          secili
            ? "bg-white/[0.06] border-accent/80 ring-1 ring-accent/40 shadow-lg text-white"
            : "bg-calCard border-white/10 text-ink-secondary hover:text-white hover:bg-white/[0.04]"
        }`}
      >
        {children}
      </button>
    );
  }

  /** Sayı alanı — mobil klavye için `inputMode`, taşmayan genişlik. */
  const sayiAlani =
    "w-full min-w-0 bg-accent-ink border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-ink-secondary/30 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition font-mono";

  return (
    <div
      ref={rootRef}
      data-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.title")}
      tabIndex={-1}
      className={`fixed inset-0 z-[9999] flex flex-col bg-app text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe glass-screen ${
        closing ? "glass-screen-out" : ""
      }`}
    >
      {/* --- Header: başlık (kırpılabilir) + sayaç + kapat ------------------ */}
      {/* `pad-safe-t`: sihirbazın kapatma düğmesi iPhone'da status bar'ın altında kalmasın. */}
      <div className="pad-safe-t flex items-start gap-3 px-4 pb-3 sm:px-6 flex-none">
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/20 text-sm font-bold text-accent"
        >
          ✨
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-black leading-tight tracking-wide text-white sm:text-lg">
            {t("onboarding.title")}
          </h2>
          <p className="truncate text-[11px] text-ink-secondary">{t("onboarding.subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-accent/20 bg-calCard px-2.5 py-1 font-mono text-[11px] font-bold text-accent">
            {t("onboarding.stepCounter", { step, total: TOTAL_STEPS })}
          </span>
          <button
            type="button"
            onClick={beginClose}
            aria-label={t("common.close")}
            className="rounded-full p-1.5 text-ink-secondary transition hover:bg-calCard hover:text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* --- İlerleme: 5 segment; dolgu yalnız transform ile büyür ---------- */}
      <div
        className="flex flex-none gap-1.5 px-4 pb-3 sm:px-6"
        role="progressbar"
        aria-label={t("onboarding.stepStatus", { step, total: TOTAL_STEPS })}
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuetext={t("onboarding.stepCounter", { step, total: TOTAL_STEPS })}
      >
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const adimNo = i + 1;
          const tamam = adimNo <= step;
          return (
            <span key={adimNo} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className={`block h-full w-full origin-left rounded-full bg-accent transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  tamam ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </span>
          );
        })}
      </div>

      {/* --- Gövde: adım içeriği (yönlü geçiş), tek kaydırılan katman ------ */}
      {/* `--kb`: sihirbaz adımlarında klavye açılınca (yaş/boy/kilo alanları)
          odaklanılan alan klavyenin altında kalıyordu. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(0.5rem_+_var(--kb))] sm:px-6">
        <div
          key={step}
          className={`mx-auto w-full max-w-xl space-y-5 ${
            gidisYonu === "ileri" ? "wizard-step-forward" : "wizard-step-back"
          }`}
        >
          {/* STEP 1: Basic Info */}
          {step === 1 && (
            <>
              <AdimBasligi
                icon={<User className="h-5 w-5" />}
                title={t("onboarding.step1Title")}
                desc={t("onboarding.step1Desc")}
              />
              <div className="space-y-4 rounded-card border border-white/10 bg-calCard p-4 shadow-card sm:p-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-secondary" htmlFor="onboarding-name">
                    {t("onboarding.nameLabel")}
                  </label>
                  <input
                    id="onboarding-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("onboarding.namePlaceholder")}
                    className={sayiAlani}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-ink-secondary">
                    {t("onboarding.genderLabel")}
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {(["female", "male"] as Gender[]).map((g, i) => (
                      <Secenek
                        key={g}
                        secili={gender === g}
                        onClick={() => setGender(g)}
                        gecikmeMs={i * 40}
                        className="justify-center"
                      >
                        <span className="text-sm font-extrabold">
                          {g === "female" ? "👩" : "👨"} {t(`onboarding.${g}`)}
                        </span>
                        {gender === g && <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />}
                      </Secenek>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-ink-secondary" htmlFor="onboarding-age">
                    {t("onboarding.ageLabel")}
                  </label>
                  <input
                    id="onboarding-age"
                    type="number"
                    inputMode="numeric"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder={t("onboarding.agePlaceholder")}
                    className={sayiAlani}
                  />
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Body Stats */}
          {step === 2 && (
            <>
              <AdimBasligi
                icon={<Scale className="h-5 w-5" />}
                title={t("onboarding.step2Title")}
                desc={t("onboarding.step2Desc")}
              />
              <div className="space-y-4 rounded-card border border-white/10 bg-calCard p-4 shadow-card sm:p-5">
                {[
                  {
                    id: "onboarding-weight",
                    label: t("onboarding.weightLabel"),
                    value: weightKg,
                    set: setWeightKg,
                    placeholder: t("onboarding.weightPlaceholder"),
                    step: "0.1",
                  },
                  {
                    id: "onboarding-height",
                    label: t("onboarding.heightLabel"),
                    value: heightCm,
                    set: setHeightCm,
                    placeholder: t("onboarding.heightPlaceholder"),
                    step: undefined,
                  },
                  {
                    id: "onboarding-target",
                    label: t("onboarding.targetWeightLabel"),
                    value: targetWeightKg,
                    set: setTargetWeightKg,
                    placeholder: t("onboarding.targetWeightPlaceholder"),
                    step: "0.1",
                  },
                ].map((f) => (
                  <div key={f.id} className="space-y-1.5">
                    <label className="text-xs font-bold text-ink-secondary" htmlFor={f.id}>
                      {f.label}
                    </label>
                    <input
                      id={f.id}
                      type="number"
                      inputMode="decimal"
                      step={f.step}
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className={sayiAlani}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* STEP 3: Activity Level */}
          {step === 3 && (
            <>
              <AdimBasligi
                icon={<Activity className="h-5 w-5" />}
                title={t("onboarding.step3Title")}
                desc={t("onboarding.step3Desc")}
              />
              <div className="space-y-3">
                {(Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[]).map((key, i) => {
                  const item = ACTIVITY_LEVEL_LABELS[key];
                  const isSelected = activityLevel === key;
                  return (
                    <Secenek
                      key={key}
                      secili={isSelected}
                      onClick={() => setActivityLevel(key)}
                      gecikmeMs={i * 40}
                    >
                      <span aria-hidden className="shrink-0 text-2xl">
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-sm font-extrabold text-white">
                            {t(`onboarding.activity.${key}.title`)}
                          </h4>
                          <span className="shrink-0 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-accent">
                            x{item.multiplier}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-snug text-ink-secondary">
                          {t(`onboarding.activity.${key}.desc`)}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />}
                    </Secenek>
                  );
                })}
              </div>
            </>
          )}

          {/* STEP 4: Primary Goal */}
          {step === 4 && (
            <>
              <AdimBasligi
                icon={<Target className="h-5 w-5" />}
                title={t("onboarding.step4Title")}
                desc={t("onboarding.step4Desc")}
              />
              <div className="space-y-3">
                {(Object.keys(PRIMARY_GOAL_LABELS) as PrimaryGoal[]).map((key, i) => {
                  const item = PRIMARY_GOAL_LABELS[key];
                  const isSelected = primaryGoal === key;
                  return (
                    <Secenek
                      key={key}
                      secili={isSelected}
                      onClick={() => setPrimaryGoal(key)}
                      gecikmeMs={i * 40}
                    >
                      <span aria-hidden className="shrink-0 text-2xl">
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-extrabold text-white sm:text-base">
                          {t(`onboarding.goal.${key}.title`)}
                        </h4>
                        <p className="mt-1 text-xs leading-snug text-ink-secondary">
                          {t(`onboarding.goal.${key}.desc`)}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />}
                    </Secenek>
                  );
                })}
              </div>
            </>
          )}

          {/* STEP 5: TDEE Result & Goal Confirmation */}
          {step === 5 && (
            <>
              <div className="space-y-1 text-center">
                <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/20 px-3 py-1 text-xs font-bold text-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("onboarding.step5Badge")}
                </span>
                <h3
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-xl font-black tracking-tight text-white outline-none sm:text-2xl"
                >
                  {t("onboarding.step5Title")}
                </h3>
                <p className="mx-auto max-w-md text-xs text-ink-secondary">
                  {t("onboarding.step5Desc", { bmr: calculated.bmr, tdee: calculated.tdee })}
                </p>
              </div>

              <div className="space-y-3 rounded-card border border-white/10 bg-calCard p-4 shadow-card sm:p-5">
                {/* Günlük kalori — tam satır, dar ekranda da sayı kırpılmaz */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-accent-ink p-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Flame className="h-5 w-5 shrink-0 text-accent" />
                    <span className="truncate text-xs font-extrabold text-white">
                      {t("onboarding.dailyKcal")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={t("onboarding.dailyKcal")}
                      value={finalKcal}
                      onChange={(e) => setCustomKcal(Number(e.target.value))}
                      className="w-[76px] rounded-xl border border-accent/30 bg-white/[0.06] px-2.5 py-1.5 text-right font-mono text-base font-black text-white outline-none focus:border-accent sm:w-24"
                    />
                    <span className="text-xs font-bold text-ink-secondary">kcal</span>
                  </div>
                </div>

                {/* Makrolar: 2 kolon (≥360px'te 3) — 320px'de 3 haneli değer
                    kırpılmasın diye etiket ÜSTTE, input tam genişlikte. */}
                <div className="grid grid-cols-2 gap-2.5 min-[360px]:grid-cols-3">
                  {[
                    {
                      key: "protein",
                      label: t("onboarding.protein"),
                      icon: <Beef className="h-3.5 w-3.5" />,
                      renk: "text-protein",
                      value: finalProtein,
                      set: setCustomProtein,
                    },
                    {
                      key: "carbs",
                      label: t("onboarding.carbs"),
                      icon: <Wheat className="h-3.5 w-3.5" />,
                      renk: "text-carb",
                      value: finalCarbs,
                      set: setCustomCarbs,
                    },
                    {
                      key: "fat",
                      label: t("onboarding.fat"),
                      icon: <Droplet className="h-3.5 w-3.5" />,
                      renk: "text-fat",
                      value: finalFat,
                      set: setCustomFat,
                    },
                  ].map((m, i) => (
                    <div
                      key={m.key}
                      className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-accent-ink p-3"
                    >
                      <div className={`flex items-center gap-1 text-[11px] font-bold ${m.renk}`}>
                        {m.icon}
                        <span className="truncate">{m.label}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          aria-label={m.label}
                          style={{ animationDelay: `${i * 40}ms` }}
                          value={m.value}
                          onChange={(e) => m.set(Number(e.target.value))}
                          className="w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-1.5 text-right font-mono text-sm font-black text-white outline-none focus:border-accent"
                        />
                        <span className="shrink-0 text-[10px] font-bold text-ink-secondary">g</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Lif */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-accent-ink p-3.5">
                  <span className="min-w-0 truncate text-xs font-bold text-memory">
                    🌿 {t("onboarding.dailyFiber")}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={t("onboarding.dailyFiber")}
                      value={finalFiber}
                      onChange={(e) => setCustomFiber(Number(e.target.value))}
                      className="w-16 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-1.5 text-right font-mono text-xs font-bold text-white outline-none focus:border-accent"
                    />
                    <span className="text-xs font-bold text-ink-secondary">g</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Alt eylem çubuğu ---------------------------------------------- */}
      <div className="flex-none border-t border-white/10 bg-app p-4 sm:p-5">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={gitGeri}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-calCard px-4 py-3.5 text-xs font-extrabold text-ink-secondary transition hover:bg-white/[0.04] hover:text-white active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden min-[360px]:inline">{t("common.back")}</span>
            </button>
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              disabled={!currentStepValid}
              onClick={gitIleri}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-extrabold shadow-lg transition active:scale-[0.98] ${
                currentStepValid
                  ? "bg-accent text-accent-ink hover:bg-accent/90"
                  : "cursor-not-allowed bg-white/10 text-white/40"
              }`}
            >
              <span>{t("common.continue")}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleFinish}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-black text-accent-ink shadow-lg transition hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>{saving ? t("common.loading") : t("onboarding.saveAndStart")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
