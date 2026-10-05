import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  deleteAlias,
  deleteDay,
  fetchData,
  saveAlias,
  saveConfig,
  saveDay,
  saveGoals,
} from "./api";
import type { AliasPayload, AppData } from "./api";
import type { GoalConfig, MealPayload } from "../types";
import { buildUsageIndex, type UsageIndex } from "./aliasRank";
import { buildTemplateUsageIndex, type TemplateUsageIndex } from "./templates";
import { AppSkeleton } from "../components/Skeleton";
import { getSnapshot, listOperations, putSnapshot } from "./offlineCache";
import type { OfflineOperation } from "./offlineCache";
import { isNetworkError, projectOperations } from "./offlineProjection";
import {
  cancelOperation,
  getSyncState,
  queueAlias,
  queueDay,
  queueDeleteAlias,
  queueDeleteDay,
  resolveConflict,
  retryOperation,
  subscribeSyncState,
  syncPending,
} from "./offlineSync";
import type { SyncState } from "./offlineSync";
import { SyncStatus } from "../components/SyncStatus";
import { useTranslation } from "react-i18next";

/** Yazma aksiyonları — online'da "API çağır → veriyi yeniden çek", offline'da
 *  "kuyruğa al → projeksiyonu güncelle" desenini izler. */
export interface Actions {
  refresh: () => Promise<void>;
  /** Günün tüm öğünlerini değiştirir; dizi boşsa günü siler. */
  setDayMeals: (date: string, meals: MealPayload[]) => Promise<void>;
  /** Hedef yapılandırmasının TAMAMINI değiştirir (profiller + haftalık şablon +
   *  günlük istisnalar) — gün yazımıyla aynı "tümünü değiştir" deseni. */
  updateGoals: (goals: GoalConfig) => Promise<void>;
  /** Yazılan/güncellenen alias'ın id'sini DÖNER (Faz S3: ScanSheet aynı anda
   *  hem alias hem öğün yazdığında `MealSource.aliasId` için gerekli —
   *  backend id'yi biz istemeden üretiyor, geri dönmezse kaybolur).
   *  Offline'da dönen id `local:...` biçimindedir; senkron sırasında gerçek
   *  sunucu id'sine çevrilir. */
  upsertAlias: (alias: AliasPayload) => Promise<string>;
  removeAlias: (id: string) => Promise<void>;
  /** Genel config anahtarı yazar (Faz 2a) — su/takviye/şablon fazları bunu kullanacak. */
  updateConfig: (key: string, value: Record<string, unknown>) => Promise<void>;
}

type Ctx = AppData & Actions & {
  usageIndex: UsageIndex;
  templateUsageIndex: TemplateUsageIndex;
  offline: boolean;
};

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const d = useContext(DataCtx);
  // i18n-exempt: geliştirici hatası — kullanıcı arayüzüne çıkmaz
  if (!d) throw new Error("DataProvider bulunamadı");
  return d;
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[45vh] place-items-center text-center text-sm text-ink-tertiary">
      {children}
    </div>
  );
}

