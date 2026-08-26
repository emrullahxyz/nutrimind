import { useState } from "react";
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
import { useModalExit } from "../hooks/useModalExit";
import type { GoalConfig } from "../types";
import { singleProfileConfig } from "../lib/goals";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProfileAndGoals: (
    profileData: UserProfileInput & { bmr: number; tdee: number },
    goalConfig: GoalConfig
  ) => Promise<void>;
  initialName?: string;
}

export function OnboardingModal({
  isOpen,
  onClose,
  onSaveProfileAndGoals,
  initialName = "",
}: OnboardingModalProps) {
  useBodyScrollLock(isOpen);
  const { closing, beginClose } = useModalExit(onClose);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [saving, setSaving] = useState(false);

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
    name: name.trim() || "Kullanıcı",
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
        goalConfig
      );
      beginClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-modal="true"
      className={`fixed inset-0 z-[9999] flex flex-col bg-app text-white h-[100dvh] w-full overflow-hidden animate-fadeIn pad-safe glass-screen ${
        closing ? "glass-screen-out" : ""
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 border-b border-white/10 flex-none bg-app">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center font-bold text-sm border border-accent/30">
            ✨
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-wide leading-none">
              Profil & TDEE Kurulum Sihirbazı
            </h2>
            <p className="text-[11px] text-ink-secondary mt-0.5">Soft Velvet Dark • Özel Beslenme Planı</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs font-mono font-bold text-accent bg-calCard px-3 py-1.5 rounded-full border border-accent/20">
            {step} / 5
          </div>
          <button
            type="button"
            onClick={beginClose}
            className="p-1.5 text-ink-secondary hover:text-white rounded-full hover:bg-calCard transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Step Progress Bar */}
      <div
        className="w-full bg-accent-ink h-1.5 flex-none overflow-hidden"
        role="progressbar"
        aria-label={`Adım ${step} / 5`}
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={5}
      >
        <div
          className="bg-accent h-full transition-all duration-300"
          style={{ width: `${(step / 5) * 100}%` }}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-xl mx-auto w-full space-y-6">
        {/* STEP 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-accent" />
                <span>Seni Tanıyalım</span>
              </h3>
              <p className="text-xs text-ink-secondary">
                BMR ve metabolizma hesaplamaların için temel kişisel bilgilerin.
              </p>
            </div>

            <div className="space-y-4 bg-calCard p-4 sm:p-6 rounded-card border border-white/10 shadow-card">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Adın & Soyadın</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  className="w-full bg-accent-ink border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-ink-secondary/30 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
                />
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Cinsiyet Seçimi</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`py-3.5 px-4 rounded-2xl border text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-95 ${
                      gender === "female"
                        ? "bg-white/[0.06] text-accent border-accent/80 ring-1 ring-accent/40 shadow-lg"
                        : "bg-accent-ink text-ink-secondary border-white/10 hover:text-white hover:bg-calCard"
                    }`}
                  >
                    <span>👩 Kadın</span>
                    {gender === "female" && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`py-3.5 px-4 rounded-2xl border text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-95 ${
                      gender === "male"
                        ? "bg-white/[0.06] text-accent border-accent/80 ring-1 ring-accent/40 shadow-lg"
                        : "bg-accent-ink text-ink-secondary border-white/10 hover:text-white hover:bg-calCard"
                    }`}
                  >
                    <span>👨 Erkek</span>
                    {gender === "male" && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </button>
                </div>
              </div>

              {/* Age */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Yaşın</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Yaşınız"
                  className="w-full bg-accent-ink border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-ink-secondary/30 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Body Stats */}
        {step === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Scale className="w-5 h-5 text-accent" />
                <span>Vücut Ölçülerin</span>
              </h3>
              <p className="text-xs text-ink-secondary">
                Metabolizma hızını ve kalori ihtiyacını hesaplamak için ölçülerin.
              </p>
            </div>

            <div className="space-y-4 bg-calCard p-4 sm:p-6 rounded-card border border-white/10 shadow-card">
              {/* Current Weight */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Mevcut Kilon (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="Kilonuz (kg)"
                  className="w-full bg-accent-ink border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-ink-secondary/30 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition font-mono"
                />
              </div>

              {/* Height */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Boyun (cm)</label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="Boyunuz (cm)"
                  className="w-full bg-accent-ink border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-ink-secondary/30 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition font-mono"
                />
              </div>

              {/* Target Weight */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Hedef Kilon (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={targetWeightKg}
                  onChange={(e) => setTargetWeightKg(e.target.value)}
                  placeholder="Hedef kilonuz (kg)"
                  className="w-full bg-accent-ink border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white font-bold placeholder:text-ink-secondary/30 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Activity Level */}
        {step === 3 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent" />
                <span>Günlük Aktivite Düzeyin</span>
              </h3>
              <p className="text-xs text-ink-secondary">
                Gün içindeki genel hareketliliğini seç.
              </p>
            </div>

            <div className="space-y-3">
              {(Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[]).map((key) => {
                const item = ACTIVITY_LEVEL_LABELS[key];
                const isSelected = activityLevel === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActivityLevel(key)}
                    className={`w-full p-4 sm:p-4.5 rounded-card border text-left transition-all active:scale-[0.99] flex items-center gap-3.5 ${
                      isSelected
                        ? "bg-white/[0.06] border-accent/80 ring-1 ring-accent/40 shadow-xl text-white"
                        : "bg-calCard border-white/10 text-ink-secondary hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="text-2xl shrink-0">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-sm text-white">{item.title}</h4>
                        <span className="text-[10px] font-mono font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full border border-accent/20">
                          x{item.multiplier}
                        </span>
                      </div>
                      <p className="text-xs text-ink-secondary mt-1 leading-snug">{item.desc}</p>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 4: Primary Goal */}
        {step === 4 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-accent" />
                <span>Temel Hedefin</span>
              </h3>
              <p className="text-xs text-ink-secondary">
                Hedefine uygun kalori dengesini seç.
              </p>
            </div>

            <div className="space-y-3">
              {(Object.keys(PRIMARY_GOAL_LABELS) as PrimaryGoal[]).map((key) => {
                const item = PRIMARY_GOAL_LABELS[key];
                const isSelected = primaryGoal === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPrimaryGoal(key)}
                    className={`w-full p-4.5 rounded-card border text-left transition-all active:scale-[0.99] flex items-center gap-4 ${
                      isSelected
                        ? "bg-white/[0.06] border-accent/80 ring-1 ring-accent/40 shadow-xl text-white"
                        : "bg-calCard border-white/10 text-ink-secondary hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="text-3xl shrink-0">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-extrabold text-base text-white">{item.title}</h4>
                      <p className="text-xs text-ink-secondary mt-1 leading-snug">{item.desc}</p>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 5: TDEE Result & Goal Confirmation */}
        {step === 5 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="space-y-1 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold border border-accent/30 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Hesaplama Tamamlandı</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">Sana Özel Beslenme Planı</h3>
              <p className="text-xs text-ink-secondary max-w-md mx-auto">
                BMR ({calculated.bmr} kcal) ve TDEE ({calculated.tdee} kcal) değerlerine göre önerildi. İstersen değerleri özelleştirebilirsin.
              </p>
            </div>

            {/* Calculated Cards */}
            <div className="bg-calCard p-4 sm:p-6 rounded-card border border-white/10 space-y-4 shadow-card">
              {/* Daily Kcal */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-accent-ink border border-white/5">
                <div className="flex items-center gap-2.5">
                  <Flame className="w-5 h-5 text-accent" />
                  <span className="text-xs font-extrabold text-white">Günlük Kalori Hedefi</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={finalKcal}
                    onChange={(e) => setCustomKcal(Number(e.target.value))}
                    className="w-24 bg-white/[0.06] border border-accent/30 rounded-xl px-3 py-1.5 text-right font-black text-base text-white font-mono focus:border-accent outline-none"
                  />
                  <span className="text-xs font-bold text-ink-secondary">kcal</span>
                </div>
              </div>

              {/* 3 Macros */}
              <div className="grid grid-cols-3 gap-2.5">
                {/* Protein */}
                <div className="p-3 rounded-2xl bg-accent-ink border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-protein">
                    <Beef className="w-3.5 h-3.5" />
                    <span>Protein</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2.5">
                    <input
                      type="number"
                      value={finalProtein}
                      onChange={(e) => setCustomProtein(Number(e.target.value))}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-2 py-1 text-right font-black text-sm text-white font-mono focus:border-accent outline-none"
                    />
                    <span className="text-[10px] text-ink-secondary font-bold">g</span>
                  </div>
                </div>

                {/* Carbs */}
                <div className="p-3 rounded-2xl bg-accent-ink border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-carb">
                    <Wheat className="w-3.5 h-3.5" />
                    <span>Karb</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2.5">
                    <input
                      type="number"
                      value={finalCarbs}
                      onChange={(e) => setCustomCarbs(Number(e.target.value))}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-2 py-1 text-right font-black text-sm text-white font-mono focus:border-accent outline-none"
                    />
                    <span className="text-[10px] text-ink-secondary font-bold">g</span>
                  </div>
                </div>

                {/* Fat */}
                <div className="p-3 rounded-2xl bg-accent-ink border border-white/5 flex flex-col justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-fat">
                    <Droplet className="w-3.5 h-3.5" />
                    <span>Yağ</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2.5">
                    <input
                      type="number"
                      value={finalFat}
                      onChange={(e) => setCustomFat(Number(e.target.value))}
                      className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-2 py-1 text-right font-black text-sm text-white font-mono focus:border-accent outline-none"
                    />
                    <span className="text-[10px] text-ink-secondary font-bold">g</span>
                  </div>
                </div>
              </div>

              {/* Fiber */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-accent-ink border border-white/5">
                <span className="text-xs font-bold text-memory">🌿 Günlük Lif Hedefi</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={finalFiber}
                    onChange={(e) => setCustomFiber(Number(e.target.value))}
                    className="w-16 bg-white/[0.06] border border-white/10 rounded-xl px-2 py-1 text-right font-bold text-xs text-white font-mono focus:border-accent outline-none"
                  />
                  <span className="text-xs font-bold text-ink-secondary">g</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="p-4 sm:p-5 border-t border-white/10 bg-app flex-none">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="px-4 py-3.5 rounded-full bg-calCard hover:bg-white/[0.04] text-xs font-extrabold text-ink-secondary hover:text-white transition flex items-center gap-1.5 active:scale-95"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Geri</span>
            </button>
          )}

          {step < 5 ? (
            <button
              type="button"
              disabled={!currentStepValid}
              onClick={() => setStep((s) => (s + 1) as any)}
              className={`flex-1 py-3.5 px-6 rounded-full font-extrabold text-sm shadow-lg transition active:scale-95 flex items-center justify-center gap-2 ${
                currentStepValid
                  ? "bg-accent text-accent-ink hover:bg-accent/90"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              }`}
            >
              <span>Devam Et</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleFinish}
              className="flex-1 py-3.5 px-6 rounded-full bg-accent text-accent-ink font-black text-sm shadow-lg hover:opacity-95 transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{saving ? "Kaydediliyor..." : "Hedeflerimi Kaydet ve Başla"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
