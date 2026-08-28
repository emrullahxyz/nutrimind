import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "./api";
import type { OfflineOperation } from "./offlineCache";

const apiMocks = vi.hoisted(() => ({
  fetchData: vi.fn(),
  saveDay: vi.fn(),
  deleteDay: vi.fn(),
  saveAlias: vi.fn(),
  deleteAlias: vi.fn(),
}));

vi.mock("./api", () => apiMocks);

const cacheMocks = vi.hoisted(() => ({
  enqueueOperation: vi.fn(),
  listOperations: vi.fn(),
  removeOperation: vi.fn(),
  updateOperation: vi.fn(),
}));

vi.mock("./offlineCache", () => cacheMocks);

import {
  __resetSyncForTests,
  cancelOperation,
  getSyncState,
  operationInfo,
  resolveConflict,
  retryOperation,
  subscribeSyncState,
  summarizeOperations,
  syncPending,
} from "./offlineSync";

const MEAL = { kcal: 1, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const MEAL_PAYLOAD = { name: "a", nutrition: MEAL };

/** Gerçek sunucu/parse biçimi: meal id'si `${date}_${index}`. */
function mealItem(date: string, label: string, index = 0): AppData["days"][string][number] {
  return { id: `${date}_${index}`, label, computed: MEAL };
}

function makeData(days: AppData["days"] = {}, aliases: AppData["aliases"] = []): AppData {
  return {
    goals: { version: 2, profiles: [], defaultProfileId: "", weekday: {}, overrides: {} },
    days,
    aliases,
    config: {},
  };
}

/** Union üzerinde dağıtımlı Omit — her varyantın kendi alanlarını kabul eder. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type OpInput = DistributiveOmit<OfflineOperation, "id" | "createdAt" | "retryCount" | "status"> & {
  id?: string;
  status?: "pending" | "failed" | "conflict";
};

function op(partial: OpInput): OfflineOperation {
  return {
    id: partial.id ?? `op-${Math.random().toString(36).slice(2)}`,
    createdAt: "2026-08-28T10:00:00Z",
    retryCount: 0,
    status: "pending",
    ...partial,
  } as OfflineOperation;
}

// Kuyruğu gerçekçi biçimde taklit eder: removeOperation/updateOperation
// listOperations'ı etkiler — böylece `pending` sayıları doğru test edilir.
let queue: OfflineOperation[] = [];

beforeEach(() => {
  __resetSyncForTests();
  vi.clearAllMocks();
  queue = [];
  apiMocks.fetchData.mockResolvedValue(makeData());
  cacheMocks.listOperations.mockImplementation(async () => queue);
  cacheMocks.removeOperation.mockImplementation(async (id: string) => {
    queue = queue.filter((o) => o.id !== id);
  });
  cacheMocks.updateOperation.mockImplementation(async (o: OfflineOperation) => {
    queue = queue.map((x) => (x.id === o.id ? o : x));
  });
  cacheMocks.enqueueOperation.mockResolvedValue(undefined);
});

describe("syncPending — conflict koruması", () => {
  it("sunucu verisi değişmemişse işlemi gönderir ve kuyruktan düşürür", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }));
    apiMocks.saveDay.mockResolvedValue({ ok: true });
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.saveDay).toHaveBeenCalledWith("2026-08-28", [MEAL_PAYLOAD]);
    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op1");
    expect(result).toEqual({ synced: 1, pending: 0, failed: 0, conflicts: 0 });
  });

  it("sunucu verisi değiştiyse işlemi GÖNDERMEZ, conflict olarak saklar", async () => {
    // Kuyruğa alınırken gün [a] idi; sync sırasında sunucuda [server] var.
    apiMocks.fetchData.mockResolvedValue(
      makeData({ "2026-08-28": [mealItem("2026-08-28", "server")] }),
    );
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [{ name: "b", nutrition: MEAL }],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.saveDay).not.toHaveBeenCalled();
    expect(cacheMocks.updateOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "op1", status: "conflict" }),
    );
    expect(result).toEqual({ synced: 0, pending: 1, failed: 0, conflicts: 1 });
  });

  it("sunucuda zaten silinmiş gün için delete no-op sayılır ve gönderilmez", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData({})); // sunucuda gün yok
    queue = [
      op({
        id: "op1",
        kind: "delete-day",
        date: "2026-08-28",
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.deleteDay).not.toHaveBeenCalled();
    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op1");
    expect(result.synced).toBe(1);
    expect(result.conflicts).toBe(0);
  });

  it("aynı güne dokunan sıralı işlemler yanlış çakışma işaretlemez", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }));
    apiMocks.saveDay.mockResolvedValue({ ok: true });
    queue = [
      // op1: [a] → [a, b]; op2: [a, b] → [a, b, c] (op2'nin base'i op1'in projeksiyonunu içerir)
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [
          { name: "a", nutrition: MEAL },
          { name: "b", nutrition: MEAL },
        ],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
      op({
        id: "op2",
        kind: "save-day",
        date: "2026-08-28",
        meals: [
          { name: "a", nutrition: MEAL },
          { name: "b", nutrition: MEAL },
          { name: "c", nutrition: MEAL },
        ],
        base: makeData({
          "2026-08-28": [mealItem("2026-08-28", "a", 0), mealItem("2026-08-28", "b", 1)],
        }),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.saveDay).toHaveBeenCalledTimes(2);
    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op1");
    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op2");
    expect(result).toEqual({ synced: 2, pending: 0, failed: 0, conflicts: 0 });
  });
});

describe("syncPending — çift sekme kilidi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Web Locks varsa sync kilit içinde koşar ve ikinci çağrı aynı koşuya katılır", async () => {
    let held = false;
    let acquisitions = 0;
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, cb: () => Promise<unknown>) => {
          acquisitions++;
          expect(held).toBe(false);
          held = true;
          try {
            return await cb();
          } finally {
            held = false;
          }
        },
      },
    });
    apiMocks.fetchData.mockResolvedValue(makeData());

    const [a, b] = await Promise.all([syncPending(), syncPending()]);

    expect(acquisitions).toBe(1); // ikinci çağrı aktif sync promise'ine katıldı
    expect(a).toEqual(b);
  });

  it("Web Locks yoksa (eski tarayıcı) sync doğrudan koşar", async () => {
    vi.stubGlobal("navigator", {}); // locks yok
    apiMocks.fetchData.mockResolvedValue(makeData());

    const result = await syncPending();

    expect(apiMocks.fetchData).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(0);
  });
});

describe("syncPending — uç senaryolar", () => {
  it("StrictMode/çift event: aynı anda iki syncPending tek çalıştırmayı paylaşır", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData());

    const [a, b] = await Promise.all([syncPending(), syncPending()]);

    expect(apiMocks.fetchData).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("kuyruk ortasında ağ kesilirse tamamlananlar düşer, kalanlar korunur", async () => {
    apiMocks.fetchData.mockResolvedValue(
      makeData({
        "2026-08-28": [mealItem("2026-08-28", "a")],
        "2026-08-29": [mealItem("2026-08-29", "a")],
        "2026-08-30": [mealItem("2026-08-30", "a")],
      }),
    );
    apiMocks.saveDay
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    queue = [
      op({ id: "op1", kind: "save-day", date: "2026-08-28", meals: [MEAL_PAYLOAD], base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }) }),
      op({ id: "op2", kind: "save-day", date: "2026-08-29", meals: [MEAL_PAYLOAD], base: makeData({ "2026-08-29": [mealItem("2026-08-29", "a")] }) }),
      op({ id: "op3", kind: "save-day", date: "2026-08-30", meals: [MEAL_PAYLOAD], base: makeData({ "2026-08-30": [mealItem("2026-08-30", "a")] }) }),
    ];

    const result = await syncPending();

    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op1");
    expect(queue.map((o) => o.id)).toEqual(["op2", "op3"]);
    expect(result.synced).toBe(1);
    expect(result.interrupted).toBe(true);
  });
});

describe("syncPending — hata sınıflandırması", () => {
  it("ağ hatası: kuyruk korunur, sync durur", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }));
    apiMocks.saveDay.mockRejectedValue(new TypeError("Failed to fetch"));
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
    ];

    const result = await syncPending();

    expect(cacheMocks.removeOperation).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, pending: 1, failed: 0, conflicts: 0, interrupted: true });
  });

  it("4xx: işlem failed olur, kuyruk kalan işlemlere devam eder", async () => {
    apiMocks.fetchData.mockResolvedValue(
      makeData({
        "2026-08-28": [mealItem("2026-08-28", "a")],
        "2026-08-29": [mealItem("2026-08-29", "a")],
      }),
    );
    apiMocks.saveDay
      .mockRejectedValueOnce(Object.assign(new Error("gün verisi geçersiz"), { status: 400 }))
      .mockResolvedValueOnce({ ok: true });
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
      op({
        id: "op2",
        kind: "save-day",
        date: "2026-08-29",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-29": [mealItem("2026-08-29", "a")] }),
      }),
    ];

    const result = await syncPending();

    expect(cacheMocks.updateOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "op1", status: "failed", retryCount: 1 }),
    );
    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op2");
    expect(result).toEqual({ synced: 1, pending: 1, failed: 1, conflicts: 0 });
  });

  it("401: sync durur, auth bayrağı döner, sonraki işlemlere dokunulmaz", async () => {
    apiMocks.fetchData.mockResolvedValue(makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }));
    apiMocks.saveDay.mockRejectedValue(
      Object.assign(new Error("Oturum sona erdi — tekrar giriş yap."), { status: 401 }),
    );
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
      op({
        id: "op2",
        kind: "save-day",
        date: "2026-08-29",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-29": [mealItem("2026-08-29", "a")] }),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.saveDay).toHaveBeenCalledTimes(1);
    expect(cacheMocks.updateOperation).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(result.auth).toBe(true);
  });
});

describe("syncPending — alias yerel id eşlemesi", () => {
  const localAlias = { triggers: ["x"], name: "X", brand: null, serving_g: 100, nutrition: MEAL };

  it("yeni yerel alias oluşturulur ve sonraki gün kaydındaki local id gerçek id'ye çevrilir", async () => {
    apiMocks.saveAlias.mockResolvedValue({ ok: true, id: "a_real" });
    apiMocks.saveDay.mockResolvedValue({ ok: true });
    queue = [
      op({
        id: "op1",
        kind: "save-alias",
        alias: localAlias,
        localId: "local:a",
        base: makeData({}, [
          {
            id: "local:a",
            triggers: ["x"],
            name: "X",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ]),
      }),
      op({
        id: "op2",
        kind: "save-day",
        date: "2026-08-28",
        meals: [
          { name: "X", nutrition: MEAL, sources: [{ aliasId: "local:a", qty: 1, unit: "adet" }] },
        ],
        // Gün sunucuda yoktu (base'te de yok) — yalnızca yeni öğün ekleniyor.
        base: makeData({}, [
          {
            id: "local:a",
            triggers: ["x"],
            name: "X",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ]),
      }),
    ];

    const result = await syncPending();

    // Yeni alias: id'siz oluşturma isteği.
    expect(apiMocks.saveAlias).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.any(String) }),
    );
    // Gün kaydı gerçek id ile gönderilir.
    expect(apiMocks.saveDay).toHaveBeenCalledWith("2026-08-28", [
      { name: "X", nutrition: MEAL, sources: [{ aliasId: "a_real", qty: 1, unit: "adet" }] },
    ]);
    expect(result.synced).toBe(2);
    expect(result.conflicts).toBe(0);
  });

  it("yerel alias düzenlemesi ikinci kez YENİ alias oluşturmaz, aynı gerçek id'ye günceller", async () => {
    apiMocks.saveAlias.mockResolvedValueOnce({ ok: true, id: "a_real" });
    apiMocks.saveAlias.mockResolvedValueOnce({ ok: true, id: "a_real" });
    queue = [
      op({
        id: "op1",
        kind: "save-alias",
        alias: localAlias,
        localId: "local:a",
        base: makeData({}, [
          {
            id: "local:a",
            triggers: ["x"],
            name: "X",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ]),
      }),
      op({
        id: "op2",
        kind: "save-alias",
        alias: { ...localAlias, name: "X2" },
        localId: "local:a",
        base: makeData({}, [
          {
            id: "local:a",
            triggers: ["x"],
            name: "X2",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ]),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.saveAlias).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ id: expect.any(String) }),
    );
    expect(apiMocks.saveAlias).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "a_real", name: "X2" }),
    );
    expect(result.synced).toBe(2);
  });

  it("yerel alias silme, gerçek sunucu id'sine yönlendirilir", async () => {
    apiMocks.saveAlias.mockResolvedValue({ ok: true, id: "a_real" });
    apiMocks.deleteAlias.mockResolvedValue({ ok: true });
    queue = [
      op({
        id: "op1",
        kind: "save-alias",
        alias: localAlias,
        localId: "local:a",
        base: makeData({}, [
          {
            id: "local:a",
            triggers: ["x"],
            name: "X",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ]),
      }),
      op({
        id: "op2",
        kind: "delete-alias",
        aliasId: "local:a",
        base: makeData({}, [
          {
            id: "local:a",
            triggers: ["x"],
            name: "X",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ]),
      }),
    ];

    const result = await syncPending();

    expect(apiMocks.deleteAlias).toHaveBeenCalledWith("a_real");
    expect(result.synced).toBe(2);
  });

  it("alias+day aynı kuyrukta, day gönderilemeden sync kesilirse day kaydı kuyruğa gerçek id ile yazılır", async () => {
    // Alias gönderilir (a_real), day kaydı ise AĞ HATASI nedeniyle sync
    // yarıda kesilmeden önce gönderilemez. persistLocalIdRemap day kaydının
    // saklanan payload'ını local:a → a_real olarak yeniden yazmış olmalı —
    // sonraki koşu başıboş local: referansı göndermez.
    apiMocks.saveAlias.mockResolvedValue({ ok: true, id: "a_real" });
    apiMocks.saveDay.mockRejectedValue(new TypeError("Failed to fetch"));
    queue = [
      op({
        id: "op1",
        kind: "save-alias",
        alias: localAlias,
        localId: "local:a",
        base: makeData({}, [{ id: "local:a", triggers: ["x"], name: "X", brand: null, serving_g: 100, nutrition: MEAL }]),
      }),
      op({
        id: "op2",
        kind: "save-day",
        date: "2026-08-28",
        meals: [{ name: "X", nutrition: MEAL, sources: [{ aliasId: "local:a", qty: 1, unit: "adet" }] }],
        base: makeData({}, [{ id: "local:a", triggers: ["x"], name: "X", brand: null, serving_g: 100, nutrition: MEAL }]),
      }),
    ];

    const first = await syncPending();
    expect(first.interrupted).toBe(true);

    // Kuyruktaki day kaydı artık gerçek id'yi saklıyor olmalı.
    const stored = queue.find((o) => o.id === "op2");
    expect(stored && stored.kind === "save-day" ? stored.meals[0].sources?.[0].aliasId : undefined).toBe(
      "a_real",
    );

    // Sonraki koşu: yalnızca day kaldı ve gerçek id ile gönderiliyor.
    apiMocks.saveDay.mockResolvedValue({ ok: true });
    const second = await syncPending();
    expect(apiMocks.saveDay).toHaveBeenLastCalledWith("2026-08-28", [
      { name: "X", nutrition: MEAL, sources: [{ aliasId: "a_real", qty: 1, unit: "adet" }] },
    ]);
    expect(second.synced).toBe(1);
  });
});

describe("sync durumu yayını", () => {
  it("sync başlarken/bitince durum yayınlar ve sonucu kaydeder", async () => {
    const states: Array<{ syncing: boolean }> = [];
    const unsubscribe = subscribeSyncState((s) => states.push(s));
    apiMocks.fetchData.mockResolvedValue(makeData());

    await syncPending();
    unsubscribe();

    expect(states.some((s) => s.syncing)).toBe(true);
    const last = getSyncState();
    expect(last.syncing).toBe(false);
    expect(last.lastResult).toEqual({ synced: 0, pending: 0, failed: 0, conflicts: 0 });
  });

  it("abonelik kaldırılınca daha fazla yayın almaz", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncState(listener);
    listener.mockClear();
    unsubscribe();
    apiMocks.fetchData.mockResolvedValue(makeData());
    await syncPending();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("sync geri çekilmesi", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ağ kesintisi sonrası üstel geri çekilmeyle otomatik yeniden dener", async () => {
    vi.useFakeTimers();
    apiMocks.fetchData
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(makeData());
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [MEAL_PAYLOAD],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      }),
    ];
    apiMocks.saveDay.mockResolvedValue({ ok: true });

    const first = await syncPending();
    expect(first.interrupted).toBe(true);
    expect(getSyncState().nextRetryAt).not.toBeNull();

    // 1. deneme → 1s sonra
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMocks.fetchData).toHaveBeenCalledTimes(2);

    // 2. deneme → 2s sonra
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMocks.fetchData).toHaveBeenCalledTimes(3);

    // 3. deneme → 5s sonra, başarılı → zamanlayıcı iptal
    await vi.advanceTimersByTimeAsync(5000);
    expect(apiMocks.fetchData).toHaveBeenCalledTimes(4);
    expect(getSyncState().nextRetryAt).toBeNull();
  });

  it("başarılı sync geri çekilmeyi sıfırlar (sonraki kesinti 1s'den başlar)", async () => {
    vi.useFakeTimers();
    apiMocks.fetchData
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(makeData())
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await syncPending();
    expect(getSyncState().nextRetryAt).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1000); // başarılı
    expect(apiMocks.fetchData).toHaveBeenCalledTimes(2);
    expect(getSyncState().nextRetryAt).toBeNull();

    await syncPending(); // yine ağ hatası — backoff 1s'den başlamalı
    expect(getSyncState().nextRetryAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMocks.fetchData).toHaveBeenCalledTimes(4);
  });
});

describe("kuyruk özeti ve işlem tanımı", () => {
  it("özetler ve işlemleri tanımlar", () => {
    const aliasPayload = {
      triggers: ["x"],
      name: "X",
      brand: null,
      serving_g: 100,
      nutrition: MEAL,
    };
    const ops = [
      op({ kind: "save-day", date: "2026-08-28", meals: [], base: makeData() }),
      op({
        id: "f1",
        kind: "save-day",
        date: "2026-08-29",
        meals: [],
        base: makeData(),
        status: "failed",
      }),
      op({
        id: "c1",
        kind: "save-alias",
        alias: aliasPayload,
        localId: "local:a",
        base: makeData(),
        status: "conflict",
      }),
    ];
    expect(summarizeOperations(ops)).toEqual({ total: 3, pending: 1, failed: 1, conflicts: 1 });
    expect(operationInfo(ops[0])).toEqual({ kind: "day", date: "2026-08-28" });
    expect(operationInfo(ops[2])).toEqual({ kind: "alias", name: "X" });
  });

  it("silinen alias işlemi adını gösterir (UUID değil)", () => {
    const named = op({
      id: "d1",
      kind: "delete-alias",
      aliasId: "real-123",
      // base, silinen alias'ın adını taşır — operationInfo onu çıkarmalı.
      base: makeData(
        {},
        [
          {
            id: "real-123",
            triggers: ["yoğurt"],
            name: "Yoğurt",
            brand: null,
            serving_g: 100,
            nutrition: MEAL,
          },
        ],
      ),
    });
    expect(operationInfo(named)).toEqual({ kind: "delete-alias", name: "Yoğurt" });
  });
});

describe("retryOperation / cancelOperation", () => {
  it("retry pending yapar, cancel kuyruktan düşürür", async () => {
    queue = [
      op({
        id: "f1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [],
        base: makeData(),
        status: "failed",
        error: "gün verisi geçersiz",
      }),
    ];

    await retryOperation("f1");
    expect(queue[0].status).toBe("pending");
    expect(queue[0].error).toBeUndefined();
    expect(queue[0].retryCount).toBe(0);

    await cancelOperation("f1");
    expect(queue).toHaveLength(0);
  });

  it("var olmayan işlem için sessizce döner", async () => {
    await retryOperation("yok");
    await cancelOperation("yok");
    expect(cacheMocks.updateOperation).not.toHaveBeenCalled();
    expect(cacheMocks.removeOperation).not.toHaveBeenCalled();
  });
});

describe("resolveConflict", () => {
  it('"server" seçimi işlemi kuyruktan düşürür, "device" yeniden pending yapar', async () => {
    const conflicted = op({
      id: "op1",
      kind: "save-day",
      date: "2026-08-28",
      meals: [MEAL_PAYLOAD],
      base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
      status: "conflict",
    }) as OfflineOperation;
    queue = [conflicted];

    await resolveConflict("op1", "server");
    expect(cacheMocks.removeOperation).toHaveBeenCalledWith("op1");
    expect(cacheMocks.updateOperation).not.toHaveBeenCalled();

    queue = [conflicted];
    await resolveConflict("op1", "device");
    expect(cacheMocks.updateOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "op1",
        status: "pending",
        retryCount: 0,
        error: undefined,
        force: true,
      }),
    );
  });

  it('"device" seçimi sonrası sync, sunucu farklı olsa bile işlemi GÖNDERİR', async () => {
    // Sunucudaki gün [server] — kuyruktaki işlem conflict olmuştu; kullanıcı cihazı seçti.
    apiMocks.fetchData.mockResolvedValue(
      makeData({ "2026-08-28": [mealItem("2026-08-28", "server")] }),
    );
    apiMocks.saveDay.mockResolvedValue({ ok: true });
    queue = [
      op({
        id: "op1",
        kind: "save-day",
        date: "2026-08-28",
        meals: [{ name: "b", nutrition: MEAL }],
        base: makeData({ "2026-08-28": [mealItem("2026-08-28", "a")] }),
        status: "conflict",
      }) as OfflineOperation,
    ];

    await resolveConflict("op1", "device");
    const result = await syncPending();

    expect(apiMocks.saveDay).toHaveBeenCalledWith("2026-08-28", [{ name: "b", nutrition: MEAL }]);
    expect(result).toEqual({ synced: 1, pending: 0, failed: 0, conflicts: 0 });
  });
});
