import { useState } from "react";
import {
  Activity,
  Bike,
  CircleDot,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  Gauge,
  Goal,
  Music4,
  PersonStanding,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Waves,
  X,
  Zap,
} from "lucide-react";
import type { Exercise, ExerciseCategory } from "../types";
import { useData } from "../lib/data";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useModalHistory } from "../hooks/useModalHistory";
import { useModalExit } from "../hooks/useModalExit";
import { haptic } from "../lib/haptics";
import { useTheme } from "../lib/theme";
import { useTranslation } from "react-i18next";

import {
  EXERCISE_CONFIG_KEY,
  burnedKcal,
  exerciseWeight,
  exercisesFor,
  parseExerciseEntries,
  withExercises,
} from "../lib/exercise";
import { parseWeightConfig, seedEntry } from "../lib/weight";
import { formatNumber, todayISO } from "../lib/format";
import { afterHistoryBackSettles } from "../lib/backStack";

/** `config.weight` — kilo ölçümlerinin config anahtarı. `ExerciseModal` kilo
 *  sorusunu buraya yazar; egzersiz kaydı ise `EXERCISE_CONFIG_KEY`'e. İki
 *  anahtar ayrıdır (biri diğerini silmez). */
export const WEIGHT_CONFIG_KEY = "weight";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  /** Task 7'de bağlanır. Verilmezse "+ Egzersiz Ekle" düğmesi hiç
   *  render edilmez — bugünkü davranış (yalnız gömülü presetler) korunur. */
  onOpenExerciseSettings?: () => void;
}

export interface Preset {
  /** i18n anahtarı. Kayda `t()` ile ÇEVİRİLEREK yazılmaz; hesaba yalnız
   *  `category` + `durationMinutes` + `caloriesBurned` girer. */
  nameKey: string;
  category: ExerciseCategory;
  /** Açılışta önerilen süre; kullanıcı ekleme anında değiştirir. */
  durationMinutes: number;
  icon: typeof Dumbbell;
}

// ---------------------------------------------------------------------------
// GÖMÜLÜ 13 EGZERSİZ — kodda yaşar, config'e ASLA yazılmaz.
//
// Kategori eşlemesi bilinçli bir TAVAN: Yoga/Pilates/Tenis/Basketbol/Futbol/
// Dans gerçekte `run`/`weights`'tan çok farklı metabolik yük taşır, ama
// `ExerciseCategory` ölü bir alan (hiçbir yerde okunmuyor) ve genişletmek
// kullanıcıya HİÇBİR ŞEY göstermezdi. Bu aktiviteler `custom` (MET 4.0) ile
// kaydedilir — daha kötü bir tahmin değil, kullanıcının Ayarlar → Egzersiz
// Kütüphanesi'nden GERÇEK MET'ini seçebileceği yol açılır.
// ---------------------------------------------------------------------------
export const EXERCISE_PRESETS: Preset[] = [
  { nameKey: "exercise.presetRun", category: "run", durationMinutes: 30, icon: Activity },
  { nameKey: "exercise.presetWeights", category: "weights", durationMinutes: 45, icon: Dumbbell },
  { nameKey: "exercise.presetWalk", category: "walk", durationMinutes: 30, icon: Footprints },
  { nameKey: "exercise.presetSwim", category: "swim", durationMinutes: 30, icon: Waves },
  { nameKey: "exercise.presetCycle", category: "cycle", durationMinutes: 30, icon: Bike },
  { nameKey: "exercise.presetTreadmill", category: "run", durationMinutes: 30, icon: Gauge },
  { nameKey: "exercise.presetHiit", category: "run", durationMinutes: 20, icon: Zap },
  { nameKey: "exercise.presetYoga", category: "custom", durationMinutes: 45, icon: Flower2 },
  { nameKey: "exercise.presetPilates", category: "custom", durationMinutes: 60, icon: PersonStanding },
  { nameKey: "exercise.presetTennis", category: "custom", durationMinutes: 60, icon: Target },
  { nameKey: "exercise.presetBasketball", category: "custom", durationMinutes: 60, icon: CircleDot },
  { nameKey: "exercise.presetFootball", category: "custom", durationMinutes: 90, icon: Goal },
  { nameKey: "exercise.presetDance", category: "custom", durationMinutes: 60, icon: Music4 },
];

/** Süre seçim çipleri. Bunlar TEKLİF; aralık dışı her süre elle girilir. */
export const DURATION_CHIPS = [15, 30, 45, 60] as const;

