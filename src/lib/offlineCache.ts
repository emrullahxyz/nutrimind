// ============================================================================
// Nutrimind — çevrimdışı okuma cache (IndexedDB, son API snapshot'ı).
//
// Snapshot ve offline yazma kuyruğu: Service worker'ın v1'deki sızıntısından
// sonra API yanıtları SW'de tutulmuyor; bu yüzden bu cache JS üzerinden
// "kullanıcının kendi verisinin son görülen hali"ni saklar. Sızıntı riski
// sıfır (zaten kendi verisi, kendi cihazı).
//
// ============================================================================

// ponytail: IDB overkill. AppData JSON genelde < 100KB, localStorage 5-10MB
// kapasite veriyor — `localStorage.setItem("nutrimind.cache", JSON.stringify(d))`
// aynı işi 10 satırda yapar. IDB avantajı: daha büyük quota, structured clone.
// İleride kullanıcı verisi 1MB'ı aşarsa veya binary eklenecekse (fotoğraf
// cache) IDB doğru seçim. Şu an fazla mühendislik.

import type { AppData, AliasPayload } from "./api";
import type { MealPayload } from "../types";

const DB_NAME = "nutrimind-cache";
const STORE = "snapshots";
const OPS_STORE = "operations";
const KEY = "lastData";
/** Şema değiştiğinde artır — eski snapshot'lar geçersiz sayılır. */
const VERSION = 2;

export type CachedSnapshot = {
  data: AppData;
  cachedAt: string; // ISO
  version: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(OPS_STORE))
        db.createObjectStore(OPS_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Snapshot'ı IndexedDB'ye yazar. Hata olursa sessizce yok say (quota dolu,
 *  private mode, vs.) — cache eksikse uygulama eskisi gibi davranır. */
export async function putSnapshot(data: AppData): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(
        { data, cachedAt: new Date().toISOString(), version: VERSION },
        KEY,
      );
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // sessizce yok say
  }
}

/** Son snapshot'ı döner. Eski sürüm / boş / hata → null. */
export async function getSnapshot(): Promise<CachedSnapshot | null> {
  try {
    const db = await openDB();
    return await new Promise<CachedSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        const result = req.result as CachedSnapshot | undefined;
        if (!result) {
          resolve(null);
          return;
        }
        if (result.version !== VERSION) {
          resolve(null);
          return;
        }
        resolve(result);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

/** Operasyon durumu:
 *  - pending  : henüz denenmedi / tekrar denenecek
 *  - failed   : sunucu kalıcı hata döndü (4xx) — kullanıcı müdahalesi gerekir
 *  - conflict : kuyruğa alındıktan SONRA sunucu verisi değişti — sessizce
 *               ezilmez, kullanıcı cihaz/sunucu sürümü arasında seçim yapar
 */
export type OfflineOperation =
  | {
      id: string;
      kind: "save-day";
      date: string;
      meals: MealPayload[];
      base: CachedSnapshot["data"];
      createdAt: string;
      retryCount: number;
      status: "pending" | "failed" | "conflict";
      error?: string;
      force?: boolean;
    }
  | {
      id: string;
      kind: "delete-day";
      date: string;
      base: CachedSnapshot["data"];
      createdAt: string;
      retryCount: number;
      status: "pending" | "failed" | "conflict";
      error?: string;
      force?: boolean;
    }
  | {
      id: string;
      kind: "save-alias";
      alias: AliasPayload;
      localId?: string;
      base: CachedSnapshot["data"];
      createdAt: string;
      retryCount: number;
      status: "pending" | "failed" | "conflict";
      error?: string;
      force?: boolean;
    }
  | {
      id: string;
      kind: "delete-alias";
      aliasId: string;
      base: CachedSnapshot["data"];
      createdAt: string;
      retryCount: number;
      status: "pending" | "failed" | "conflict";
      error?: string;
      force?: boolean;
    };

export async function enqueueOperation(operation: OfflineOperation): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readwrite");
    tx.objectStore(OPS_STORE).put(operation);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listOperations(): Promise<OfflineOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readonly");
    const req = tx.objectStore(OPS_STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(
        (req.result as OfflineOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function removeOperation(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OPS_STORE, "readwrite");
    tx.objectStore(OPS_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function updateOperation(operation: OfflineOperation): Promise<void> {
  return enqueueOperation(operation);
}
