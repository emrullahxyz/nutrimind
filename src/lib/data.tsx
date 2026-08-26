import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { deleteAlias, deleteDay, fetchData, saveAlias, saveConfig, saveDay, saveGoals } from "./api";
import type { AliasPayload, AppData } from "./api";
import type { GoalConfig, MealPayload } from "../types";
import { buildUsageIndex, type UsageIndex } from "./aliasRank";
import { AppSkeleton } from "../components/Skeleton";
import { getSnapshot, putSnapshot } from "./offlineCache";

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

type Ctx = AppData & Actions & { usageIndex: UsageIndex };

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

function StaleFallback({ refresh, onResolved }: { refresh: () => Promise<void>; onResolved: () => void }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refresh();
      onResolved();
    } catch {
      // Yenileme tekrar başarısız oldu, kullanıcı yeniden deneyebilir
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Center>
      <div className="flex flex-col items-center gap-3 p-4">
        <p className="max-w-xs">{REFRESH_AFTER_WRITE_FAILED_MESSAGE}</p>
        <button
          type="button"
          disabled={retrying}
          onClick={handleRetry}
          className="rounded-chip border border-line bg-white/[0.08] px-4 py-2 text-xs font-semibold text-ink-primary transition hover:bg-white/[0.12] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          {retrying ? "Yenileniyor..." : "Tekrar dene"}
        </button>
      </div>
    </Center>
  );
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Yazma başarılı olduktan sonra yenileme başarısız olduysa true: elimizdeki
  // veri bayat, üstüne yazmak veri kaybettirir.
  const [stale, setStale] = useState(false);
  // Çevrimdışı durumda son görülen cache gösteriliyor: banner + retry UI için.
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await fetchData();
    setData(d);
    // Başarılı fetch → cache'e yaz ve offline bayrağını kaldır.
    void putSnapshot(d);
    setOffline(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchData()
      .then((d) => {
        if (!alive) return;
        setData(d);
        void putSnapshot(d);
      })
      .catch(async (e) => {
        if (!alive) return;
        // Offline: son cache'i dene. Bulunamazsa orijinal hata.
        const snap = await getSnapshot();
        if (snap) {
          setData(snap.data);
          setOffline(true);
          setCachedAt(snap.cachedAt);
        } else {
          setErr(String(e?.message ?? e));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // navigator.onLine + online/offline event: online olunca otomatik refetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline = () => {
      setOffline(false);
      void refresh();
    };
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh]);

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

  const usageIndex = useMemo<UsageIndex>(() => {
    if (!data) return new Map();
    return buildUsageIndex(data.days, data.goals);
  }, [data?.days, data?.goals]);

  const value = useMemo<Ctx | null>(
    () => (data ? { ...data, ...actions, usageIndex } : null),
    [data, actions, usageIndex],
  );

  if (stale) return <StaleFallback refresh={refresh} onResolved={() => setStale(false)} />;
  if (err)
    return (
      <Center>
        <div className="flex flex-col items-center gap-3 p-4">
          <p>Veri alınamadı ({err}). Sunucu çalışıyor mu?</p>
          <button
            type="button"
            onClick={() => {
              setErr(null);
              void refresh();
            }}
            className="rounded-chip border border-line bg-white/[0.08] px-4 py-2 text-xs font-semibold text-ink-primary transition hover:bg-white/[0.12] active:scale-95"
          >
            Tekrar dene
          </button>
        </div>
      </Center>
    );
  if (!value) return <AppSkeleton />;
  return (
    <>
      {offline && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-100"
        >
          <span>
            Çevrimdışısınız. Son veri:{" "}
            {cachedAt
              ? new Date(cachedAt).toLocaleString("tr-TR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  day: "2-digit",
                  month: "2-digit",
                })
              : "bilinmiyor"}
            . Değişiklikler kaydedilmez.
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
          >
            Yeniden Dene
          </button>
        </div>
      )}
      <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
    </>
  );
}
