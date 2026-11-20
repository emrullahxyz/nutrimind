import { afterEach, describe, expect, it, vi } from "vitest";
import ai from "./ai.js";
import discovery from "./aiDiscovery.js";

const product = {
  name: "Mavrix 7K",
  kcal: 273,
  protein: 13,
  carbs: 26,
  fat: 12,
  fiber: 4,
  baseAmount: 100,
};

const record = (id, metadata = {}) => ({
  name: "models/" + id,
  supportedGenerationMethods: ["generateContent"],
  ...metadata,
});

async function catalog(...models) {
  ai.aiModels.resetGeminiCatalog();
  vi.stubEnv("GEMINI_API_KEY", "private-test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ models })),
  );
  return (await ai.aiModels.refreshGeminiCatalog()).catalog.candidates;
}

function reply(items = [product], extra = {}) {
  return Response.json({
    modelVersion: "concrete-variant-001",
    candidates: [
      {
        content: { parts: [{ text: JSON.stringify({ items, ...extra }) }] },
        finishReason: "STOP",
      },
    ],
  });
}

function failure(message, status = 400, details = [], headers) {
  return Response.json({ error: { message, details } }, { status, headers });
}

function mockGeneration(respond) {
  const requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      const [, resource] = String(url).match(/\/v1beta\/(models\/[^:]+):generateContent$/);
      const body = JSON.parse(init.body);
      const [text, image] = body.contents[0].parts;
      const request = {
        resource,
        prompt: text.text,
        image: image?.inline_data,
        schema: body.generationConfig?.responseSchema,
        key: init.headers["x-goog-api-key"],
      };
      requests.push(request);
      return respond(request);
    }),
  );
  return requests;
}

const actualMeal = {
  prompt: "private meal text",
  imageBase64: "private user photo",
  mimeType: "image/jpeg",
};