/** Kayda girmeden önceki egzersiz — `id`/`caloriesBurned` sonradan eklenir. */
export type DraftExercise = Omit<Exercise, "id" | "caloriesBurned">;

/** Gömülü presetlerin DİL-BAĞIMSIZ kimlikleri. Kayda yazılan `name` budur. */
const PRESET_NAME_KEYS = new Set(EXERCISE_PRESETS.map((p) => p.nameKey));

/** `config.exercise`'in nesne tarafı — `catalog` DAHİL, bozuksa `{}`.
 *
 *  NEDEN gerekli: `config.exercise` TEK bir config satırı ve sunucu yazmada
 *  satırın tamamını değiştiriyor (`PUT /api/config/<key>`). Yani `{entries}`
 *  yazan bir `updateConfig(EXERCISE_CONFIG_KEY, { entries })` çağrısı aynı
 *  satırdaki `catalog`'u **sessizce silerdi** — kullanıcının Ayarlar →
 *  Egzersiz Kütüphanesi'nde eklediği her şey bir sonraki egzersiz kaydında
 *  yok olurdu.
 *
 *  `withCatalog` (`lib/exercise.ts`) ters yönü koruyor ("entries KORUNUR");
 *  bu yardımcı onun **simetriğidir**: günlük kayıt yazarken `catalog` korunur.
 *
 *  Dönen değer KOPYADIR — canlı `config.exercise` nesnesi değil. Çağıran
 *  üst düzey anahtarları değiştirirse (spread ile yaptığı gibi) config'e
 *  sızmasın; `withCatalog` da aynı disiplini uygular (`{ ...base, ... }`). */
export function existingExerciseConfig(config: unknown): Record<string, unknown> {
  const prev = (config as { exercise?: unknown })?.exercise;
  return typeof prev === "object" && prev !== null && !Array.isArray(prev)
    ? { ...(prev as Record<string, unknown>) }
    : {};
}

/** Kaydın görünen adı.
 *
 *  NEDEN çeviri burada, kayıtta değil: `Exercise.name` dolu olmak zorunda
 *  (`parseExerciseItem` adsız kaydı düşürür), ama içine `t()` ile çevrilmiş
 *  metin yazılırsa hesabın dili değişince kayıt DONDURULMUŞ yabancı dilde
 *  kalır — canlı veride "Ağırlık Antrenmanı" → "Trening siłowy" bozulması tam
 *  olarak buydu. Kayda anahtar yazılır, görünen ad KULLANICININ GÜNCEL diline
 *  burada çözülür. Kullanıcının kendi yazdığı ad olduğu gibi gösterilir. */
export function displayExerciseName(name: string, t: (key: string) => string): string {
  return PRESET_NAME_KEYS.has(name) ? t(name) : name;
}

/** Kayda girecek kalori: kullanıcının elle yazdığı gerçek ÖNCE gelir.
 *
 *  L20 (ekranda ne yazıyorsa kayda o girer) — kullanıcının bildiği gerçek,
 *  formülün tahmininden iyidir. `null` ise hesap yapılır. */
export function resolveKcal(
  override: number | null,
  category: ExerciseCategory,
  weightKg: number,
  minutes: number,
): number {
  if (override !== null && Number.isFinite(override) && override > 0) return override;
  return burnedKcal(category, weightKg, minutes);
}

/** Kilo girişini sayıya çevirir; geçersizse `null`.
 *
 *  Virgül de kabul edilir (`78,5` — Türkiye'de/yazarken olağan). Uydurma kilo
 *  YOK: boş, sıfır, negatif ya da sayı olmayan girdi `null` döner ve soru
 *  kapanmaz (L21).
 *
 *  ÜST SINIR 400 kg: `Number("1e308")` sonlu bir sayıdır ama `burnedKcal`
 *  onu `Infinity` yapar ve `parseExerciseItem` `Infinity` kalorili kaydı
 *  reddeder — kullanıcı kaydetti sanır, reload'da kaydı kaybolurdu. Sınırdan
 *  büyük girdi de `null` döner: soru kapanır, sahte kayıt yazılmaz. */
export const MAX_WEIGHT_KG = 400;

export function parseWeightInput(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!cleaned) return null;
  const kg = Number(cleaned);
  if (!Number.isFinite(kg) || kg <= 0 || kg > MAX_WEIGHT_KG) return null;
  return kg;
}

