import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { deleteAlias, deleteDay, fetchData, saveAlias, saveConfig, saveDay, saveGoals } from "./api";
import type { AliasPayload, AppData } from "./api";
import type { GoalConfig, MealPayload } from "../types";
import { AppSkeleton } from "../components/Skeleton";

/** Yazma aksiyonları — hepsi "API çağır → veriyi yeniden çek" desenini izler. */
export interface Actions {
  refresh: () => Promise<void>;
  /** Günün tüm öğünlerini değiştirir; dizi boşsa günü siler. */
  setDayMeals: (date: string, meals: MealPayload[]) => Promise<void>;
  /** Hedef yapılandırmasının TAMAMINI değiştirir (profiller + haftalık şablon +
   *  günlük istisnalar) — gün yazımıyla aynı "tümünü değiştir" deseni. */
  updateGoals: (goals: GoalConfig) => Promise<void>;
  /** Yazılan/güncellenen alias'ın id'sini DÖNER (Faz S3: ScanSheet aynı anda
   *  hem alias hem öğün yazdığında `MealSource.aliasId` için gerekli —
   *  backend id'yi biz istemeden üretiyor, geri dönmezse kaybolur). */
  upsertAlias: (alias: AliasPayload) => Promise<string>;
  removeAlias: (id: string) => Promise<void>;
  /** Genel config anahtarı yazar (Faz 2a) — su/takviye/şablon fazları bunu kullanacak. */
  updateConfig: (key: string, value: Record<string, unknown>) => Promise<void>;
}

type Ctx = AppData & Actions;

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const d = useContext(DataCtx);
  if (!d) throw new Error("DataProvider bulunamadı");
  return d;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[45vh] place-items-center text-center text-sm text-ink-tertiary">{children}</div>;
}

/**
 * Yazma başarılı olduktan SONRA sadece yenileme (refresh) başarısız olursa
 * gösterilecek mesaj. Kayıt aslında sunucuda başarılı olduğu için "kaydetme
 * başarısız" gibi yanlış bir izlenim vermemek adına ayrı bir mesaj kullanılır.
 */
const REFRESH_AFTER_WRITE_FAILED_MESSAGE = "Kaydedildi, ancak veriler yenilenemedi — sayfayı yenileyin.";

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Yazma başarılı olduktan sonra yenileme başarısız olduysa true: elimizdeki
  // veri bayat, üstüne yazmak veri kaybettirir.
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    setData(await fetchData());
  }, []);

  useEffect(() => {
    let alive = true;
    fetchData()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  // Tüm yazma aksiyonlarının izlediği tek ortak yol: önce yazma işlemini
  // çalıştır (hata varsa olduğu gibi yukarı fırlat), sonra veriyi yenile.
  // Yalnızca yenileme aşaması başarısız olursa, ayırt edilebilir bir hata
  // mesajıyla değiştir — yazma hatasının kendi mesajına asla dokunulmaz.
  // Jenerik <T>: `saveAlias`'ın döndürdüğü {ok, id} gibi bir sonucu da
  // olduğu gibi yukarı taşıyabilsin diye (Faz S3 — bkz. `upsertAlias`).
  const runWriteThenRefresh = useCallback(
    async <T,>(write: () => Promise<T>): Promise<T> => {
      const result = await write();
      try {
        await refresh();
      } catch {
        // Yazma sunucuya işlendi ama elimizdeki veri artık bayat. Gün yazımı
        // günün TAMAMINI değiştirdiği için bayat listeyle yapılacak bir sonraki
        // kayıt/silme, az önce başarılı olan yazmayı sessizce geri alırdı.
        // Bu yüzden bayat durumu terminal yapıyoruz: yenilenene kadar yazma yok.
        setStale(true);
        throw new Error(REFRESH_AFTER_WRITE_FAILED_MESSAGE);
      }
      return result;
    },
    [refresh],
  );

  const actions = useMemo<Actions>(
    () => ({
      refresh,
      setDayMeals: (date, meals) =>
        runWriteThenRefresh(async () => {
          if (meals.length === 0) await deleteDay(date);
          else await saveDay(date, meals);
        }),
      updateGoals: (goals) =>
        runWriteThenRefresh(async () => {
          await saveGoals(goals);
        }),
      upsertAlias: (alias) => runWriteThenRefresh(() => saveAlias(alias)).then((r) => r.id),
      removeAlias: (id) =>
        runWriteThenRefresh(async () => {
          await deleteAlias(id);
        }),
      updateConfig: (key, value) =>
        runWriteThenRefresh(async () => {
          await saveConfig(key, value);
        }),
    }),
    [refresh, runWriteThenRefresh],
  );

  const value = useMemo<Ctx | null>(() => (data ? { ...data, ...actions } : null), [data, actions]);

  if (stale) return <Center>{REFRESH_AFTER_WRITE_FAILED_MESSAGE}</Center>;
  if (err) return <Center>Veri alınamadı ({err}). Sunucu çalışıyor mu?</Center>;
  if (!value) return <AppSkeleton />;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
