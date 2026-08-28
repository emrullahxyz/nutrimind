import { deleteAlias, deleteDay, fetchData, saveAlias, saveDay } from "./api";
import type { AppData, AliasPayload } from "./api";
import type { MealPayload } from "../types";
import {
  enqueueOperation,
  listOperations,
  removeOperation,
  updateOperation,
  type OfflineOperation,
} from "./offlineCache";
import { applyOperation, deepEqual, isNetworkError } from "./offlineProjection";

/** Çift sekme koruması: aynı cihazda ikinci sekmede de uygulama açıksa iki
 *  sekmenin sync'i aynı operasyonu çift göndermesin. Web Locks API tarayıcı
 *  çapında tekil kilit verir; desteklemeyen tarayıcıda mevcut modül-içi lock
 *  yeterli (davranış bugünkü gibi). Node test ortamında `locks` tanımsızdır. */
const SYNC_LOCK_NAME = "nutrimind-sync";

type LockManagerLike = {
  request: <T>(name: string, cb: () => Promise<T>) => Promise<T>;
};

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManagerLike }).locks
      : undefined;
  if (!locks) return fn();
  return locks.request(SYNC_LOCK_NAME, fn);
}

let activeSync: Promise<SyncResult> | null = null;

export type SyncResult = {
  synced: number;
  /** Kuyrukta kalan işlem sayısı (failed + conflict + ağ kesintisi nedeniyle denenemeyenler). */
  pending: number;
  failed: number;
  conflicts: number;
  /** Oturum sona erdi (401) — sync durduruldu, kullanıcı tekrar giriş yapmalı. */
  auth?: boolean;
  /** Ağ/5xx kesintisi nedeniyle kuyruk yarıda kaldı — otomatik geri çekilme planlanır. */
  interrupted?: boolean;
};

/** UI'ın dinlediği canlı sync durumu. */
export type SyncState = {
  syncing: boolean;
  /** Ağ kesintisi sonrası otomatik yeniden deneme zamanı (ISO) — yoksa null. */
  nextRetryAt: string | null;
  lastResult: SyncResult | null;
};

const INITIAL_SYNC_STATE: SyncState = { syncing: false, nextRetryAt: null, lastResult: null };
let syncState: SyncState = { ...INITIAL_SYNC_STATE };
let syncStateListeners: Array<(state: SyncState) => void> = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let backoffStep = 0;

/** Geri çekilme merdiveni: 1s → 2s → 5s → 15s → 30s → 60s (tavan). */
const BACKOFF_LADDER_MS = [1000, 2000, 5000, 15000, 30000, 60000];

function emitSyncState(patch: Partial<SyncState>): void {
  syncState = { ...syncState, ...patch };
  for (const listener of syncStateListeners) listener(syncState);
}

/** UI bileşenleri sync durumunu dinler; dönüş değeri aboneliği kaldırır. */
export function subscribeSyncState(listener: (state: SyncState) => void): () => void {
  syncStateListeners.push(listener);
  listener(syncState);
  return () => {
    syncStateListeners = syncStateListeners.filter((l) => l !== listener);
  };
}

export function getSyncState(): SyncState {
  return syncState;
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

/** Ağ kesintisiyle yarıda kalan sync için üstel geri çekilmeli otomatik deneme. */
function scheduleRetry(): void {
  const delay = BACKOFF_LADDER_MS[Math.min(backoffStep, BACKOFF_LADDER_MS.length - 1)];
  backoffStep = Math.min(backoffStep + 1, BACKOFF_LADDER_MS.length - 1);
  clearRetryTimer();
  emitSyncState({ nextRetryAt: new Date(Date.now() + delay).toISOString() });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncPending();
  }, delay);
}

/** Çakışma mesajı — operasyon `conflict` durumuna alınırken saklanır. */
const CONFLICT_MESSAGE = "Sunucudaki veri bu işlemden sonra değişti — çakışmayı çöz.";

function makeBase(data: AppData): AppData {
  return structuredClone(data);
}

export async function queueDay(
  data: AppData,
  date: string,
  meals: MealPayload[],
): Promise<OfflineOperation> {
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    kind: "save-day",
    date,
    meals,
    base: makeBase(data),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };
  await enqueueOperation(operation);
  return operation;
}

export async function queueDeleteDay(data: AppData, date: string): Promise<OfflineOperation> {
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    kind: "delete-day",
    date,
    base: makeBase(data),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };
  await enqueueOperation(operation);
  return operation;
}

