// ============================================================================
// Nutrimind — hedef profili düzenleyicisi (Faz 8).
//
// Eskiden tek bir besin formuydu; artık gün tipli hedefleri yönetiyor:
// profil sekmeleri + haftalık gün ataması + "önerilen ayarı uygula".
//
// TÜM DÜZENLEME YEREL TASLAKTA yapılır ve tek "Kaydet" ile yazılır. Her profilin
// besin alanları AYRI bir metin taslağında tutuluyor (sekme değiştirmek yarım
// yazılmış bir sayıyı kaybetmesin, ve doğrulama görünmeyen profilleri de kapsasın
// — bozuk bir profili sessizce kaydetmek backend'den 400 döndürürdü).
// ============================================================================
import { useState } from "react";
import { Modal } from "./Modal";
import {
  ErrorText,
  FormActions,
  Label,
  NutritionFields,
  draftNum,
  fieldCls,
  fromDraft,
  toDraft,
} from "./FormBits";
import type { NutritionDraft } from "./FormBits";
import { useData } from "../lib/data";
import { WEEKDAY_SHORT } from "../lib/format";
import {
  applySuggestion,
  defaultProfile,
  profileIcon,
  trainingDayCount,
} from "../lib/goals";
import { NUTRIENTS } from "../lib/nutrients";
import type { GoalConfig } from "../types";

interface ProfileDraft {
  id: string;
  name: string;
  nutrition: NutritionDraft;
}

/** Haftanın günleri Pazartesi'den başlar (kullanıcının okuduğu sıra), ama
 *  `weekday` anahtarları 0=Pazar sözleşmesinde (bkz. `weekdayIndex`). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TRAINING_DAY_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7];

function newProfileId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function toProfileDrafts(config: GoalConfig): ProfileDraft[] {
  return config.profiles.map((p) => ({ id: p.id, name: p.name, nutrition: toDraft(p.nutrition) }));
}

/** Bir profilin besin alanları geçerli mi.
 *  Kural Faz 2'den beri aynı: `kcal > 0`; diğerleri `>= 0` (0 geçerli, ör. lif
 *  takip edilmiyor); BOŞ MİKRO kutusu "limit yok" demek ve kaydı engellemez. */
function profileErrorOf(p: ProfileDraft): string | null {
  if (p.name.trim() === "") return "Profil adı boş olamaz.";
  if (!(draftNum(p.nutrition, "kcal") > 0)) return "Kalori hedefi 0'dan büyük olmalı.";
  for (const def of NUTRIENTS) {
    if (def.key === "kcal") continue;
    if (def.group === "micro" && (p.nutrition[def.key] ?? "").trim() === "") continue;
    if (draftNum(p.nutrition, def.key) < 0) return `${def.label} negatif olamaz.`;
  }
  return null;
}

