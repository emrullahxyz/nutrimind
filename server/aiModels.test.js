// server/aiModels.js birim testleri: aday süzme, canlı yoklama, önbellek,
// olumsuz önbellek, AUTOMODEL kapatma ve savunmacı davranış.
//
// NEDEN VAR: 2026-09-21 olayında koda sabit yazılı model adları sağlayıcılar
// tarafından sessizce emekliye ayrılmıştı (410 Gone / 400 "Model is
// unavailable"). Bu modül "adı listeden bul + canlı yokla" sözleşmesini tutmazsa
// zincir yine ölü bir modele 40 sn harcar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "NVIDIA_NIM_API_KEY",
  "OPENCODE_API_KEY",
  "OPENROUTER_API_KEY",
  "OLLAMA_CLOUD_API_KEY",
  "CLAUDEFLARE_API_KEY",
  "CLAUDEFLARE_ACCOUNT_ID",
  "NUTRI_AI_AUTOMODEL",
  "NUTRI_AI_MODEL_TTL_MS",
  "NUTRI_AI_MODEL_NEGATIVE_TTL_MS",
  "NUTRI_AI_DISCOVER_BUDGET_MS",
  "NUTRI_AI_PROBE_TIMEOUT_MS",
  "NUTRI_AI_MAX_PROBES",
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

async function loadModels(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("./aiModels.js");
  const api = mod.default ?? mod;
  api.resetGeminiCatalog();
  return api;
}

const keys = {
  NVIDIA_NIM_API_KEY: "test_nim_key",
  OPENCODE_API_KEY: "test_opencode_key",
  OPENROUTER_API_KEY: "test_openrouter_key",
  OLLAMA_CLOUD_API_KEY: "test_ollama_key",
  CLAUDEFLARE_API_KEY: "test_cf_key",
  CLAUDEFLARE_ACCOUNT_ID: "acct-123",
};

/** Model listesi yanıtı (OpenAI uyumlu gövde). */
function listResponse(ids) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: ids.map((id) => ({ id })) }),
  };
}

function errorResponse(status) {
  return { ok: false, status, text: async () => JSON.stringify({ error: `HTTP ${status}` }) };
}

function okResponse() {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [] }) };
}