export async function queueAlias(
  data: AppData,
  alias: AliasPayload,
  localId?: string,
): Promise<OfflineOperation> {
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    kind: "save-alias",
    alias,
    localId,
    base: makeBase(data),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };
  await enqueueOperation(operation);
  return operation;
}

export async function queueDeleteAlias(data: AppData, aliasId: string): Promise<OfflineOperation> {
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    kind: "delete-alias",
    aliasId,
    base: makeBase(data),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  };
  await enqueueOperation(operation);
  return operation;
}

/** Yerel alias başarıyla sunucuda gerçek id aldıktan sonra, kuyruktaki tüm
 *  `save-day` işlemlerinin içinde `localId`'ye referans veren `sources[].aliasId`
 *  değerlerini `realId` ile değiştirir ve kuyruğa kalıcı yazar. Bu, sync'in
 *  ortası kesintiye uğrasa bile (alias gönderildi, gün kaldı) gün kaydının
 *  sonraki koşuda başıboş `local:` referansıyla sunucuya gitmemesini garantiler.
 *  IndexedDB hatası burada kritik değil — bir sonraki sync yine `aliasMap`
 *  olmadan `local:` id'yi gönderir; daha kötü bir sonuç doğmaz. */
async function persistLocalIdRemap(localId: string, realId: string): Promise<void> {
  try {
    const operations = await listOperations();
    for (const operation of operations) {
      if (operation.kind !== "save-day") continue;
      const remapped = remapMeals(operation.meals, new Map([[localId, realId]]));
      if (remapped === operation.meals) continue; // eşleşen kaynak yok — yazma yok
      await updateOperation({ ...operation, meals: remapped });
    }
  } catch {
    // sessizce yok say — en kötü senaryo bir sonraki sync'te yine denenir.
  }
}

/** Gönderim öncesi verdict: işlem güvenle gönderilebilir mi, zaten karşılanmış mı,
 *  yoksa sunucu verisi değiştiği için çakışma mı?
 *
 *  Temel ilke: operasyonun kuyruğa alındığı ANDAKİ veri (base) ile şu anki
 *  sunucu görünümü yalnızca İLGİLİ kaynakta karşılaştırılır. Fark varsa işlem
 *  gönderilmez — aksi halde offline veri, sunucudaki daha yeni veriyi ezer. */
function classifyOperation(
  operation: OfflineOperation,
  server: AppData,
): "send" | "satisfied" | "conflict" {
  // Kullanıcı "cihaz sürümünü kullan" dedi (resolveConflict "device") —
  // çakışma denetimi atlanır, işlem sunucuya yazılır (bilinçli üzerine yazma).
  if (operation.force) return "send";
  switch (operation.kind) {
    case "save-day":
      return deepEqual(operation.base.days[operation.date], server.days[operation.date])
        ? "send"
        : "conflict";
    case "delete-day": {
      const baseDay = operation.base.days[operation.date];
      const serverDay = server.days[operation.date];
      if (!baseDay && !serverDay) return "satisfied";
      if (baseDay && !serverDay) return "satisfied"; // sunucu zaten silmiş — istek karşılanmış
      return deepEqual(baseDay, serverDay) ? "send" : "conflict";
    }
    case "save-alias": {
      // Yerel (henüz sunucuda olmayan) alias: sunucuda karşılığı yok — çakışma olamaz.
      if (operation.localId?.startsWith("local:")) return "send";
      const id = operation.localId ?? operation.alias.id ?? operation.id;
      return deepEqual(
        operation.base.aliases.find((a) => a.id === id),
        server.aliases.find((a) => a.id === id),
      )
        ? "send"
        : "conflict";
    }
    case "delete-alias": {
      const baseAlias = operation.base.aliases.find((a) => a.id === operation.aliasId);
      const serverAlias = server.aliases.find((a) => a.id === operation.aliasId);
      if (!baseAlias && !serverAlias) return "satisfied";
      if (baseAlias && !serverAlias) return "satisfied"; // sunucu zaten silmiş
      if (!baseAlias && serverAlias) return "conflict";
      return deepEqual(baseAlias, serverAlias) ? "send" : "conflict";
    }
  }
}

/** Öğün dizisindeki `sources[].aliasId` değerlerini `aliasMap` üzerinden gerçek
 *  id'lere çevirir; eşleşen kaynak YOKSA diziyi AYNEN döndürür (referans
 *  korunur — gereksiz kuyruk yazımı olmaz). İki kullanım yeri: sync akışında
 *  biriktirilen `aliasMap` ve kuyruk yeniden yazımında tek girişli map. */
