// ============================================================================
// Nutrimind — Ayarlar → Egzersiz Kütüphanesi (alt görünüm).
//
// Bu ekran TEK iş yapar: kullanıcının kendi egzersizlerini `config.exercise`
// satırının `catalog` alanında yönetmek. GÖMÜLÜ 13 egzersiz burada BİLEREK
// gösterilmez — onlar kodda yaşar ve Egzersiz ekranında zaten listelenir; iki
// yerde de göstermek "hangileri benim, hangileri gömülü?" karışıklığı üretir.
// Boş katalogda tek mesaj görünür.
//
// İKİ YÖNLÜ CONFIG KORUMASI — sessiz veri kaybının tek kaynağı burada:
//   · `config.exercise` TEK bir config satırı; `PUT /api/config/<key>` satırın
//     TAMAMINI değiştiriyor. Yalnız `{catalog}` yazmak `entries`'i (günlük
//     egzersiz kayıtları) silerdi, tersi de `catalog`'u silerdi.
//   · `catalogWrite` bunu `existingExerciseConfig` ile hallediyor: o yardımcı
//     mevcut nesneyi KOPYALAYIP yayıyor (referans dönmüyor) ve `ExerciseModal`
//     günlük kayıt yazarken de aynı yardımcıyı kullanıyor. İki yön tek
//     yardımcıda buluşuyor → katalog da entries de yaşar.
// ============================================================================
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useData } from "../lib/data";
import { ConfirmButton, ErrorText, TextField, fieldCls } from "./FormBits";
import {
  EXERCISE_CONFIG_KEY,
  metFor,
  newCatalogId,
  parseCatalog,
} from "../lib/exercise";
import type { CatalogEntry } from "../lib/exercise";
import type { ExerciseCategory } from "../types";
import { formatNumber } from "../lib/format";
import { existingExerciseConfig } from "./ExerciseModal";

/** `ExerciseCategory`'nin TAMAMENİ — genişletilmedi. Kategori yalnız MET
 *  tablosunun (ve kullanıcının bir sonraki seansta hangi tahmini alacağının)
 *  anahtarı; `Exercise.category` alanı zaten ölü bir alan. */
export const CATEGORIES = ["run", "weights", "walk", "swim", "cycle", "custom"] as const;

/** Kategori → i18n anahtarı. Anahtarlar `ExerciseModal`'daki gömülü
 *  formun AYNI anahtarlarıdır; kullanıcı aynı kelimeleri iki ekranda da görür. */
const CATEGORY_KEYS: Record<(typeof CATEGORIES)[number], string> = {
  run: "exercise.categoryRun",
  weights: "exercise.categoryWeights",
  walk: "exercise.categoryWalk",
  swim: "exercise.categorySwim",
  cycle: "exercise.categoryCycle",
  custom: "exercise.categoryCustom",
};

/** ÜST SINIR 30 MET: Compendium'un en yüksek gerçek değeri ~20. Üstü zaten
 *  kullanıcının kastettiği bir şey değil; sınırsız bırakılırsa tek bir
 *  kazara yazım (ör. 1e308) `burnedKcal`'ı Infinity yapıp sonraki kaydı
 *  `parseExerciseItem`'in reddettiği bir calorie ile bozardı. */
export const MAX_MET = 30;

/** MET girdisi → sayı. `null` = "boş ya da kullanılamaz".
 *
 *  Boş dönmesi HATA DEĞİL, bir seçenek: alanı boş bırakmak "şiddeti bilmiyorum,
 *  ortalamaya göre hesapla" demektir (bkz. `buildCatalogEntry`). Bu yüzden
 *  ayrı bir "geçersiz" yolu yok — `buildCatalogEntry` yine de `metFor`'a düşer,
 *  ama sadece `null`'a düşen gerçekten bozuk bir girdiyi de sessizce yutmak
 *  yerine ölçülebilir tutmak için `parseMetInput` sayısal sınırları KORUR.
 *
 *  Virgül kabul edilir (`4,3`) — Türkiye'de olağan yazım. */
export function parseMetInput(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!cleaned) return null;
  const met = Number(cleaned);
  if (!Number.isFinite(met) || met <= 0 || met > MAX_MET) return null;
  return met;
}

/** Form satırı → katalog girdisi. `null` = kayıt YAZILMAZ (adsız giriş).
 *
 *  MET boşsa `metFor(category)` UYGULANIR ve burada kesin uygulanır: sonraki
 *  adımda yazılan `catalog`u okuyan `parseCatalog`, `met <= 0` olan satırı
 *  SESSİZCE düşürür — kullanıcı kaydetti sanır, reload'da girdi yoktur. */