describe("aiModels model keşfi", () => {
  it("sağlıklı akışta ağa çıkmaz: önbellek boşsa yapılandırılmış model kullanılır", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels(keys);

    expect(m.getModel("nim", "text", "meta/llama-3.1-8b-instruct")).toEqual({
      model: "meta/llama-3.1-8b-instruct",
      source: "env",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("model hatasında listeyi çeker, adayları SIRAYLA yoklar ve çalışanı önbelleğe alır", async () => {
    // URL/gövde farkındalıklı sahte fetch: sıraya bağımlı mock zinciri yerine
    // "liste → aday yoklaması" ayrımını doğrudan modeller (daha az kırılgan).
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/models")) {
        return listResponse([
          "meta/llama-3.2-11b-vision-instruct",
          "meta/llama-3.1-8b-instruct",
          "meta/llama3-chatqa-1.5-70b",
          "nvidia/llama-3.1-nemotron-51b-instruct",
        ]);
      }
      const body = JSON.parse(init.body);
      // ilk aday (chatqa) ölü, ikincisi çalışıyor
      return body.model === "meta/llama3-chatqa-1.5-70b" ? errorResponse(500) : okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const found = await m.refreshOnFailure("nim", "text", {
      currentModel: "meta/llama-3.1-8b-instruct",
      budgetMs: 8000,
      status: 410,
    });

    expect(found.reason).toBe("probe-ok");
    expect(found.model).toBe("nvidia/llama-3.1-nemotron-51b-instruct");
    expect(found.probed).toEqual([
      "meta/llama3-chatqa-1.5-70b",
      "nvidia/llama-3.1-nemotron-51b-instruct",
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/models");
    // Yoklama gövdesi: tek jetonluk, gerçek yük göndermeyen istek.
    const probeBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(probeBody).toMatchObject({ model: "meta/llama3-chatqa-1.5-70b", max_tokens: 1 });

    // Seçim önbellekte: bir sonraki çağrı ağa çıkmadan bulunan modeli verir.
    expect(m.getModel("nim", "text", "meta/llama-3.1-8b-instruct")).toEqual({
      model: "nvidia/llama-3.1-nemotron-51b-instruct",
      source: "cached",
    });
  });

  it("liste çekilemezse: olumsuz önbellek, ağ TEKRAR açılmaz, yedek modele düşülür", async () => {
    const mockFetch = vi.fn().mockResolvedValue(errorResponse(500));
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const first = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(first.model).toBeNull();
    expect(first.reason).toBe("list-unavailable");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(second.reason).toBe("negative-cache");
    // Olumsuz önbellek: 15 dk boyunca aynı listeyi tekrar tekrar çekmiyoruz.
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(m.getModel("nim", "text", "meta/llama-3.1-8b-instruct")).toEqual({
      model: "meta/llama-3.1-8b-instruct",
      source: "fallback",
    });
  });

  it("NUTRI_AI_AUTOMODEL=0 iken hiçbir keşif isteği yapılmaz", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels({ ...keys, NUTRI_AI_AUTOMODEL: "0" });

    const res = await m.refreshOnFailure("opencode", "text", { budgetMs: 8000 });
    expect(res.reason).toBe("automodel-off");
    expect(res.model).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("kalan bütçe tek yoklamaya yetmiyorsa ağ açılmaz (bütçe değişmezinin parçası)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels(keys);

    const res = await m.refreshOnFailure("opencode", "text", { budgetMs: 100 });
    expect(res.reason).toBe("no-budget");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("OpenCode'da ücretsiz modeller öncelikli; vision modunda ücretsiz vision yoksa aday bulunamaz", async () => {
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/models")) {
        return listResponse(["gpt-6-astra", "jev-1.13-free", "deepseek-v4-flash-free"]);
      }
      const body = JSON.parse(init.body);
      // Olay günü kanıt: `deepseek-v4-flash-free` listede duruyor ama 400 veriyor.
      return body.model === "deepseek-v4-flash-free" ? errorResponse(400) : okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const found = await m.refreshOnFailure("opencode", "text", { budgetMs: 8000 });
    expect(found.probed[0]).toBe("deepseek-v4-flash-free");
    expect(found.model).toBe("jev-1.13-free");

    // `-free` havuzunda vision modeli yok → görsel için keşif sonuç üretmez
    // (bu yüzden görsel zincirde OpenCode adımı yok; bkz. server/ai.js).
    const vision = await m.refreshOnFailure("opencode", "vision", { budgetMs: 8000 });
    expect(vision.reason).toBe("no-candidates");
    expect(vision.model).toBeNull();
  });

  it("invalidate: zaman aşımından sonra seçim tazelenir (aynı model tekrar tekrar denenmez)", async () => {
    const mockFetch = vi.fn(async (url) => {
      if (String(url).endsWith("/models")) return listResponse(["meta/llama3-chatqa-1.5-70b"]);
      return okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(m.getModel("nim", "text", "yedek").source).toBe("cached");

    // invalidate kaydı SİLER: olumsuz önbellek yazsaydı keşif 15 dk kilitlenirdi.
    m.invalidate("nim", "text");
    expect(m.getModel("nim", "text", "yedek").source).toBe("env");

    const again = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(again.model).toBe("meta/llama3-chatqa-1.5-70b");
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("asla throw etmez: ağ çökse bile 'model bulunamadı' döner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ağ yok")),
    );
    const m = await loadModels(keys);

    const res = await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    expect(res.model).toBeNull();
    expect(res.reason).toBe("list-unavailable");
    await expect(m.refreshOnFailure("bilinmeyen", "text", {})).resolves.toMatchObject({
      model: null,
      reason: "unknown-provider",
    });
    expect(() => m.invalidate("yok", "text")).not.toThrow();
  });

  it("snapshot teşhis için seçimi ve yaşını verir; reset temizler", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse(["meta/llama3-chatqa-1.5-70b"]))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    await m.refreshOnFailure("nim", "text", { budgetMs: 8000 });
    const snap = m.snapshot();
    expect(snap.automodel).toBe(true);
    expect(snap.entries).toEqual([
      expect.objectContaining({ key: "nim:text", model: "meta/llama3-chatqa-1.5-70b" }),
    ]);

    m.reset();
    expect(m.snapshot().entries).toEqual([]);
  });

  it("setDiscovered: arka plan taraması modeli cache'e yazar, ağ olmadan getModel döner", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const m = await loadModels(keys);

    expect(m.getModel("openrouter", "text", "openrouter/free").source).toBe("env");

    m.setDiscovered("openrouter", "text", "cohere/north-mini-code:free");
    expect(m.getModel("openrouter", "text", "openrouter/free")).toEqual({
      model: "cohere/north-mini-code:free",
      source: "cached",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() => m.setDiscovered("yok", "text", "useless")).not.toThrow();
  });

  it("openrouter pick: `:free` sonekli adları öne alır; kara listedeki kod modellerini atlar; openrouter/free en önde", async () => {
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/models")) {
        return listResponse([
          "openai/gpt-4o-mini",
          "openrouter/free",
          "cohere/north-mini-code:free",
          "anthropic/claude-opus-5",
        ]);
      }
      return okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels(keys);

    const found = await m.refreshOnFailure("openrouter", "text", { budgetMs: 8000 });
    // `north-mini-code` kara listede (kod modeli, prod'da timeout) → aday değil.
    expect(found.model).toBe("openrouter/free");
    expect(found.model).not.toBe("openai/gpt-4o-mini"); // ücretli hiç aday değil
    expect(found.probed).toEqual(["openrouter/free"]);

    // Metin adayında vision filtresi `:free`+vision yok → aday çıkmaz.
    const vision = await m.refreshOnFailure("openrouter", "vision", { budgetMs: 8000 });
    expect(vision.reason).toBe("no-candidates");
  });

  it("ollama (native): pick yalnızca plan-dahili küme adlarını süzer; /api/chat native body kullanır", async () => {
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith("/api/tags")) {
        return listResponse([
          "gemma4:31b",
          "gpt-oss:120b",
          "deepseek-v4.1-flash",
          "kimi-k2.6",
          "nemotron-3-ultra",
          "llama3.2",
        ]);
      }
      const body = JSON.parse(init.body);
      expect(url).toBe("https://ollama.com/api/chat");
      expect(body).toMatchObject({ model: "gemma4:31b", stream: false });
      return okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    const m = await loadModels({ ...keys, OLLAMA_CLOUD_API_KEY: "ollama_key" });

    const found = await m.refreshOnFailure("ollama", "text", { budgetMs: 8000 });
    expect(found.model).toBe("gemma4:31b"); // score=1 (31b) → deepseek/kimi dışlanır
    expect(found.probed).not.toContain("deepseek-v4.1-flash");
    expect(found.probed).not.toContain("kimi-k2.6");
  });

  it("cloudflare: hesap-id yoksa listeleme/keşif devre dışı kalır (deneysel, güvenli enayi)", async () => {
    const mockFetch = vi.fn(async (url) => {
      if (String(url).includes("/models/search")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              result: [{ id: "@cf/google/gemma-2b-it-lora" }, { id: "@cf/meta/llama-3.2-3b-instruct" }],
            }),
        };
      }
      return okResponse();
    });
    vi.stubGlobal("fetch", mockFetch);
    // hesap-id yok: listUrl fonksiyonu çözülemez → [ ]
    const m = await loadModels({ CLAUDEFLARE_API_KEY: "cf_key" });
    const found = await m.refreshOnFailure("cloudflare", "text", { budgetMs: 8000, status: 400 });
    expect(found.model).toBeNull();

    // hesap-id VAR: adres çözülür, pick ücretsiz LoRA'yı bulur
    const m2 = await loadModels({
      CLAUDEFLARE_API_KEY: "cf_key",
      CLAUDEFLARE_ACCOUNT_ID: "acct-1",
    });
    const found2 = await m2.refreshOnFailure("cloudflare", "text", { budgetMs: 8000, status: 400 });
    expect(found2.model).toBe("@cf/google/gemma-2b-it-lora");
  });
});

