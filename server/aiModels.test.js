import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["GEMINI_API_KEY", "NUTRI_AI_DISCOVER_BUDGET_MS"];

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
      const recovery = api.createGeminiCatalogRecovery(Date.now() + 100)(410, Date.now() + 25);
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