function StaleFallback({
  refresh,
  onResolved,
}: {
  refresh: () => Promise<void>;
  onResolved: () => void;
}) {
  const { t } = useTranslation();
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
        {/* Kayıt başarılı, yalnızca yenileme başarısız — "kaydedilemedi" izlenimi vermemek için ayrı mesaj. */}
        <p className="max-w-xs">{t("offline.refreshFailed")}</p>
        <button
          type="button"
          disabled={retrying}
          onClick={handleRetry}
          className="rounded-chip border border-line bg-white/[0.08] px-4 py-2 text-xs font-semibold text-ink-primary transition hover:bg-white/[0.12] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          {retrying ? t("offline.refreshing") : t("offline.opRetry")}
        </button>
      </div>
    </Center>
  );
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // Sunucudan son doğrulanmış veri (ya da offline'da son cache snapshot'ı).
  const [server, setServer] = useState<AppData | null>(null);
  // Bekleyen offline operasyonlar (IndexedDB'deki kuyruğun aynası).
  const [ops, setOps] = useState<OfflineOperation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Yazma başarılı olduktan sonra yenileme başarısız olduysa true: elimizdeki
  // veri bayat, üstüne yazmak veri kaybettirir.
  const [stale, setStale] = useState(false);
  // Çevrimdışı durumda son görülen cache gösteriliyor: banner + retry UI için.
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(getSyncState());

  const refresh = useCallback(async () => {
    const d = await fetchData();
    setServer(d);
    // Başarılı fetch → cache'e SADECE sunucu verisini yaz (projeksiyon değil —
    // kuyruk ayrı tutulur, karıştırılırsa offline açılışta çifte uygulanır).
    void putSnapshot(d);
    setOffline(false);
  }, []);

  // Online gelince: önce kuyruğu boşalt (sync), sonra veriyi tazele.
  const syncAndRefresh = useCallback(async () => {
    try {
      await syncPending();
    } finally {
      try {
        await refresh();
      } catch {
        // Çevrimdışı kalındı — banner retry ile kullanıcı tekrar dener.
      }
    }
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let queued: OfflineOperation[] = [];
      try {
        queued = await listOperations();
      } catch {
        // IndexedDB yok (private mode vb.) — kuyruk boş sayılır, uygulama eskisi gibi davranır.
      }
      if (!alive) return;
      setOps(queued);
      try {
        const d = await fetchData();
        if (!alive) return;
        setServer(d);
        void putSnapshot(d);
        setOffline(false);
        // Yeniden açılışta kuyrukta iş varsa otomatik senkron.
        if (queued.length > 0) void syncAndRefresh();
      } catch (e) {
        if (!alive) return;
        // Offline: son cache'i dene. Bulunamazsa orijinal hata.
        const snap = await getSnapshot();
        if (snap) {
          setServer(snap.data);
          setOffline(true);
          setCachedAt(snap.cachedAt);
        } else {
          setErr(String((e as Error)?.message ?? e));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [syncAndRefresh]);

  // navigator.onLine + online/offline event: online olunca sync + otomatik refetch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline = () => {
      setOffline(false);
      void syncAndRefresh();
    };
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [syncAndRefresh]);

  // Sync durumu (senkronize ediliyor / yeniden deneme zamanı) — SyncStatus dinler.
  useEffect(() => subscribeSyncState(setSyncState), []);

  // Her sync tamamlandığında kuyruğu yeniden oku: sync operasyonları kuyruktan
  // düşürürken veya durum değiştirirken bu ayna state taze kalmalı (zamanlayıcı
  // tetiklemeli arka plan sync'leri dahil).
  useEffect(() => {
    if (syncState.syncing) return;
    let alive = true;
    listOperations()
      .then((opsNow) => {
        if (alive) setOps(opsNow);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [syncState.syncing, syncState.lastResult]);

  // Kullanıcının gördüğü veri = sunucu snapshot'ı + bekleyen işlemler.
  // Bu ayrım kritik: sunucu verisine asla dokunulmaz, projeksiyon her zaman
  // kuyruktan yeniden türetilir (mutate → refetch deseninin offline karşılığı).
  const visible = useMemo<AppData | null>(
    () => (server ? projectOperations(server, ops) : null),
    [server, ops],
  );

  const handleRetryOp = useCallback(async (id: string) => {
    await retryOperation(id);
    setOps(await listOperations());
    void syncPending();
  }, []);

  const handleCancelOp = useCallback(async (id: string) => {
    await cancelOperation(id);
    setOps(await listOperations());
  }, []);

  const handleResolveOp = useCallback(async (id: string, choice: "server" | "device") => {
    await resolveConflict(id, choice);
    setOps(await listOperations());
    if (choice === "device") void syncPending();
  }, []);

  /**
   * Ortak yazma yolu (gün + alias): önce online dener. Ağ hatası ise işlemi
   * kuyruğa alır ve projeksiyonu günceller; diğer hatalar (doğrulama, oturum)
   * olduğu gibi yukarı fırlar. Online yazma başarılı olup yalnızca yenileme
   * başarısızsa bayat durumu terminal yapar.
   */
  const offlineAware = useCallback(
    async <T,>(
      write: () => Promise<T>,
      enqueue: (base: AppData) => Promise<unknown>,
      offlineResult?: T,
    ): Promise<T> => {
      try {
        const result = await write();
        try {
          await refresh();
        } catch {
          setStale(true);
          throw new Error(t("offline.refreshFailed"));
        }
        return result;
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        if (!visible) throw error;
        try {
          // base = kullanıcının GÖRDÜĞÜ veri (projeksiyon). Aynı kaynağa dokunan
          // sıralı işlemler birbirini doğru biçimde temel alır.
          await enqueue(visible);
          setOps(await listOperations());
          setOffline(true);
        } catch {
          // Kuyruğa alınamadı (IDB yok / quota dolu) — sessizce kaybolmamalı.
          throw new Error(t("offline.queueFailed"));
        }
        return offlineResult as T;
      }
    },
    [refresh, visible, t],
  );

  const actions = useMemo<Actions>(
    () => ({
      refresh,
      setDayMeals: (date, meals) =>
        offlineAware(
          async () => {
            if (meals.length === 0) await deleteDay(date);
            else await saveDay(date, meals);
          },
          (base) => (meals.length === 0 ? queueDeleteDay(base, date) : queueDay(base, date, meals)),
        ),
      updateGoals: async (goals) => {
        if (offline) throw new Error(t("offline.writeUnavailable"));
        await saveGoals(goals);
        try {
          await refresh();
        } catch {
          setStale(true);
          throw new Error(t("offline.refreshFailed"));
        }
      },
      upsertAlias: (alias) => {
        // Yerel alias düzenleniyorsa AYNI localId korunur; yeni alias ise üretilir;
        // gerçek (sunucu) id ile güncelleme ise localId'siz gider.
        const localId =
          alias.id && !alias.id.startsWith("local:")
            ? undefined
            : (alias.id ?? `local:${crypto.randomUUID()}`);
        return offlineAware(
          () => saveAlias(alias).then((r) => r.id),
          (base) => queueAlias(base, alias, localId),
          localId as string,
        );
      },
      removeAlias: (id) =>
        offlineAware(
          async () => {
            await deleteAlias(id);
          },
          (base) => queueDeleteAlias(base, id),
        ),
      updateConfig: async (key, value) => {
        if (offline) throw new Error(t("offline.writeUnavailable"));
        await saveConfig(key, value);
        try {
          await refresh();
        } catch {
          setStale(true);
          throw new Error(t("offline.refreshFailed"));
        }
      },
    }),
    [refresh, offlineAware, offline, t],
  );

  const usageIndex = useMemo<UsageIndex>(() => {
    if (!visible) return new Map();
    return buildUsageIndex(visible.days, visible.goals);
  }, [visible]);

  /** "En çok kullanılan 3 şablon" sıralamasının kaynağı — `usageIndex`'in
   *  şablon karşılığı ama `goals`'a bağlı değil: şablon kullanımı hafta günü
   *  ya da profil ile ilgili değil, yalnız kaç kez kullanıldığı. */
  const templateUsageIndex = useMemo<TemplateUsageIndex>(() => {
    if (!visible) return new Map();
    return buildTemplateUsageIndex(visible.days);
  }, [visible]);

  const value = useMemo<Ctx | null>(
    () => (visible ? { ...visible, ...actions, usageIndex, templateUsageIndex, offline } : null),
    [visible, actions, usageIndex, templateUsageIndex, offline],
  );

  if (stale) return <StaleFallback refresh={refresh} onResolved={() => setStale(false)} />;
  if (err)
    return (
      <Center>
        <div className="flex flex-col items-center gap-3 p-4">
          <p>{t("offline.fetchError", { error: err })}</p>
          <button
            type="button"
            onClick={() => {
              setErr(null);
              void refresh();
            }}
            className="rounded-chip border border-line bg-white/[0.08] px-4 py-2 text-xs font-semibold text-ink-primary transition hover:bg-white/[0.12] active:scale-95"
          >
            {t("offline.bannerRetry")}
          </button>
        </div>
      </Center>
    );
  if (!value) return <AppSkeleton />;
  return (
    <>
      <SyncStatus
        offline={offline}
        cachedAt={cachedAt}
        ops={ops}
        syncState={syncState}
        onSyncNow={() => void syncAndRefresh()}
        onRetryOp={(id) => void handleRetryOp(id)}
        onCancelOp={(id) => void handleCancelOp(id)}
        onResolveOp={(id, choice) => void handleResolveOp(id, choice)}
      />
      <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
    </>
  );
}