describe("Gemini catalog", () => {
  const configured = { GEMINI_API_KEY: "test_gemini_key" };
  const model = (id, version = "001", methods = ["generateContent"]) => ({
    name: `models/${id}`,
    version,
    supportedGenerationMethods: methods,
  });
  const page = (models, nextPageToken) => Response.json({ models, nextPageToken });

  it("lists every page with the Gemini key header and exposes candidates by method", async () => {
    const api = await loadModels(configured);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        page([model("first"), model("embed", "001", ["embedContent"])], "next & token"),
      )
      .mockResolvedValueOnce(
        page([model("unseen-name", null, ["generateContent", "countTokens"])]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.refreshGeminiCatalog();
    expect(result.ok).toBe(true);
    expect(result.catalog.models.map(({ id }) => id)).toEqual([
      "models/first",
      "models/embed",
      "models/unseen-name",
    ]);
    expect(result.catalog.candidates).toContainEqual({
      id: "models/unseen-name",
      version: null,
      methods: ["countTokens", "generateContent"],
    });
    expect(result.catalog.candidates.map(({ id }) => id)).toEqual([
      "models/first",
      "models/unseen-name",
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models");
    expect(init).toMatchObject({ method: "GET", headers: { "x-goog-api-key": "test_gemini_key" } });
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("pageToken")).toBe("next & token");
  });

  it("keeps the last complete snapshot if a later page fails or repeats its token", async () => {
    const api = await loadModels(configured);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(page([model("stable")]))
        .mockResolvedValueOnce(page([model("partial")], "next"))
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(page([model("partial")], "same"))
        .mockResolvedValueOnce(page([], "same")),
    );

    const { catalog } = await api.refreshGeminiCatalog();
    expect(await api.refreshGeminiCatalog()).toEqual({
      ok: false,
      reason: "http-error",
      status: 403,
      catalog,
    });
    expect(await api.refreshGeminiCatalog()).toEqual({
      ok: false,
      reason: "repeated-page-token",
      catalog,
    });
    expect(api.getGeminiCatalog()).toBe(catalog);
  });

  it("bounds all pages by one timeout and returns the startup failure reason", async () => {
    const api = await loadModels({ ...configured, NUTRI_AI_DISCOVER_BUDGET_MS: "25" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([], "next"))
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    expect(await api.refreshGeminiCatalog()).toEqual({
      ok: false,
      reason: "timeout",
      catalog: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal).toBe(fetchMock.mock.calls[0][1].signal);
  });

  it("shares simultaneous refreshes and preserves record identity only for unchanged models", async () => {
    const api = await loadModels(configured);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([model("removed"), model("updated"), model("unchanged")]))
      .mockResolvedValueOnce(page([model("updated", "002"), model("unchanged")]));
    vi.stubGlobal("fetch", fetchMock);
    const first = api.refreshGeminiCatalog();
    expect(api.refreshGeminiCatalog()).toBe(first);
    const { catalog: previous } = await first;

    const { catalog: current } = await api.refreshGeminiCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(current.revision).toBe(previous.revision + 1);
    expect(current.candidates.map(({ id }) => id)).toEqual(["models/updated", "models/unchanged"]);
    expect(current.candidates[0]).not.toBe(previous.candidates[1]);
    expect(current.candidates[0].version).toBe("002");
    expect(current.candidates[1]).toBe(previous.candidates[2]);
  });

  it("refreshes once per request for 404 or 410 and shares the attempt across requests", async () => {
    const api = await loadModels(configured);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([model("old")]))
      .mockResolvedValueOnce(page([model("new")]));
    vi.stubGlobal("fetch", fetchMock);
    await api.refreshGeminiCatalog();
    const deadline = Date.now() + 5000;
    const requestA = api.createGeminiCatalogRecovery(deadline);
    const requestB = api.createGeminiCatalogRecovery(deadline);
    const requestC = api.createGeminiCatalogRecovery(deadline);

    expect(await requestA(403)).toBe(null);
    const [first, second] = await Promise.all([requestA(404), requestB(410)]);
    expect(first).toBe(second);
    expect(first.catalog.candidates[0].id).toBe("models/new");
    expect(await requestC(404)).toBe(first);
    expect(await requestA(410)).toBe(null);
    expect(await api.createGeminiCatalogRecovery(Date.now() - 1)(404)).toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Gemini catalog recovery deadlines", () => {
  it("reuses an in-progress refresh observed at request start even if it has finished by the 404", async () => {
    const api = await loadModels({ GEMINI_API_KEY: "test_gemini_key" });
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ models: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await api.refreshGeminiCatalog();

    const scheduledRefresh = api.refreshGeminiCatalog();
    const recover = api.createGeminiCatalogRecovery(Date.now() + 5000);
    const result = await scheduledRefresh;
    expect(await recover(404)).toBe(result);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops waiting at a request deadline without cancelling an existing refresh", async () => {
    const api = await loadModels({ GEMINI_API_KEY: "test_gemini_key" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let complete;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    vi.useFakeTimers();
    try {
      const refresh = api.refreshGeminiCatalog();
      const recovery = api.createGeminiCatalogRecovery(Date.now() + 25)(410);
      await vi.advanceTimersByTimeAsync(25);
      expect(await recovery).toEqual({ ok: false, reason: "timeout", catalog: null });
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);

      complete(Response.json({ models: [] }));
      expect((await refresh).ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Gemini refresh waiters", () => {
  it("keeps the shared fetch alive when the caller starting recovery has the shortest deadline", async () => {
    const api = await loadModels({ GEMINI_API_KEY: "test_gemini_key" });
    let complete;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const recoverShort = api.createGeminiCatalogRecovery(Date.now() + 20);
      const recoverLong = api.createGeminiCatalogRecovery(Date.now() + 200);
      const shortRecovery = recoverShort(404);
      const longRecovery = recoverLong(410);
      const ordinaryWaiter = api.refreshGeminiCatalog({ timeoutMs: 35 });

      await vi.advanceTimersByTimeAsync(20);
      expect(await shortRecovery).toEqual({ ok: false, reason: "timeout", catalog: null });
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(15);
      expect(await ordinaryWaiter).toEqual({ ok: false, reason: "timeout", catalog: null });
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);

      complete(Response.json({ models: [] }));
      expect((await longRecovery).ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
