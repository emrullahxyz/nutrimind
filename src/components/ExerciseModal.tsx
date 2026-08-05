import { useState, useEffect, useRef } from "react";
import { Dumbbell, Flame, Plus, Trash2, X, Activity, Footprints, Waves, Bike, Sparkles } from "lucide-react";
import type { Exercise, ExerciseCategory } from "../types";
import { useData } from "../lib/data";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

import { EXERCISE_CONFIG_KEY, exercisesFor, parseExerciseEntries, withExercises } from "../lib/exercise";
import { consumeProgrammaticBack, markProgrammaticBack } from "../lib/backStack";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  date: string;
}

interface Preset {
  name: string;
  category: ExerciseCategory;
  durationMinutes: number;
  caloriesBurned: number;
  icon: typeof Dumbbell;
}

const PRESETS: Preset[] = [
  { name: "Koşu / Jogging", category: "run", durationMinutes: 30, caloriesBurned: 300, icon: Activity },
  { name: "Ağırlık Antrenmanı", category: "weights", durationMinutes: 45, caloriesBurned: 250, icon: Dumbbell },
  { name: "Tempolu Yürüyüş", category: "walk", durationMinutes: 30, caloriesBurned: 130, icon: Footprints },
  { name: "Yüzme", category: "swim", durationMinutes: 30, caloriesBurned: 280, icon: Waves },
  { name: "Bisiklet Surme", category: "cycle", durationMinutes: 30, caloriesBurned: 220, icon: Bike },
];

export function ExerciseModal({ isOpen, onClose, date }: Props) {
  // Lock background body scroll when modal is open
  useBodyScrollLock(isOpen);
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
  const isPoppedRef = useRef(false);

  // `onClose` ref üzerinden okunuyor: bağımlılık dizisinde dursaydı (çağıran
  // taraf inline bir arrow geçirdiği için her render'da yeni bir fonksiyon)
  // efekt her render'da yeniden kurulur, temizliği `history.back()` çağırır ve
  // geciken `popstate` yeni dinleyiciye düşüp modalı KENDİ KENDİNE kapatırdı.
  // `Modal.tsx`'te aynı hata tarayıcı/kamera ekranını bozuyordu — bkz.
  // `lib/backStack.ts`'teki yutma sayacı. Diziye yalnızca `isOpen` girer.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ isModal: true, title: "Egzersiz" }, "");
    isPoppedRef.current = false;

    const handlePopState = () => {
      if (consumeProgrammaticBack()) return;
      isPoppedRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!isPoppedRef.current && window.history.state?.isModal) {
        markProgrammaticBack();
        window.history.back();
      }
    };
  }, [isOpen]);

  const handleUserClose = () => {
    if (!isPoppedRef.current && window.history.state?.isModal) {
      window.history.back();
    } else {
      onClose();
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#151421] border border-white/10 p-5 text-white shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Egzersiz & Aktivite Günlüğü</h2>
              <p className="text-xs text-white/50">{date} • Toplam {totalBurned} kcal yakıldı</p>
            </div>
          </div>
          <button
            onClick={handleUserClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          {/* Quick Presets */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2.5 block">
              Hızlı Hazır Şablonlar
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.name}
                    disabled={busy}
                    onClick={() =>
                      handleSaveExercise({
                        name: p.name,
                        category: p.category,
                        durationMinutes: p.durationMinutes,
                        caloriesBurned: p.caloriesBurned,
                      })
                    }
                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-orange-500/30 text-left transition-all group active:scale-95 disabled:opacity-40"
                  >
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate group-hover:text-orange-300">{p.name}</div>
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
                <Sparkles className="w-3.5 h-3.5 text-accent" /> Özel Egzersiz Ekle
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Egzersiz adı (ör. Futbol Maçı)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
                className="w-full px-3 py-2 rounded-xl bg-[#151421] border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
              >
                <option value="run">Koşu</option>
                <option value="weights">Ağırlık</option>
                <option value="walk">Yürüyüş</option>
                <option value="swim">Yüzme</option>
                <option value="cycle">Bisiklet</option>
                <option value="custom">Özel</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">Süre (Dakika)</label>
                <input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-xs text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">Yakılan Kalori (kcal)</label>
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
              <Plus className="w-4 h-4" /> Egzersizi Kaydet
            </button>
          </form>

          {/* Current Logged Exercises List */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2 block">
              Bugün Eklenen Egzersizler ({currentExercises.length})
            </span>

            {currentExercises.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-white/10 text-center text-xs text-white/40">
                Henüz bugün için bir aktivite eklenmedi.
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
                          {ex.durationMinutes} dakika • {ex.loggedAt || date}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-orange-400">+{ex.caloriesBurned} kcal</span>
                      <button
                        onClick={() => handleDelete(ex.id)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
                        title="Sil"
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
