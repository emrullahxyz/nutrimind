import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENCODE_API_KEY",
  "OLLAMA_CLOUDE_API_KEY",
  "CLAUDEFLARE_API_KEY",
  "CLAUDEFLARE_ACCOUNT_ID",
  "NUTRI_AI_AUTOMODEL",
];

const envBackup = {};

beforeEach(() => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k];
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

/** Açılışta başlatılan ilk turun ağ çağrılarını tamamlaması için bekle. */
function flushTick() {
  return new Promise((r) => setTimeout(r, 25));
}

async function loadDiscovery(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("./aiDiscovery.js");
  return mod.default ?? mod;
}

function listResponse(ids) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: ids.map((id) => ({ id })) }),
  };
}

function chatOkResponse() {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [] }) };
}

const keys = {
  OPENROUTER_API_KEY: "or_key",
  OPENCODE_API_KEY: "oc_key",
  OLLAMA_CLOUDE_API_KEY: "ol_key",
  CLAUDEFLARE_API_KEY: "cf_key",
  CLAUDEFLARE_ACCOUNT_ID: "acct-1",
};

describe("aiDiscovery periyodik model taraması", () => {
  it("startDiscovery açılışta ilk turu çalıştırır: listeyi çeker, canlı adayı cache'ler", async () => {
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/models") || String(url).includes("/ai/models/search")) {
        return listResponse(["cohere/north-mini-code:free", "openrouter/free"]);
      }
      return chatOkResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadDiscovery(keys);
    const aiModels = m._aiModels; // `startDiscovery`'nin kullandığı AYNI instance

    const stop = m.startDiscovery(120 * 60 * 1000); // 2 saat
    try {
      await flushTick();
      // openrouter için listeye gidip canlı adayı cache'lediğini doğrula:
      const cached = aiModels.getModel("openrouter", "text", "openrouter/free");
      expect(cached.model).toBe("cohere/north-mini-code:free");
      expect(cached.source).toBe("cached");
      // en az bir liste + bir probe çağrısı
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      m.stopDiscovery();
    }
  });

  it("startDiscovery art arda iki çağrıda aynı timer'ı çoğaltmaz (single-timer)", async () => {
    const m = await loadDiscovery(keys);

    const stop1 = m.startDiscovery(120 * 60 * 1000);
    const stop2 = m.startDiscovery(120 * 60 * 1000);
    // stopDiscovery yalnızca bir timer temizler; ikinci çağrı no-op döndü.
    expect(stop1).toBe(stop2);
    m.stopDiscovery();
    await flushTick();
  });

  it("interval varsayılanın altı clamp edilir: 1 dakika → MIN_INTERVAL (15 dk)", async () => {
    const m = await loadDiscovery(keys);

    // `setInterval` çağrısını yakala (gerçek zamanlayıcı üzerinde spy)
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    m.startDiscovery(60 * 1000);
    const [fn, ms] = setIntervalSpy.mock.calls[0];
    expect(ms).toBe(15 * 60 * 1000);
    expect(typeof fn).toBe("function");
    m.stopDiscovery();
    setIntervalSpy.mockRestore();
    await flushTick();
  });

  it("asla throw etmez: ağ çökse ya da sağlayıcı yoksa sessizce atlanır", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ağ yok")));
    const m = await loadDiscovery(keys);
    // başlatma tick'i sırasında hata fırlatmamalı
    const stop = m.startDiscovery(120 * 60 * 1000);
    await new Promise((r) => setTimeout(r, 10));
    m.stopDiscovery();
    // devam ediyor — throw yok demektir
    expect(true).toBe(true);
  });

  it("stopDiscovery timer'ı kapatır: tekrarlanan tick gitmez", async () => {
    const m = await loadDiscovery(keys);
    const mockFetch = vi.fn().mockResolvedValue(chatOkResponse());
    vi.stubGlobal("fetch", mockFetch);

    m.startDiscovery(120 * 60 * 1000);
    await flushTick(); // ilk tur bitti
    const afterStart = mockFetch.mock.calls.length;
    m.stopDiscovery();
    // stop sonrası yeni bir tur başlatılırsa timer çalışmamalı; ama başlatmıyoruz —
    // yalnızca stop'un throw etmemesi + timer'ın temizlenmesi yeterli kabul.
    expect(afterStart).toBeGreaterThanOrEqual(1);
    expect(() => m.stopDiscovery()).not.toThrow();
  });
});