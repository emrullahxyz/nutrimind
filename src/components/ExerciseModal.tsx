import { useState } from "react";
import { Dumbbell, Flame, Plus, Trash2, X, Activity, Footprints, Waves, Bike, Sparkles } from "lucide-react";
import type { Exercise, ExerciseCategory } from "../types";
import { useData } from "../lib/data";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useModalHistory } from "../hooks/useModalHistory";
import { useModalExit } from "../hooks/useModalExit";
import { haptic } from "../lib/haptics";
import { useTheme } from "../lib/theme";
import { useTranslation } from "react-i18next";

import { EXERCISE_CONFIG_KEY, exercisesFor, parseExerciseEntries, withExercises } from "../lib/exercise";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  date: string;
}

interface Preset {
  nameKey: string;
  category: ExerciseCategory;
  durationMinutes: number;
  caloriesBurned: number;
  icon: typeof Dumbbell;
}

// ponytail: preset adları config'e kaydedilir — dil-bağımlı depolama v1 için kabul.
const PRESETS: Preset[] = [
  { nameKey: "exercise.presetRun", category: "run", durationMinutes: 30, caloriesBurned: 300, icon: Activity },
  { nameKey: "exercise.presetWeights", category: "weights", durationMinutes: 45, caloriesBurned: 250, icon: Dumbbell },
  { nameKey: "exercise.presetWalk", category: "walk", durationMinutes: 30, caloriesBurned: 130, icon: Footprints },
  { nameKey: "exercise.presetSwim", category: "swim", durationMinutes: 30, caloriesBurned: 280, icon: Waves },
  { nameKey: "exercise.presetCycle", category: "cycle", durationMinutes: 30, caloriesBurned: 220, icon: Bike },
];

export function ExerciseModal({ isOpen, onClose, date }: Props) {
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
  const [calories, setCalories] = useState(200);

  // Geri tuşu/kaydırma/X entegrasyonu — bkz. `useModalHistory` (7 bileşende
  // elle kopyalanmış aynı deseni tek yere topluyor).
  const { requestClose: handleUserClose } = useModalHistory({ active: isOpen, onClose });
  const { closing, beginClose } = useModalExit(handleUserClose);
  const { theme } = useTheme();

  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSaveExercise = async (newEx: Omit<Exercise, "id">) => {
    if (busy) return;
    setBusy(true);
    try {
      const exWithId: Exercise = {
        ...newEx,
        id: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        loggedAt: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
      };
      const updated = [...currentExercises, exWithId];
      await updateConfig(EXERCISE_CONFIG_KEY, { entries: withExercises(entries, date, updated) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = currentExercises.filter((e) => e.id !== id);
      await updateConfig(EXERCISE_CONFIG_KEY, { entries: withExercises(entries, date, updated) });
    } finally {
      setBusy(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || calories <= 0) return;
    handleSaveExercise({
      name: name.trim(),
      category,
      durationMinutes: Number(duration) || 0,
      caloriesBurned: Number(calories) || 0,
    });
    setName("");
  };

  const totalBurned = currentExercises.reduce((acc, curr) => acc + curr.caloriesBurned, 0);

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
              <p className="text-xs text-white/50">{date} • {t("exercise.totalBurned", { kcal: totalBurned })}</p>
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
              {PRESETS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.nameKey}
                    disabled={busy}
                    onClick={() => {
                      if (theme === "glass") haptic("light");
                      handleSaveExercise({
                        name: t(p.nameKey),
                        category: p.category,
                        durationMinutes: p.durationMinutes,
                        caloriesBurned: p.caloriesBurned,
                      });
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-orange-500/30 text-left transition-all group active:scale-95 spring-press disabled:opacity-40"
                  >
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate group-hover:text-orange-300">{t(p.nameKey)}</div>
                      <div className="text-[10px] text-white/40">{p.durationMinutes}dk • {p.caloriesBurned} kcal</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Exercise Form */}
          <form onSubmit={handleCustomSubmit} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">{t("exercise.durationLabel")}</label>
                <input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">{t("exercise.caloriesLabel")}</label>
                <input
                  type="number"
                  min="1"
                  value={calories}
                  onChange={(e) => setCalories(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim() || calories <= 0 || busy}
              className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 font-semibold text-xs text-white flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" /> {t("exercise.saveExercise")}
            </button>
          </form>

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
                        <div className="text-xs font-semibold text-white">{ex.name}</div>
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