export function GoalsForm({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const { goals, updateGoals } = useData();

  const [profiles, setProfiles] = useState<ProfileDraft[]>(() => toProfileDrafts(goals));
  const [defaultId, setDefaultId] = useState<string>(() => defaultProfile(goals).id);
  const [weekday, setWeekday] = useState<Record<number, string>>(() => ({ ...goals.weekday }));
  // Günlük istisnalar burada düzenlenmiyor (onlar rozetin işi) ama KAYBOLMAMALI:
  // kayıt gövdesine aynen geri konur.
  const [overrides] = useState<Record<string, string>>(() => ({ ...goals.overrides }));
  const [selectedId, setSelectedId] = useState<string>(() => defaultProfile(goals).id);
  const [trainingDays, setTrainingDays] = useState<number>(() => {
    const n = trainingDayCount(goals);
    // Henüz gün tipi kurmamış kullanıcı için makul bir başlangıç.
    return n > 0 ? n : 4;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0];
  const invalid = profiles.map(profileErrorOf);
  const firstInvalid = invalid.findIndex((e) => e !== null);
  const canSave = firstInvalid === -1;

  /** Formun o anki hâlinden gövdeyi kurar — hem kayıt hem öneri tabanı için. */
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

  function addProfile() {
    // Yeni profil seçili profilin kopyasıyla başlar: sıfırdan 8 kutu doldurmak
    // yerine "şunun gibi ama biraz farklı" yapmak istenen normal durum.
    const id = newProfileId();
    setProfiles([...profiles, { id, name: `Profil ${profiles.length + 1}`, nutrition: { ...selected.nutrition } }]);
    setSelectedId(id);
  }

  function removeSelected() {
    if (profiles.length < 2) return;
    const rest = profiles.filter((p) => p.id !== selected.id);
    const nextDefault = defaultId === selected.id ? rest[0].id : defaultId;
    // Silinen profile bakan gün atamaları varsayılana çevrilir. (Çözümleme
    // katmanı bayat kimliği zaten tolere ediyor; burada temizlemek formun
    // gösterdiği ile gerçeğin aynı kalmasını sağlıyor.)
    const nextWeekday: Record<number, string> = {};
    for (const [dow, id] of Object.entries(weekday)) {
      nextWeekday[Number(dow)] = id === selected.id ? nextDefault : id;
    }
    setProfiles(rest);
    setDefaultId(nextDefault);
    setWeekday(nextWeekday);
    setSelectedId(rest[0].id);
  }

  /** Gün rozetine dokunuş: sıradaki profile geçer. */
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

  /** Kayıt uçarken kapanmayı engelle: yazma sunucuya düşerken vazgeçilmiş sanılmasın. */
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
      <div className="flex flex-col gap-4">
        {/* --- profil sekmeleri ------------------------------------------- */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {profiles.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`flex flex-none items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-bold transition ${
                p.id === selected.id
                  ? "bg-memory text-memory-ink"
                  : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
              }`}
            >
              <span aria-hidden>{profileIcon(p.id)}</span>
              {p.name.trim() || "adsız"}
              {invalid[i] !== null && <span className="text-danger">•</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={addProfile}
            className="flex-none rounded-pill border border-dashed border-line px-3 py-1.5 text-xs font-bold text-ink-tertiary transition hover:text-ink-primary"
          >
            + Profil
          </button>
        </div>

        {/* --- seçili profil ---------------------------------------------- */}
        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <Label>Profil adı</Label>
            <input
              className={fieldCls}
              value={selected.name}
              onChange={(e) => patchSelected({ name: e.target.value })}
            />
          </label>
          {multi && (
            <div className="flex flex-none gap-2 pb-1">
              <button
                type="button"
                onClick={() => setDefaultId(selected.id)}
                disabled={defaultId === selected.id}
                className="rounded-pill border border-line px-3 py-1.5 text-[11px] font-semibold text-ink-tertiary transition hover:text-ink-primary disabled:opacity-40"
              >
                {defaultId === selected.id ? "varsayılan" : "varsayılan yap"}
              </button>
              <button
                type="button"
                onClick={removeSelected}
                className="rounded-pill bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-ink-tertiary transition hover:text-danger"
              >
                Sil
              </button>
            </div>
          )}
        </div>

        <NutritionFields
          draft={selected.nutrition}
          onChange={(nutrition) => patchSelected({ nutrition })}
        />

        {/* --- haftalık plan ---------------------------------------------- */}
        {multi && (
          <div className="rounded-chip border border-line bg-white/[0.02] p-3">
            <Label>Haftalık plan</Label>
            <div className="mt-1 flex gap-1">
              {WEEK_ORDER.map((dow) => {
                const p = profiles.find((x) => x.id === weekday[dow]) ?? profiles.find((x) => x.id === defaultId) ?? profiles[0];
                const isSel = p.id === selected.id;
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => cycleWeekday(dow)}
                    title={`${WEEKDAY_SHORT[dow]} · ${p.name}`}
                    className={`flex flex-1 flex-col items-center gap-0.5 rounded-chip border px-0.5 py-1.5 transition ${
                      isSel ? "border-memory/50 bg-memory/10" : "border-line bg-white/[0.04] hover:bg-white/[0.07]"
                    }`}
                  >
                    <span className="font-mono text-[10px] font-bold text-ink-secondary">
                      {WEEKDAY_SHORT[dow]}
                    </span>
                    <span className="text-sm leading-none" aria-hidden>
                      {profileIcon(p.id)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              Bir güne dokun → sıradaki profile geçer. Tek bir günü değiştirmek için günlük
              görünümdeki rozeti kullan.
            </p>
          </div>
        )}

        {/* --- öneri ------------------------------------------------------- */}
        <div className="rounded-chip border border-line bg-white/[0.02] p-3">
          <Label>Antrenman / dinlenme ayrımı</Label>
          <p className="mb-2 text-[11px] text-ink-tertiary">
            Haftada kaç gün spora gidiyorsun?
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {TRAINING_DAY_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTrainingDays(n)}
                className={`h-8 w-8 flex-none rounded-pill font-mono text-xs font-bold transition ${
                  n === trainingDays
                    ? "bg-memory text-memory-ink"
                    : "border border-line bg-white/[0.06] text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={applySuggested}
            className="mt-2 w-full rounded-pill border border-memory/40 bg-memory/10 px-3 py-2 text-xs font-extrabold text-memory transition hover:bg-memory/20"
          >
            Önerilen ayarı uygula
          </button>
          <p className="mt-2 text-[11px] text-ink-faint">
            Haftalık ortalaman aynı kalır; yalnızca kalori ve karbonhidrat gün tipine göre
            dağıtılır. Protein, lif ve mikro limitler iki günde de aynıdır. Hepsini
            düzenleyebilirsin.
          </p>
        </div>

        {firstInvalid !== -1 && (
          <p className="text-[11px] text-warn">
            {profiles[firstInvalid].name.trim() || "adsız"}: {invalid[firstInvalid]}
          </p>
        )}
        {err && <ErrorText>{err}</ErrorText>}
      </div>
  );

  const actions = <FormActions onCancel={requestClose} onSave={save} saving={saving} disabled={!canSave} />;

  if (embedded)
    return (
      <div className="flex flex-col gap-4">
        {content}
        {actions}
      </div>
    );

  return (
    <Modal title="Günlük hedefler" onClose={requestClose} footer={actions}>
      {content}
    </Modal>
  );
}