function remapMeals(meals: MealPayload[], aliasMap: Map<string, string>): MealPayload[] {
  if (!meals.some((m) => m.sources?.some((s) => aliasMap.has(s.aliasId)))) return meals;
  return meals.map((m) => ({
    ...m,
    ...(m.sources
      ? { sources: m.sources.map((s) => ({ ...s, aliasId: aliasMap.get(s.aliasId) ?? s.aliasId })) }
      : {}),
  }));
}

async function send(operation: OfflineOperation, aliasMap: Map<string, string>): Promise<void> {
  switch (operation.kind) {
    case "save-day":
      await saveDay(operation.date, remapMeals(operation.meals, aliasMap));
      return;
    case "delete-day":
      await deleteDay(operation.date);
      return;
    case "save-alias": {
      const localId = operation.localId;
      const isLocal = !!localId?.startsWith("local:");
      const mapped = isLocal && localId ? aliasMap.get(localId) : undefined;
      const payload: AliasPayload = {
        ...operation.alias,
        // Gerçek id'ye map edilmişse güncelleme; yeni yerelse id'siz oluşturma;
        // değilse var olan alias'ın güncellemesi.
        ...(mapped ? { id: mapped } : isLocal ? {} : { id: localId ?? operation.alias.id }),
      };
      const result = await saveAlias(payload);
      if (isLocal && localId && !mapped && result?.id) {
        aliasMap.set(localId, result.id);
        // Eşlemeyi Kuyruğa kalıcı yaz: bu alias'a referans veren bekleyen
        // gün kayıtlarının `local:` aliasId'sini gerçek id ile değiştir. Aksi
        // halde sync kesintiye uğrar ya da uygulama kapanırsa alias işlemi
        // zaten gönderilmiş olur, gün kaydı ise başıboş `local:` referansıyla
        // sunucuya giderdi.
        await persistLocalIdRemap(localId, result.id);
      }
      return;
    }
    case "delete-alias":
      await deleteAlias(aliasMap.get(operation.aliasId) ?? operation.aliasId);
      return;
  }
}

async function runSync(): Promise<SyncResult> {
  let interrupted = false;
  let server: AppData;
  try {
    server = await fetchData();
  } catch {
    // Ağ yok / sunucu yanıt vermiyor — kuyruğa dokunmadan çık; geri çekilmeli
    // otomatik deneme planlanır (bkz. syncPending).
    return {
      synced: 0,
      pending: (await listOperations()).length,
      failed: 0,
      conflicts: 0,
      interrupted: true,
    };
  }
  // serverView: her başarılı gönderimin ardından güncellenir — aynı güne/aliasa
  // dokunan SIRALI operasyonlar yanlış çakışma işaretlenmesin diye.
  let serverView = server;
  const aliasMap = new Map<string, string>();
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  const operations = await listOperations();
  for (const operation of operations) {
    if (operation.status === "failed" || operation.status === "conflict") continue;

    const verdict = classifyOperation(operation, serverView);
    if (verdict === "conflict") {
      conflicts++;
      await updateOperation({ ...operation, status: "conflict", error: CONFLICT_MESSAGE });
      continue;
    }
    if (verdict === "satisfied") {
      await removeOperation(operation.id);
      synced++;
      continue;
    }

    try {
      await send(operation, aliasMap);
      await removeOperation(operation.id);
      synced++;
      serverView = applyOperation(serverView, operation);
    } catch (error) {
      if (isNetworkError(error)) {
        interrupted = true; // ağ kesildi — kuyrukta kalır, geri çekilmeli deneme
        break;
      }
      const status = (error as { status?: number })?.status;
      if (status === 401) {
        return { synced, pending: (await listOperations()).length, failed, conflicts, auth: true };
      }
      if (status === 409) {
        // İleride server-side compare-and-swap gelirse: 409 = çakışma.
        conflicts++;
        await updateOperation({ ...operation, status: "conflict", error: CONFLICT_MESSAGE });
        continue;
      }
      if (typeof status === "number" && status >= 400 && status < 500) {
        // Kalıcı istemci hatası — kullanıcı müdahalesi gerekir.
        failed++;
        await updateOperation({
          ...operation,
          status: "failed",
          retryCount: operation.retryCount + 1,
          error: String((error as Error)?.message ?? error),
        });
        continue;
      }
      // 5xx / bilinmeyen: geçici — kuyrukta kalır, geri çekilmeli deneme.
      interrupted = true;
      break;
    }
  }

  const remaining = (await listOperations()).length;
  return { synced, pending: remaining, failed, conflicts, interrupted: interrupted || undefined };
}

