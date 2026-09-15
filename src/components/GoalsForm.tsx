import { useState } from "react";
import { Check, Sparkles, Plus, Trash2, Calendar, Target, Award } from "lucide-react";
import { Modal } from "./Modal";
import { ErrorText, Label, NutritionFields, draftNum, fromDraft, toDraft } from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { weekdayShortList } from "../lib/format";
import {
  applySuggestion,
  defaultProfile,
  profileDisplayName,
  profileIcon,
  profileNameFieldValue,
  trainingDayCount,
} from "../lib/goals";
import { NUTRIENTS } from "../lib/nutrients";
import type { GoalConfig } from "../types";
import { useTranslation } from "react-i18next";

interface ProfileDraft {
  id: string;
  name: string;
  nutrition: NutritionDraft;
}

/** Haftanın günleri Pazartesi'den başlar (kullanıcının okuduğu sıra), ama
 *  `weekday` anahtarları 0=Pazar sözleşmesinde. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TRAINING_DAY_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7];

function newProfileId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function toProfileDrafts(config: GoalConfig): ProfileDraft[] {
  return config.profiles.map((p) => ({ id: p.id, name: p.name, nutrition: toDraft(p.nutrition) }));
}

function profileErrorOf(
  p: ProfileDraft,
  t: (k: string, o?: Record<string, string>) => string,
): string | null {
  if (p.name.trim() === "") return t("goals.profileNameRequired");
  if (!(draftNum(p.nutrition, "kcal") > 0)) return t("goals.kcalPositive");
  for (const def of NUTRIENTS) {
    if (def.key === "kcal") continue;
    if (def.group === "micro" && (p.nutrition[def.key] ?? "").trim() === "") continue;
    if (draftNum(p.nutrition, def.key) < 0)
      return t("goals.negativeNotAllowed", { nutrient: t(`nutrient.${def.key}`) });
  }
  return null;
}

export function GoalsForm({
  onClose,
  embedded = false,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const { goals, updateGoals } = useData();
  // Aktif dile göre gün adları (dil değişince anında tazelenir — bkz. lib/format).
  const dowNames = weekdayShortList();

  const [profiles, setProfiles] = useState<ProfileDraft[]>(() => toProfileDrafts(goals));
  const [defaultId, setDefaultId] = useState<string>(() => defaultProfile(goals).id);
  const [weekday, setWeekday] = useState<Record<number, string>>(() => ({ ...goals.weekday }));
  const [overrides] = useState<Record<string, string>>(() => ({ ...goals.overrides }));
  const [selectedId, setSelectedId] = useState<string>(() => defaultProfile(goals).id);
  const [trainingDays, setTrainingDays] = useState<number>(() => {
    const n = trainingDayCount(goals);
    return n > 0 ? n : 4;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nameEdited, setNameEdited] = useState<Record<string, boolean>>({});

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0];
  const invalid = profiles.map((p) => profileErrorOf(p, t));
  const firstInvalid = invalid.findIndex((e) => e !== null);
  const canSave = firstInvalid === -1;

  function configOf(): GoalConfig {
    return {
      version: 2,
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name.trim() || p.id,
        nutrition: fromDraft(p.nutrition),
      })),
      defaultProfileId: profiles.some((p) => p.id === defaultId) ? defaultId : profiles[0].id,
      weekday,
      overrides,
    };
  }

  function patchSelected(patch: Partial<ProfileDraft>) {
    setProfiles(profiles.map((p) => (p.id === selected.id ? { ...p, ...patch } : p)));
  }

  /** Kullanıcı ad alanına yazdı mı? Gömülü profilin adı VERİ olarak Türkçe
   *  durur; alan dokunulmadıkça çevrilmiş adı gösterir. Dokunulduysa kullanıcının
   *  yazdığı değer hem görünür hem kaydedilir (bkz. `profileNameFieldValue`). */
  function onNameChange(value: string) {
    setNameEdited((prev) => ({ ...prev, [selected.id]: true }));
    patchSelected({ name: value });
  }

  function addProfile() {
    const id = newProfileId();
    setProfiles([
      ...profiles,
      {
        id,
        name: t("goals.newProfileName", { n: profiles.length + 1 }),
        nutrition: { ...selected.nutrition },
      },
    ]);
    setSelectedId(id);
  }

  function removeSelected() {
    if (profiles.length < 2) return;
    const rest = profiles.filter((p) => p.id !== selected.id);
    const nextDefault = defaultId === selected.id ? rest[0].id : defaultId;
    const nextWeekday: Record<number, string> = {};
    for (const [dow, id] of Object.entries(weekday)) {
      nextWeekday[Number(dow)] = id === selected.id ? nextDefault : id;
    }
    setProfiles(rest);
    setDefaultId(nextDefault);
    setWeekday(nextWeekday);
    setSelectedId(rest[0].id);
  }

  function cycleWeekday(dow: number) {
    const current = weekday[dow];
    const i = profiles.findIndex((p) => p.id === current);
    const next = profiles[(i + 1) % profiles.length];
    setWeekday({ ...weekday, [dow]: next.id });
  }

  function applySuggested() {
    const next = applySuggestion(configOf(), trainingDays);
    setProfiles(toProfileDrafts(next));
    setDefaultId(next.defaultProfileId);
    setWeekday(next.weekday);
    setSelectedId(next.profiles[0].id);
    setErr(null);
  }

  function requestClose() {
    if (saving) return;
    onClose();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await updateGoals(configOf());
      onClose();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
      setSaving(false);
    }
  }

  const multi = profiles.length > 1;

  const content = (
    <div className="flex flex-col gap-4 text-white">
      {/* 1. Profile Tabs Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {profiles.map((p, i) => {
          const isSelected = p.id === selected.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold transition-all whitespace-nowrap active:scale-95 ${
                isSelected
                  ? "bg-white text-black shadow-md"
                  : "border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10"
              }`}
            >
              <span aria-hidden>{profileIcon(p.id)}</span>
              <span>{p.name.trim() ? profileDisplayName(p, t) : t("goals.unnamed")}</span>
              {invalid[i] !== null && <span className="text-red-400 font-extrabold">•</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={addProfile}
          className="flex items-center gap-1 px-3.5 py-2 rounded-full text-xs font-bold border border-dashed border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition whitespace-nowrap active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> {t("goals.addProfile")}
        </button>
      </div>

      {/* 2. Selected Profile Info Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="text-xs font-semibold text-white/80 block mb-1">
              {t("goals.profileName")}
            </span>
            <input
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-sm font-semibold text-white focus:border-amber-400 focus:outline-none"
              value={profileNameFieldValue(selected, t, nameEdited[selected.id] === true)}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </label>
          {multi && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDefaultId(selected.id)}
                disabled={defaultId === selected.id}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 disabled:opacity-40 transition"
              >
                {defaultId === selected.id ? t("goals.defaultBadge") : t("goals.makeDefault")}
              </button>
              <button
                type="button"
                onClick={removeSelected}
                className="p-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                title={t("goals.deleteProfile")}
                aria-label={t("goals.deleteProfile")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Nutrition Fields Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold text-white">{t("goals.nutritionGoals")}</h4>
        </div>
        <NutritionFields
          draft={selected.nutrition}
          onChange={(nutrition) => patchSelected({ nutrition })}
        />
      </div>

      {/* 4. Weekly Plan Card (Multi Profiles) */}
      {multi && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-bold text-white">{t("goals.weeklyAssignments")}</h4>
          </div>
          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {WEEK_ORDER.map((dow) => {
              const p =
                profiles.find((x) => x.id === weekday[dow]) ??
                profiles.find((x) => x.id === defaultId) ??
                profiles[0];
              const isSel = p.id === selected.id;
              return (
                <button
                  key={dow}
                  type="button"
                  onClick={() => cycleWeekday(dow)}
                  title={`${dowNames[dow]} · ${profileDisplayName(p, t)}`}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition active:scale-95 ${
                    isSel
                      ? "border-amber-400/50 bg-amber-400/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  }`}
                >
                  <span className="text-[10px] font-bold font-mono text-white/60">
                    {dowNames[dow]}
                  </span>
                  <span className="text-sm" aria-hidden>
                    {profileIcon(p.id)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-white/50">{t("goals.weekdayTapHint")}</p>
        </div>
      )}

      {/* 5. Workout / Rest Day Auto Split Card */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-sm font-bold text-white">{t("goals.trainingSplitTitle")}</h4>
          </div>
          <span className="text-xs font-bold text-amber-300 font-mono">
            {t("goals.trainingDays", { count: trainingDays })}
          </span>
        </div>
        <p className="text-xs text-white/70">{t("goals.trainingSplitDesc")}</p>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {TRAINING_DAY_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTrainingDays(n)}
              className={`w-9 h-9 rounded-full font-mono text-xs font-extrabold transition-all shrink-0 active:scale-95 ${
                n === trainingDays
                  ? "bg-amber-400 text-black shadow"
                  : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={applySuggested}
          className="w-full py-3 rounded-full bg-amber-400 text-black font-extrabold text-xs hover:bg-amber-300 transition shadow-md active:scale-[0.98] flex items-center justify-center gap-1.5"
        >
          <Award className="w-4 h-4" /> {t("goals.applySuggested")}
        </button>
      </div>

      {firstInvalid !== -1 && (
        <p className="text-xs font-bold text-red-400">
          {profiles[firstInvalid].name.trim()
            ? profileNameFieldValue(
                profiles[firstInvalid],
                t,
                nameEdited[profiles[firstInvalid].id] === true,
              )
            : t("goals.unnamed")}
          : {invalid[firstInvalid]}
        </p>
      )}
      {err && <ErrorText>{err}</ErrorText>}

      {/* Save Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving}
          className="w-full py-3.5 rounded-full bg-white text-black font-extrabold text-sm hover:bg-white/90 transition shadow-lg active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4 stroke-[3]" /> {saving ? t("meal.saving") : t("meal.save")}
        </button>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <Modal title={t("goals.title")} onClose={requestClose}>
      {content}
    </Modal>
  );
}