export function ExerciseModal({ isOpen, onClose, date, onOpenExerciseSettings }: Props) {
  // Lock background body scroll when modal is open
  useBodyScrollLock(isOpen);
  const { t } = useTranslation();
  const { config, updateConfig } = useData();

  // Tek `exercise` anahtarı + gün bazlı entries — bkz. lib/exercise.ts'teki not.
  // (Eski `exercise_${date}` anahtarı backend'in tire kabul etmeyen anahtar
  // deseni yüzünden 400 dönüyordu; egzersiz kaydı hiç kalıcı olmuyordu.)
  const entries = parseExerciseEntries(config[EXERCISE_CONFIG_KEY]);
  const currentExercises: Exercise[] = exercisesFor(entries, date);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("run");
  const [duration, setDuration] = useState(30);

  /** Kilo bilinmiyorsa kullanıcıdan BİR KEZ sorulur; girilen değer
   *  `config.weight`'e bugünün ölçümü olarak yazılır (aşağıda). */
  const weightKg = exerciseWeight(config);
  /** Kilo sorusu cevap bekleyen kayıt — ekran kapanana kadar tutulur, böylece
   *  yarım kayıt kalmaz. */
  const [pendingExercise, setPendingExercise] = useState<DraftExercise | null>(null);
  const [weightInput, setWeightInput] = useState("");

  /** Süre akışı: preset'e dokununca kaydetmek yerine süre sorulur. */
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);
  const [pendingMinutes, setPendingMinutes] = useState(30);

  /** Hesaplanan kalori önde gelir; kullanıcı dokununca elle değiştirebilir.
   *  Form 3 alan (ad + kategori + süre) — MET kullanıcıya gösterilmez. */
  const [kcalOverride, setKcalOverride] = useState<number | null>(null);

  // Geri tuşu/kaydırma/X entegrasyonu — bkz. `useModalHistory` (7 bileşende
  // elle kopyalanmış aynı deseni tek yere topluyor).
  const { requestClose: handleUserClose } = useModalHistory({ active: isOpen, onClose });
  const { closing, beginClose } = useModalExit(handleUserClose);
  const { theme } = useTheme();

  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const persistExercise = async (newEx: DraftExercise, kg: number) => {
    const exWithId: Exercise = {
      ...newEx,
      caloriesBurned: resolveKcal(kcalOverride, newEx.category, kg, newEx.durationMinutes),
      id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      loggedAt: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    };
    const updated = [...currentExercises, exWithId];
    // `...base` şart: sunucu satırın tamamını değiştirdiği için yalnız
    // `{entries}` yazmak `catalog`'u silerdi (bkz. `existingExerciseConfig`).
    await updateConfig(EXERCISE_CONFIG_KEY, {
      ...existingExerciseConfig(config),
      entries: withExercises(entries, date, updated),
    });
  };

  /** Kaydeder. `caloriesBurned` formülle hesaplanır; kilo bilinmiyorsa kayıt
   *  BEKLETİLİR ve kullanıcıdan bir kez sorulur. */
  const handleSaveExercise = async (newEx: DraftExercise) => {
    if (busy) return;
    if (weightKg === null) {
      setPendingExercise(newEx);
      return;
    }
    setBusy(true);
    try {
      await persistExercise(newEx, weightKg);
      setKcalOverride(null);
      setPendingPreset(null);
    } finally {
      setBusy(false);
    }
  };

  const handleWeightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !pendingExercise) return;
    const kg = parseWeightInput(weightInput);
    if (kg === null) return;
    setBusy(true);
    try {
      // Kilo `config.weight`'e bugünün ÖLÇÜMÜ olarak yazılır: hem kalıcıdır
      // hem de Kilo & Vücut Geçmişi'ne gerçek bir kayıt girer (uydurma değil,
      // kullanıcının az önce girdiği gerçek bir ölçüm). `seedEntry` bugün
      // zaten kayıtlıysa dokunmaz — geçmiş ölçümü ezmeyiz.
      const before = parseWeightConfig(config).entries;
      const next = seedEntry(before, todayISO(), kg);
      if (next !== before) await updateConfig(WEIGHT_CONFIG_KEY, { entries: next });
      // Kilo YAZILDIKTAN SONRA kayıt tamamlanır: ekran kapanmadan önce
      // `weightKg` hâlâ null kalırdı ve kcal 0 gözükürdü.
      await persistExercise(pendingExercise, kg);
      setPendingExercise(null);
      setWeightInput("");
      setKcalOverride(null);
      setPendingPreset(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = currentExercises.filter((e) => e.id !== id);
      await updateConfig(EXERCISE_CONFIG_KEY, {
        ...existingExerciseConfig(config),
        entries: withExercises(entries, date, updated),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || duration <= 0) return;
    handleSaveExercise({
      name: name.trim(),
      category,
      durationMinutes: Number(duration) || 0,
    });
    setName("");
  };

  const totalBurned = currentExercises.reduce((acc, curr) => acc + curr.caloriesBurned, 0);

  /** Formdaki kategori + süreden hesaplanan kalori önizlemesi. */
  const customKcal =
    weightKg !== null ? resolveKcal(kcalOverride, category, weightKg, duration) : 0;
  /** Seçili preset + süresinden hesaplanan kalori önizlemesi. */
  const presetKcal =
    weightKg !== null && pendingPreset
      ? resolveKcal(kcalOverride, pendingPreset.category, weightKg, pendingMinutes)
      : 0;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm animate-fadeIn ${
        closing ? "scrim-out" : ""
      }`}
    >
      <div
        className={`w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-panel-alt border border-white/10 p-5 text-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden relative glass-exercise ${
          closing ? "modal-out" : ""
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t("exercise.title")}</h2>
              <p className="text-xs text-white/50">
                {date} • {t("exercise.totalBurned", { kcal: totalBurned })}
              </p>
            </div>
          </div>
          <button
            onClick={beginClose}
            className={
              theme === "glass"
                ? "w-9 h-9 rounded-full bg-orange-500/10 hover:bg-orange-500/20 flex items-center justify-center text-orange-300 transition-colors"
                : "w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition-colors"
            }
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          {/* Quick Presets */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2.5 block">
              {t("exercise.quickPresets")}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EXERCISE_PRESETS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.nameKey}
                    disabled={busy}
                    onClick={() => {
                      if (theme === "glass") haptic("light");
                      // Kalori artık preset'te SABİT DEĞİL; süre + kilo seçilir.
                      // Önceki formdan kalan elle yazılmış kilo taşmasın.
                      setKcalOverride(null);
                      setPendingMinutes(p.durationMinutes);
                      setPendingPreset(p);
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-orange-500/30 text-left transition-all group active:scale-95 spring-press disabled:opacity-40"
                  >
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate group-hover:text-orange-300">
                        {t(p.nameKey)}
                      </div>
                      <div className="text-[10px] text-white/40">
                        {p.durationMinutes} {t("exercise.minutes")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Prop verilmezse render edilmez — bugünkü davranış korunur.
                SIRA ÖNEMLİ: önce kapat, sonra settle et. Modalın kapanış
                temizliği `markProgrammaticBack()` + `history.back()` çağırıyor
                ve bu ASENKRON; Ayarlar'ın alt görünümü aynı anda
                `pushState` yaparsa tarayıcı back()'in hedefini çağrı anındaki
                konuma göre kaydedip aradaki yeni push'u atlıyor → alt görünüm
                React'te açık ama geçmiş girdisi yok ("zombi modal"), ilk geri
                basış yutuluyor. `afterHistoryBackSettles` back()'in GERÇEKTEN
                ürettiği `popstate`'i bekler — bkz. `lib/backStack.ts` ve
                `BottomNav`'ın FAB menüsü (aynı desen). */}
            {onOpenExerciseSettings && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onClose();
                  afterHistoryBackSettles(() => onOpenExerciseSettings());
                }}
                className="mt-2 w-full py-2.5 rounded-2xl border border-dashed border-white/10 hover:border-orange-500/30 text-xs font-semibold text-white/60 hover:text-orange-300 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40"
              >
                {/* Anahtar metni `+` ile başlıyor; ikon da `+` olduğu için
                    çift artı olmasın diye metinden soyulur. */}
                <Plus className="h-3.5 w-3.5" /> {t("exercise.addExercise").replace(/^\+\s*/, "")}
              </button>
            )}
          </div>

          {/* KİLO SORUSU — tek dal: kilo bilinmiyorsa hesap kutusu yerine bu.
              Kayıt `pendingExercise`'ta bekler; ekran kapanmadan tamamlanır. */}
          {pendingExercise ? (
            <form
              onSubmit={handleWeightSubmit}
              className="p-4 rounded-2xl bg-orange-500/[0.06] border border-orange-500/25 space-y-3"
            >
              <div>
                <div className="text-sm font-bold text-white">{t("exercise.weightPromptTitle")}</div>
                <div className="text-[11px] text-white/50 mt-0.5">{t("exercise.weightPromptBody")}</div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.1"
                placeholder="kg"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={parseWeightInput(weightInput) === null || busy}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 font-semibold text-xs text-white transition-all active:scale-95"
                >
                  {t("exercise.saveExercise")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingExercise(null);
                    setWeightInput("");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 font-semibold text-xs text-white/70 transition-all active:scale-95"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* SÜRE AKIŞI — preset seçildiğinde açılır */}
              {pendingPreset && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/80">
                      {t("exercise.durationLabel")} — {t(pendingPreset.nameKey)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingPreset(null)}
                      className="p-1 rounded-lg text-white/30 hover:text-white/70 transition-colors"
                      aria-label={t("common.cancel")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_CHIPS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingMinutes(m)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 disabled:opacity-40 ${
                          pendingMinutes === m
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "bg-white/5 border-white/5 text-white/70 hover:bg-white/10"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    min="1"
                    value={pendingMinutes}
                    onChange={(e) => setPendingMinutes(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                  />

                  {/* Kilo varsa hesaplanan kalori kutusu; yoksa soru formu
                      (iki dal, ayrı "uyarı" dalı yok). */}
                  {weightKg !== null && pendingMinutes > 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <label className="text-[10px] text-white/40 mb-1 block">
                        {t("exercise.caloriesLabel")}
                      </label>
                      <div className="flex items-baseline gap-2">
                        <input
                          type="number"
                          min="1"
                          value={presetKcal}
                          onChange={(e) => setKcalOverride(Number(e.target.value))}
                          className="w-28 px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-sm font-mono font-bold text-accent focus:outline-none focus:border-accent"
                        />
                        <span className="font-mono text-sm font-bold text-accent">kcal</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-white/50">
                        {t("exercise.kcalForBody", {
                          weight: formatNumber(weightKg, 1),
                          minutes: formatNumber(pendingMinutes),
                        })}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy || pendingMinutes <= 0}
                    onClick={() =>
                      handleSaveExercise({
                        name: pendingPreset.nameKey,
                        category: pendingPreset.category,
                        durationMinutes: Number(pendingMinutes) || 0,
                      })
                    }
                    className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 font-semibold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> {t("exercise.saveExercise")}
                  </button>
                </div>
              )}

              {/* Custom Exercise Form */}
              <form
                onSubmit={handleCustomSubmit}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" /> {t("exercise.customTitle")}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder={t("exercise.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent"
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-panel-alt border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                  >
                    {(
                      [
                        ["run", "categoryRun"],
                        ["weights", "categoryWeights"],
                        ["walk", "categoryWalk"],
                        ["swim", "categorySwim"],
                        ["cycle", "categoryCycle"],
                        ["custom", "categoryCustom"],
                      ] as const
                    ).map(([value, key]) => (
                      <option key={value} value={value}>
                        {t(`exercise.${key}`)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={weightKg !== null ? "grid grid-cols-2 gap-2" : ""}>
                  <div>
                    <label className="text-[10px] text-white/40 mb-1 block">
                      {t("exercise.durationLabel")}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                    />
                  </div>
                  {/* Kilo bilinmiyorsa 0 kcal YAZILMAZ — kullanıcı sorulur. */}
                  {weightKg !== null && (
                    <div>
                      <label className="text-[10px] text-white/40 mb-1 block">
                        {t("exercise.caloriesLabel")}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={customKcal}
                        onChange={(e) => setKcalOverride(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!name.trim() || duration <= 0 || busy}
                  className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 font-semibold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" /> {t("exercise.saveExercise")}
                </button>
              </form>
            </>
          )}

          {/* Current Logged Exercises List */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2 block">
              {t("exercise.todayList", { count: currentExercises.length })}
            </span>

            {currentExercises.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-white/10 text-center text-xs text-white/40">
                {t("exercise.noActivityYet")}
              </div>
            ) : (
              <div className="space-y-2">
                {currentExercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center font-bold text-xs">
                        🔥
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {displayExerciseName(ex.name, t)}
                        </div>
                        <div className="text-[10px] text-white/40">
                          {ex.durationMinutes} {t("exercise.minutes")} • {ex.loggedAt || date}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-orange-400">+{ex.caloriesBurned} kcal</span>
                      <button
                        onClick={() => handleDelete(ex.id)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
                        title={t("common.delete")}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
