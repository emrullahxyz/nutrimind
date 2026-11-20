import { afterEach, describe, expect, it, vi } from "vitest";
import ai from "./ai.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const routing = require("./aiGeminiRouting.js");

const { createGeminiRouting, nextPacificMidnight } = routing;
const success = (modelVersion) => ({
  ok: true,
  modelVersion,
  state: "verified",
  format: "schema",
  latencyMs: 10,
  body: { items: [] },
});
const limited = (quotaId, model, retryAfterMs, scope) => ({
  ok: false,
  kind: "rate-limit",
  upstream: 429,
  retryAfterMs,
  quota: { violations: [{ quotaId, quotaValue: 12, quotaDimensions: { model, scope } }] },
});

function fixture(names, verified = true) {
  let catalog = {
    refreshedAt: Date.now(),
    candidates: names.map((id) => ({ id: "models/" + id, version: "001" })),
  };
  const getGeminiCapability = vi.fn((model) =>
    verified ? success(model.actual ?? null) : { state: "untested" },
  );
  const runVerifiedGemini = vi.fn(async (model) => success(model.actual ?? model.id));
  const ensureGeminiCapability = vi.fn(async (model) => success(model.actual ?? model.id));
  const runGeminiProbeRound = vi.fn(async (candidates, { allow, onResult }) => {
    for (const model of candidates)
      if (allow(model, "text"))
        onResult(model, "text", await ensureGeminiCapability(model, "text"));
  });
  const recover = vi.fn();
  const api = createGeminiRouting({
    getGeminiCatalog: () => catalog,
    refreshGeminiCatalog: vi.fn(),
    createGeminiCatalogRecovery: () => recover,
    getGeminiCapability,
    runVerifiedGemini,
    ensureGeminiCapability,
    runGeminiProbeRound,
    getApiKey: () => "fake-key",
  });
  return {
    ...api,
    getGeminiCapability,
    runVerifiedGemini,
    ensureGeminiCapability,
    recover,
    catalog,
    replace: (candidates) => {
      catalog = { ...catalog, candidates };
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("Gemini routing", () => {
  it("shares named runtime quota with aliases and vision, then reuses after the reported delay", async () => {
    vi.useFakeTimers();
    const f = fixture(["alias-a", "alias-b", "independent"]);
    for (const model of f.catalog.candidates.slice(0, 2)) model.actual = "runtime-v2";
    f.runVerifiedGemini.mockResolvedValueOnce(
      limited("RequestsPerMinutePerProjectPerModel", "runtime-v2", 80_000),
    );
    await expect(f.routeGemini("text", {})).resolves.toMatchObject({ status: 200 });
    expect(f.runVerifiedGemini.mock.calls.map(([m]) => m.id)).toEqual([
      "models/alias-a",
      "models/independent",
    ]);
    await f.routeGemini("vision", {});
    expect(f.runVerifiedGemini.mock.calls.at(-1)[0].id).toBe("models/independent");
    const quota = f.geminiRoutingSnapshot().models[1].waiting;
    expect(quota).toMatchObject({
      reason: "rate-limit",
      retryAt: Date.now() + 80_000,
      limits: [{ quotaValue: 12 }],
    });
    vi.advanceTimersByTime(80_000);
    await f.routeGemini("vision", {});
    expect(f.runVerifiedGemini.mock.calls.at(-1)[0].id).toBe("models/alias-a");
  });

  it("stops after explicit project quota and avoids the network while cooling", async () => {
    vi.useFakeTimers();
    const f = fixture(["a", "b"]);
    f.runVerifiedGemini.mockResolvedValueOnce(
      limited("RequestsPerMinutePerProject", undefined, 5_500),
    );
    expect(await f.routeGemini("text", {})).toMatchObject({ status: 429, body: { retryAfter: 6 } });
    await f.probeGeminiRoutingRound(f.catalog.candidates);
    expect(await f.routeGemini("vision", {})).toMatchObject({
      status: 429,
      body: { code: "ai_rate_limit", retryAfter: 6 },
    });
    expect(f.runVerifiedGemini).toHaveBeenCalledTimes(1);
    expect(f.ensureGeminiCapability).not.toHaveBeenCalled();
  });

  it("reports when every otherwise eligible model is limited and uses the earliest retry", async () => {
    vi.useFakeTimers();
    const f = fixture(["a", "b"]);
    f.runVerifiedGemini
      .mockResolvedValueOnce(limited("RPM", "a", 15_000))
      .mockResolvedValueOnce(limited("RPM", "b", 30_000));
    expect(await f.routeGemini("text", {})).toMatchObject({
      status: 429,
      body: { retryAfter: 15 },
    });
    await f.routeGemini("vision", {});
    expect(f.runVerifiedGemini).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["2026-07-04T00:15:00Z", "2026-07-04T07:00:00Z"],
    ["2026-01-04T00:15:00Z", "2026-01-04T08:00:00Z"],
    ["2026-03-08T10:30:00Z", "2026-03-09T07:00:00Z"],
    ["2026-11-01T09:30:00Z", "2026-11-02T08:00:00Z"],
  ])("uses the next Pacific midnight from %s", (now, midnight) => {
    expect(nextPacificMidnight(Date.parse(now))).toBe(Date.parse(midnight));
  });

  it("honors an explicit daily wait longer than the next Pacific midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T06:59:00Z"));
    const f = fixture(["a"]);
    f.runVerifiedGemini.mockResolvedValueOnce(
      limited("GenerateRequestsPerDayPerProjectPerModel", "a", 120_000),
    );
    expect(await f.routeGemini("text", {})).toMatchObject({
      status: 429,
      body: { retryAfter: 120 },
    });
  });

  it("reserves generation time for a fallback and never exceeds the request deadline", async () => {
    vi.useFakeTimers();
    const f = fixture(["first", "second"]);
    const start = Date.now();
    f.runVerifiedGemini.mockImplementationOnce(async (_model, _mode, { deadlineAt }) => {
      await new Promise((resolve) => setTimeout(resolve, deadlineAt - Date.now()));
      return { ok: false, kind: "timeout" };
    });
    const pending = f.routeGemini("text", {});
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ status: 200 });
    expect(Date.now() - start).toBe(12_500);
    expect(f.runVerifiedGemini.mock.calls.at(-1)[2].deadlineAt).toBe(start + 25_000);
  });

  it.each([
    [15_000, 502, "ai_provider_error"],
    [25_000, 504, "ai_timeout"],
  ])(
    "classifies a 503 followed by a fallback that times out at %d ms",
    async (duration, status, code) => {
      vi.useFakeTimers();
      const f = fixture(["first", "second"]);
      const start = Date.now();
      f.runVerifiedGemini
        .mockResolvedValueOnce({ ok: false, kind: "unavailable", upstream: 503 })
        .mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, duration));
          return { ok: false, kind: "timeout" };
        });
      const pending = f.routeGemini("text", {});
      await vi.advanceTimersByTimeAsync(duration);
      expect(await pending).toMatchObject({ status, body: { code } });
      expect(Date.now() - start).toBe(duration);
    },
  );

  it("keeps attempted names across replacement records and progresses through fast catalog failures", async () => {
    const f = fixture(["a", "b", "c", "d"], false);
    f.ensureGeminiCapability.mockImplementation(async (model) =>
      model.id === "models/d" ? success("d") : { ok: false, kind: "missing-model", upstream: 404 },
    );
    f.recover.mockImplementationOnce(async () => {
      f.replace(f.catalog.candidates.map((m) => ({ ...m })));
    });
    expect(await f.routeGemini("text", {})).toMatchObject({ status: 502 });
    expect(await f.routeGemini("text", {})).toMatchObject({ status: 200 });
    expect(f.ensureGeminiCapability.mock.calls.map(([m]) => m.id)).toEqual([
      "models/a",
      "models/b",
      "models/c",
      "models/d",
    ]);
  });

  it("does not repeat an already attempted known runtime and does not use catalog version as the identity", async () => {
    const f = fixture(["a", "b", "c"]);
    f.catalog.candidates[0].actual = f.catalog.candidates[1].actual = "actual-a";
    f.runVerifiedGemini.mockResolvedValueOnce({ ok: false, kind: "unavailable", upstream: 503 });
    expect(await f.routeGemini("text", {})).toMatchObject({ status: 200 });
    expect(f.runVerifiedGemini.mock.calls.map(([m]) => m.id)).toEqual(["models/a", "models/c"]);
  });

  it("makes forbidden model-local and invalid credentials project-wide", async () => {
    const f = fixture(["a", "b", "c"]);
    f.runVerifiedGemini
      .mockResolvedValueOnce({ ok: false, kind: "forbidden", upstream: 403 })
      .mockResolvedValueOnce({ ok: false, kind: "invalid-key", upstream: 403 });
    expect(await f.routeGemini("text", {})).toMatchObject({
      status: 502,
      body: { code: "ai_provider_error" },
    });
    expect(f.runVerifiedGemini).toHaveBeenCalledTimes(2);
  });
});