afterEach(() => {
  discovery.stopGeminiDiscovery();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("authenticated Gemini generation capabilities", () => {
  it("requires separate text and vision proof and withholds the real photo from an image-blind model", async () => {
    const [first, second, third] = await catalog(record("a1"), record("b2"), record("c3"));
    const requests = mockGeneration(({ resource, image, prompt }) => {
      if (image?.data === actualMeal.imageBase64) return reply();
      if ((resource === first.id && image) || (resource === second.id && !image)) {
        return failure("This model does not support the requested input modality.");
      }
      if (resource === third.id && image) return reply([{ ...product, kcal: 200 }]);
      if (image) {
        expect(image.mime_type).toBe("image/png");
        expect(Buffer.from(image.data, "base64").subarray(0, 8).toString("hex")).toBe(
          "89504e470d0a1a0a",
        );
        expect(prompt).not.toMatch(/Mavrix|273|13|26|12/);
      } else {
        expect(prompt).toContain("Mavrix 7K");
        expect(prompt).toContain("273");
      }
      return reply();
    });
    const { ensureGeminiCapability: ensure, runVerifiedGemini: run } = ai;
    expect(await run(second, "vision", actualMeal)).toMatchObject({
      ok: false,
      kind: "unverified",
    });
    expect(requests).toEqual([]);
    expect(await ensure(first, "text")).toMatchObject({ ok: true, format: "schema" });
    expect(await ensure(first, "vision")).toMatchObject({
      ok: false,
      kind: "unsupported-modality",
    });
    expect(await ensure(second, "text")).toMatchObject({ ok: false, kind: "unsupported-modality" });
    expect(await ensure(second, "vision")).toMatchObject({
      ok: true,
      modelVersion: "concrete-variant-001",
    });
    expect(await ensure(third, "vision")).toMatchObject({ ok: false, kind: "bad-response" });
    expect(await run(third, "vision", actualMeal)).toMatchObject({
      ok: false,
      kind: "incompatible",
    });
    expect(await run(second, "vision", actualMeal)).toMatchObject({
      ok: true,
      modelVersion: "concrete-variant-001",
    });
    expect(
      requests
        .filter(({ image }) => image?.data === actualMeal.imageBase64)
        .map(({ resource }) => resource),
    ).toEqual([second.id]);
  });

  it("tries prompt-only JSON once on explicit schema rejection and reuses it through the same item validator", async () => {
    const [model] = await catalog(record("d4"));
    let response = () => reply();
    const requests = mockGeneration(({ schema }) =>
      schema ? failure("responseSchema is not supported for this model.") : response(),
    );
    expect(await ai.ensureGeminiCapability(model, "vision")).toMatchObject({
      ok: true,
      format: "json",
    });
    response = () => reply([{ ...product, confidence: 0.4 }], { healthNote: "Check serving" });
    expect(await ai.runVerifiedGemini(model, "vision", actualMeal)).toMatchObject({
      ok: true,
      body: {
        items: [
          { name: product.name, nutrition: { kcal: 273 }, needsReview: true, baseAmount: 100 },
        ],
        healthNote: "Check serving",
      },
    });
    response = () => reply([]);
    expect(await ai.runVerifiedGemini(model, "vision", actualMeal)).toMatchObject({
      ok: true,
      body: { items: [] },
    });
    response = () => reply([{ ...product, protein: "13" }]);
    expect(await ai.runVerifiedGemini(model, "vision", actualMeal)).toMatchObject({
      ok: false,
      kind: "bad-response",
    });
    expect(requests.map(({ schema }) => Boolean(schema))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(requests[1].prompt).toContain("Reply ONLY with JSON");
    expect(requests[2].prompt).toContain(actualMeal.prompt);
    expect(requests.every(({ key }) => key === "private-test-key")).toBe(true);
  });

  it("keeps invalid-image, quota, busy, and key errors separate from incompatibility", async () => {
    const [model] = await catalog(record("e5"));
    let respond = () => reply();
    const requests = mockGeneration(() => respond());
    await ai.ensureGeminiCapability(model, "vision");

    const errors = [
      [() => failure("Unable to process input image."), "invalid-image"],
      [() => failure("traffic", 503), "unavailable"],
      [
        () =>
          failure("API key not valid.", 400, [
            { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
          ]),
        "invalid-key",
      ],
      [() => failure("forbidden", 403), "forbidden"],
    ];
    for (const [response, kind] of errors) {
      respond = response;
      expect(await ai.runVerifiedGemini(model, "vision", actualMeal)).toMatchObject({
        ok: false,
        kind,
      });
      expect(ai.getGeminiCapability(model, "vision").state).toBe("verified");
    }
    respond = () =>
      failure(
        "private user photo",
        429,
        [
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2.5s" },
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                quotaMetric:
                  "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                quotaValue: "20",
                quotaDimensions: { model: "e5", private: "private user photo" },
              },
            ],
          },
        ],
        { "Retry-After": "4" },
      );
    const quota = await ai.runVerifiedGemini(model, "vision", actualMeal);
    expect(quota).toMatchObject({
      ok: false,
      kind: "rate-limit",
      upstream: 429,
      retryAfterMs: 4000,
      quota: {
        violations: [
          {
            quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            quotaValue: 20,
            quotaDimensions: { model: "e5" },
          },
        ],
      },
    });
    expect(JSON.stringify(quota)).not.toContain("private");
    expect(requests).toHaveLength(6);
  });

  it("pre-filters declared modalities and forgets a successful proof when declarations change", async () => {
    const [model] = await catalog(
      record("f6", {
        supportedInputModalities: ["TEXT"],
        supportedOutputModalities: ["TEXT"],
      }),
    );
    const requests = mockGeneration(() => reply());
    expect(await ai.ensureGeminiCapability(model, "vision")).toMatchObject({
      ok: false,
      kind: "incompatible",
    });
    expect(requests).toHaveLength(0);
    expect(await ai.ensureGeminiCapability(model, "text")).toMatchObject({ ok: true });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        models: [
          record("f6", {
            supportedInputModalities: ["TEXT", "IMAGE"],
            supportedOutputModalities: ["AUDIO"],
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [changed] = (await ai.aiModels.refreshGeminiCatalog()).catalog.candidates;
    expect(changed).not.toBe(model);
    expect(ai.getGeminiCapability(changed, "text").state).toBe("incompatible");
    expect(await ai.runVerifiedGemini(model, "text", actualMeal)).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an empty list", () => reply([])],
    ["bare text", () => Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] })],
  ])("rejects %s as capability evidence", async (_case, response) => {
    const [model] = await catalog(record("g7"));
    const requests = mockGeneration(response);
    expect(await ai.ensureGeminiCapability(model, "text")).toMatchObject({
      ok: false,
      kind: "bad-response",
    });
    expect(ai.getGeminiCapability(model, "text").state).toBe("incompatible");
    expect(requests).toHaveLength(1);
  });

  it("shares overlapping verification for one model and mode", async () => {
    const [model] = await catalog(record("h8"));
    let finish;
    const requests = mockGeneration(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = ai.ensureGeminiCapability(model, "text");
    const second = ai.ensureGeminiCapability(model, "text");
    expect(requests).toHaveLength(1);
    finish(reply());
    const results = await Promise.all([first, second]);
    expect(results[0]).toMatchObject({ ok: true, format: "schema" });
    expect(results[1]).toEqual(results[0]);
  });

  it("revokes vision proof on an explicit image-input rejection", async () => {
    const [model] = await catalog(record("input-change"));
    let response = () => reply();
    const requests = mockGeneration(() => response());
    await ai.ensureGeminiCapability(model, "vision");
    response = () => failure("This model does not support images.");
    expect(await ai.runVerifiedGemini(model, "vision", actualMeal)).toMatchObject({
      ok: false,
      kind: "unsupported-modality",
    });
    expect(await ai.runVerifiedGemini(model, "vision", actualMeal)).toMatchObject({
      ok: false,
      kind: "incompatible",
    });
    expect(requests).toHaveLength(2);
  });

  it("refreshes proof with real use and keeps fresh proof across an unchanged catalog refresh", async () => {
    const entry = record("fresh-proof");
    const [model] = await catalog(entry);
    vi.useFakeTimers();
    const now = Date.now();
    const requests = mockGeneration(() => reply());
    await ai.ensureGeminiCapability(model, "text");
    vi.setSystemTime(now + 86_399_000);
    expect(await ai.runVerifiedGemini(model, "text", { prompt: actualMeal.prompt })).toMatchObject({
      ok: true,
    });
    vi.setSystemTime(now + 86_401_000);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ models: [entry] })),
    );
    const [same] = (await ai.aiModels.refreshGeminiCatalog()).catalog.candidates;
    expect(same).toBe(model);
    expect(ai.getGeminiCapability(same, "text")).toMatchObject({
      state: "verified",
      verifiedAt: now + 86_399_000,
    });
    expect(requests).toHaveLength(2);
  });

  it("limits a five-minute background round, counts retries, and rotates to other candidates", async () => {
    const models = await catalog(record("i9"), record("j0"), record("k1"));
    vi.useFakeTimers();
    let firstResponse;
    const requests = mockGeneration(({ schema }) => {
      if (requests.length === 1)
        return new Promise((resolve) => {
          firstResponse = resolve;
        });
      return schema ? failure("responseSchema is not supported.") : reply();
    });
    const work = ai.runGeminiProbeRound(models);
    await ai.runGeminiProbeRound(models);
    expect(requests).toHaveLength(1);
    firstResponse(failure("responseSchema is not supported."));
    await work;
    await ai.runGeminiProbeRound(models);
    expect(requests).toHaveLength(2);
    expect(requests.map(({ resource }) => resource)).toEqual([models[0].id, models[0].id]);
    await vi.advanceTimersByTimeAsync(300_000);
    await ai.runGeminiProbeRound(models);
    expect(requests.map(({ resource }) => resource)).toEqual([
      models[0].id,
      models[0].id,
      models[1].id,
      models[1].id,
    ]);
  });

  it("starts a separate capability timer when discovery is given a probe callback", async () => {
    await catalog(record("l2"));
    vi.useFakeTimers();
    const requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ models: [record("l2")] })),
    );
    const stop = discovery.startGeminiDiscovery(undefined, {
      probeRound: (models) => requests.push(models[0]?.id),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toEqual(["models/l2"]);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(requests).toEqual(["models/l2", "models/l2"]);
    stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(requests).toHaveLength(2);
  });
});