export function buildCatalogEntry(
  name: string,
  category: ExerciseCategory,
  metText: string,
): CatalogEntry | null {
  const trimmedName = name.trim();
  if (!trimmedName) return null;
  const met = parseMetInput(metText);
  return {
    id: newCatalogId(),
    name: trimmedName,
    category,
    met: met ?? metFor(category),
  };
}

/** Yazılacak `config.exercise` satırı: mevcut satırın KOPYASI + yeni katalog.
 *
 *  `[...next]` kopyası şart: çağıran `next` dizisini sonradan boşaltırsa
 *  (katalogu silen bir filtre) yazılmış satır da sessizce değişmesin —
 *  canlı config'e bağlı bir referansın sızması Task 4'te gerçek bir hataydı. */
export function catalogWrite(config: unknown, next: CatalogEntry[]): Record<string, unknown> {
  return { ...existingExerciseConfig(config), catalog: [...next] };
}

export function ExerciseSettings() {
  const { t } = useTranslation();
  const { config, updateConfig } = useData();
  const catalog = parseCatalog(config[EXERCISE_CONFIG_KEY]);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("custom");
  const [met, setMet] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Tek yazma yolu. Silme de buradan geçer — iki ayrı yol, biri `entries`'i
   *  unutan bir eklenti yazmak için. */
  async function write(next: CatalogEntry[]) {
    await updateConfig(EXERCISE_CONFIG_KEY, catalogWrite(config, next));
  }

  async function handleAdd() {
    const entry = buildCatalogEntry(name, category, met);
    if (!entry) {
      setErr(t("exercise.catalogNameRequired"));
      return;
    }
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      await write([...catalog, entry]);
      setName("");
      setMet("");
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  /** Silme yalnız katalogu düşürür. Geçmiş günlük kayıtlara DOKUNMAZ:
   *  `Exercise` kendi `caloriesBurned`'ını taşır (dondurulmuş gerçek) ve
   *  preset'e/katalog id'sine zorunlu referansı yok — bu bilinçli tasarım. */
  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);

    try {
      await write(catalog.filter((item) => item.id !== id));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* --- Kayıtlı egzersizler --- */}
      <div className="flex flex-col gap-2.5">
        <h4 className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
          {t("exercise.catalogListTitle", { count: catalog.length })}
        </h4>

        {catalog.length === 0 ? (
          <p className="text-xs text-ink-tertiary">{t("exercise.catalogEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {catalog.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-chip border border-line bg-white/[0.03] p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2 min-w-0">
                  <span className="font-semibold text-ink-primary">{item.name}</span>
                  <span className="font-mono text-xs text-ink-tertiary">
                    {t(CATEGORY_KEYS[item.category as (typeof CATEGORIES)[number]])} ·{" "}
                    {formatNumber(item.met, 1)} MET
                  </span>
                </div>
                <ConfirmButton
                  onConfirm={() => handleDelete(item.id)}
                  disabled={busy}
                  label={t("common.delete")}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Yeni egzersiz ekleme --- */}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <h4 className="font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
          {t("exercise.catalogAddTitle")}
        </h4>

        <TextField
          label={t("exercise.catalogNameLabel")}
          value={name}
          onChange={(v) => {
            setName(v);
            if (err) setErr(null);
          }}
          placeholder={t("exercise.catalogNamePlaceholder")}
        />

        <div className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
            {t("exercise.categoryLabel")}
          </span>
          <select
            className={fieldCls}
            value={category}
            onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(CATEGORY_KEYS[c])}
              </option>
            ))}
          </select>
        </div>

        {/* MET burada AÇIK (ExerciseModal'da gizli): katalog bir sonraki seansta
            kullanılacak, kullanıcı "bu işin MET'si şu" bilmek isteyebilir. */}
        <div className="block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-mono text-ink-tertiary">
            {t("exercise.metLabel")}
          </span>
          <input
            className={`${fieldCls} font-mono`}
            inputMode="decimal"
            value={met}
            onChange={(e) => {
              setMet(e.target.value);
              if (err) setErr(null);
            }}
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            {t("exercise.metHint", { estimate: formatNumber(metFor(category), 1) })}
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy || !name.trim()}
            className="rounded-pill bg-accent px-4 py-2 text-xs font-extrabold text-accent-ink transition disabled:opacity-40"
          >
            {busy ? "…" : `+ ${t("common.add")}`}
          </button>
        </div>
      </div>

      {err && <ErrorText>{err}</ErrorText>}
    </div>
  );
}