describe("Gemini routing with the real catalog and capability modules", () => {
  afterEach(() => {
    ai.aiModels.resetGeminiCatalog();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses both provider retry signals and keeps raw replies and user data out of diagnostics", async () => {
    const key = "private-integration-key";
    const privateText = "a private meal";
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", key);
    const now = Date.now();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          models: [
            { name: "models/integration-one", supportedGenerationMethods: ["generateContent"] },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          modelVersion: "integration-one-001",
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      items: [
                        {
                          name: "Mavrix 7K",
                          kcal: 273,
                          protein: 13,
                          carbs: 26,
                          fat: 12,
                          fiber: 4,
                          baseAmount: 100,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              message: privateText,
              details: [
                { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21.1s" },
                {
                  "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                  violations: [
                    {
                      quotaId: "GenerateRequestsPerMinutePerProjectPerModel",
                      quotaValue: 1,
                      quotaMetric: key,
                      quotaDimensions: { model: "integration-one-001" },
                      description: privateText,
                    },
                  ],
                },
              ],
            },
          },
          { status: 429, headers: { "Retry-After": "28" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(await ai.routeGemini("text", { prompt: privateText })).toMatchObject({
      status: 429,
      body: { code: "ai_rate_limit", retryAfter: 28 },
    });
    expect(await ai.routeGemini("vision", {})).toMatchObject({
      status: 429,
      body: { retryAfter: 28 },
    });
    const diagnostic = ai.geminiRoutingSnapshot();
    expect(diagnostic).toMatchObject({
      catalogRefreshedAt: now,
      projectWaiting: null,
      models: [
        {
          text: { state: "verified", modelVersion: "integration-one-001" },
          vision: { state: "untested" },
          waiting: {
            reason: "rate-limit",
            retryAt: now + 28_000,
            limits: [{ quotaValue: 1, quotaMetric: null }],
          },
        },
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain(privateText);
    expect(JSON.stringify(diagnostic)).not.toContain(key);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).contents[0].parts[0].text).toContain(
      "Mavrix 7K",
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).contents[0].parts[0].text).toBe(privateText);
  });

  it("counts catalog and upstream body reads against the same original deadline", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "different-integration-key");
    const start = Date.now();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const product = {
      name: "Mavrix 7K",
      kcal: 273,
      protein: 13,
      carbs: 26,
      fat: 12,
      fiber: 4,
      baseAmount: 100,
    };
    const payload = JSON.stringify({
      modelVersion: "deadline-model-001",
      candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [product] }) }] } }],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => {
          await wait(5_000);
          return {
            models: [
              { name: "models/deadline-model", supportedGenerationMethods: ["generateContent"] },
            ],
          };
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => {
          await wait(8_000);
          return payload;
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => {
          await wait(12_000);
          return payload;
        },
      });
    vi.stubGlobal("fetch", fetchMock);
    const pending = ai.routeGemini("text", { prompt: "deadline test" });
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ status: 504, body: { code: "ai_timeout" } });
    expect(Date.now() - start).toBe(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Gemini shared failure and credential boundaries", () => {
  afterEach(() => {
    ai.aiModels.resetGeminiCatalog();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("shares quota when the dimension is another known alias", async () => {
    const f = fixture(["alias-a", "alias-b", "alias-c", "independent"]);
    for (const model of f.catalog.candidates.slice(0, 3)) model.actual = "common-runtime";
    f.runVerifiedGemini.mockResolvedValueOnce(
      limited("RequestsPerMinutePerModel", "alias-b", 91_000),
    );
    await f.routeGemini("text", {});
    await f.routeGemini("vision", {});
    expect(f.runVerifiedGemini.mock.calls.map(([model]) => model.id)).toEqual([
      "models/alias-a",
      "models/independent",
      "models/independent",
    ]);
  });
  it("does one cold listing within a shared 429 window and uses bounded numeric retry", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", "cold-quota-credential");
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "42s" }],
            },
          },
          { status: 429, headers: { "Retry-After": "9".repeat(307) } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ models: [] }));
    vi.stubGlobal("fetch", request);
    expect(await ai.routeGemini("text", {})).toMatchObject({
      status: 429,
      body: { retryAfter: 42 },
    });
    expect(await ai.routeGemini("vision", {})).toMatchObject({
      status: 429,
      body: { retryAfter: 42 },
    });
    expect(ai.geminiRoutingSnapshot().projectWaiting).toMatchObject({
      reason: "rate-limit",
      retryAt: Date.now() + 42_000,
    });
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(42_000);
    await ai.routeGemini("text", {});
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("holds a rejected cold credential and immediately retries with the replacement", async () => {
    vi.stubEnv("GEMINI_API_KEY", "cold-rejected-credential");
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              details: [
                { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
              ],
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ models: [] }));
    vi.stubGlobal("fetch", request);
    expect(await ai.routeGemini("text", {})).toMatchObject({ status: 502 });
    expect(await ai.routeGemini("vision", {})).toMatchObject({ status: 502 });
    expect(request).toHaveBeenCalledTimes(1);
    vi.stubEnv("GEMINI_API_KEY", "cold-replacement-credential");
    await ai.routeGemini("text", {});
    expect(request).toHaveBeenCalledTimes(2);
    expect(ai.geminiRoutingSnapshot().projectWaiting).toBe(null);
  });
  it("discards late listings and generation across an A→B→A rotation", async () => {
    const catalogReply = Response.json({
      models: [{ name: "models/rotation-model", supportedGenerationMethods: ["generateContent"] }],
    });
    const generated = () =>
      Response.json({
        modelVersion: "rotation-runtime",
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      {
                        name: "Mavrix 7K",
                        kcal: 273,
                        protein: 13,
                        carbs: 26,
                        fat: 12,
                        fiber: 4,
                        baseAmount: 100,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      });
    let finishOldList, finishOldGenerate;
    const a = "first-rotation-secret";
    const b = "second-rotation-secret";
    vi.stubEnv("GEMINI_API_KEY", a);
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldList = resolve;
          }),
      )
      .mockResolvedValueOnce(catalogReply.clone())
      .mockResolvedValueOnce(generated())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldGenerate = resolve;
          }),
      )
      .mockResolvedValueOnce(catalogReply.clone());
    vi.stubGlobal("fetch", request);
    const lateCatalog = ai.aiModels.refreshGeminiCatalog();
    vi.stubEnv("GEMINI_API_KEY", b);
    const { catalog } = await ai.aiModels.refreshGeminiCatalog();
    finishOldList(catalogReply);
    expect((await lateCatalog).ok).toBe(false);
    expect(ai.aiModels.getGeminiCatalog()).toBe(catalog);
    const [old] = catalog.candidates;
    expect((await ai.ensureGeminiCapability(old, "text")).ok).toBe(true);
    const lateGeneration = ai.routeGemini("text", { prompt: "private-input" });
    vi.stubEnv("GEMINI_API_KEY", a);
    const { catalog: newCatalog } = await ai.aiModels.refreshGeminiCatalog();
    expect(newCatalog.candidates[0]).not.toBe(old);
    finishOldGenerate(generated());
    expect((await lateGeneration).status).toBe(502);
    expect(ai.getGeminiCapability(old, "text").state).toBe("untested");
    expect(ai.getGeminiCapability(newCatalog.candidates[0], "text").state).toBe("untested");
    const data = JSON.stringify(ai.geminiRoutingSnapshot());
    expect(data).not.toContain(a);
    expect(data).not.toContain(b);
    expect(ai.geminiRoutingSnapshot().active.text).toBe(null);
  });

  it("does not join or publish an old credential's in-flight synthetic proof", async () => {
    const list = () =>
      Response.json({
        models: [
          { name: "models/proof-rotation", supportedGenerationMethods: ["generateContent"] },
        ],
      });
    const reply = (modelVersion) =>
      Response.json({
        modelVersion,
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    items: [
                      {
                        name: "Mavrix 7K",
                        kcal: 273,
                        protein: 13,
                        carbs: 26,
                        fat: 12,
                        fiber: 4,
                        baseAmount: 100,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      });
    let finishOldProof;
    const request = vi
      .fn()
      .mockResolvedValueOnce(list())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldProof = resolve;
          }),
      )
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(reply("new-proof-runtime"));
    vi.stubGlobal("fetch", request);
    vi.stubEnv("GEMINI_API_KEY", "old-proof-credential");
    const { catalog: previous } = await ai.aiModels.refreshGeminiCatalog();
    const proof = ai.ensureGeminiCapability(previous.candidates[0], "text");
    vi.stubEnv("GEMINI_API_KEY", "new-proof-credential");
    const { catalog: current } = await ai.aiModels.refreshGeminiCatalog();
    expect(await ai.ensureGeminiCapability(current.candidates[0], "text")).toMatchObject({
      ok: true,
      modelVersion: "new-proof-runtime",
    });
    finishOldProof(reply("old-proof-runtime"));
    expect(await proof).toMatchObject({ ok: false });
    expect(ai.geminiRoutingSnapshot().models[0].text.modelVersion).toBe("new-proof-runtime");
    expect(request).toHaveBeenCalledTimes(4);
  });
});
