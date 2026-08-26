// ============================================================================
// Nutrimind — çevrimdışı okuma cache (IndexedDB, son API snapshot'ı).
//
// YALNIZCA OKUMA: kullanıcı kararı. Service worker'ın v1'deki sızıntısından
// sonra API yanıtları SW'de tutulmuyor; bu yüzden bu cache JS üzerinden
// "kullanıcının kendi verisinin son görülen hali"ni saklar. Sızıntı riski
// sıfır (zaten kendi verisi, kendi cihazı).
//
// YAZMA YAPILMAZ: offline'da yeni öğün ekleme SENKRONİZE EDİLMEZ. Bunun
// yerine yazma butonu offline'da disable + tooltip ile kullanıcı bilgilendirilir.
// ============================================================================

// ponytail: IDB overkill. AppData JSON genelde < 100KB, localStorage 5-10MB
// kapasite veriyor — `localStorage.setItem("nutrimind.cache", JSON.stringify(d))`
// aynı işi 10 satırda yapar. IDB avantajı: daha büyük quota, structured clone.
// İleride kullanıcı verisi 1MB'ı aşarsa veya binary eklenecekse (fotoğraf
// cache) IDB doğru seçim. Şu an fazla mühendislik.

import type { AppData } from "./api";

const DB_NAME = "nutrimind-cache";
const STORE = "snapshots";
const KEY = "lastData";
/** Şema değiştiğinde artır — eski snapshot'lar geçersiz sayılır. */
const VERSION = 1;

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

/** Test / "önbelleği temizle" için. */
export async function clearSnapshot(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
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