/** Bekleyen işlemleri sırayla sunucuya gönderir. Tekil lock: aynı anda birden
 *  fazla sync (StrictMode, çift online event, manuel retry) asla paralel koşmaz.
 *  Asla reject etmez — tüm hatalar SyncResult'a düşer. */
export function syncPending(): Promise<SyncResult> {
  if (activeSync) return activeSync;
  clearRetryTimer();
  emitSyncState({ nextRetryAt: null, syncing: true });
  activeSync = (async () => {
    let result: SyncResult;
    try {
      result = await withCrossTabLock(() => runSync());
    } catch {
      // Beklenmeyen (örn. IndexedDB) hatası — kuyruğa dokunmadan güvenli dönüş.
      result = {
        synced: 0,
        pending: (await listOperations().catch(() => [])).length,
        failed: 0,
        conflicts: 0,
      };
    }
    emitSyncState({ syncing: false, lastResult: result });
    if (result.interrupted) {
      scheduleRetry();
    } else {
      // Kuyruk boşaldı ya da kullanıcı müdahalesi gerekiyor (failed/conflict) —
      // otomatik deneme yok, geri çekilme sıfırlanır.
      backoffStep = 0;
      emitSyncState({ nextRetryAt: null });
    }
    return result;
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

/** Çakışma çözümü — UI fazı bunu kullanacak:
 *  "server" → işlemi düşür, sunucudaki veri aynen kalır.
 *  "device"  → işlemi yeniden pending yap, bir sonraki sync cihaz sürümünü yazar. */
/** Başarısız (4xx) operasyonu kullanıcı eliyle yeniden dener — pending yapar;
 *  çağıran taraf sync tetikler. Not: base ile sunucu farkı oluşmuşsa sync
 *  yeniden çakışma işaretler (sessizce ezme yok). */
export async function retryOperation(operationId: string): Promise<void> {
  const operations = await listOperations();
  const operation = operations.find((o) => o.id === operationId);
  if (!operation) return;
  await updateOperation({ ...operation, status: "pending", error: undefined, retryCount: 0 });
}

/** İşlemi kuyruktan kalıcı olarak düşürür (kullanıcı değişiklikten vazgeçti). */
export async function cancelOperation(operationId: string): Promise<void> {
  const operations = await listOperations();
  if (!operations.some((o) => o.id === operationId)) return;
  await removeOperation(operationId);
}

/** Kuyruk özeti — UI sayıları bunun üzerinden kurulur. */
export type SyncSummary = {
  total: number;
  pending: number;
  failed: number;
  conflicts: number;
};

export function summarizeOperations(operations: OfflineOperation[]): SyncSummary {
  return {
    total: operations.length,
    pending: operations.filter((o) => o.status === "pending").length,
    failed: operations.filter((o) => o.status === "failed").length,
    conflicts: operations.filter((o) => o.status === "conflict").length,
  };
}

/** İşlemin ne olduğunu UI'da göstermek için yapılandırılmış bilgi. */
export type OperationInfo =
  | { kind: "day"; date: string }
  | { kind: "delete-day"; date: string }
  | { kind: "alias"; name: string }
  | { kind: "delete-alias"; name: string };

export function operationInfo(operation: OfflineOperation): OperationInfo {
  switch (operation.kind) {
    case "save-day":
      return { kind: "day", date: operation.date };
    case "delete-day":
      return { kind: "delete-day", date: operation.date };
    case "save-alias":
      return { kind: "alias", name: operation.alias.name };
    case "delete-alias": {
      // Kuyruktaki delete-alias işlemi yalnızca id taşır; adı kuyruğa alma
      // anındaki snapshot'tan (base.aliases) çıkarırız — aksi halde SyncStatus
      // kullanıcıya ham UUID gösterirdi.
      const baseAlias = operation.base.aliases.find((a) => a.id === operation.aliasId);
      return { kind: "delete-alias", name: baseAlias?.name ?? operation.aliasId };
    }
  }
}

/** Testler için: zamanlayıcı ve dinleyicileri sıfırlar (modül tekizi). */
export function __resetSyncForTests(): void {
  clearRetryTimer();
  syncStateListeners = [];
  syncState = { ...INITIAL_SYNC_STATE };
  backoffStep = 0;
  activeSync = null;
}

export async function resolveConflict(
  operationId: string,
  choice: "server" | "device",
): Promise<void> {
  const operations = await listOperations();
  const operation = operations.find((o) => o.id === operationId);
  if (!operation || operation.status !== "conflict") return;
  if (choice === "server") {
    await removeOperation(operation.id);
  } else {
    await updateOperation({
      ...operation,
      status: "pending",
      error: undefined,
      retryCount: 0,
      force: true,
    });
  }
}
