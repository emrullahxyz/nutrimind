import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const legacyKeys = {
  OPENROUTER_API_KEY: "old-openrouter-key",
  OPENCODE_API_KEY: "old-opencode-key",
  OLLAMA_CLOUD_API_KEY: "old-ollama-key",
  CLAUDEFLARE_API_KEY: "old-cloudflare-key",
  CLAUDEFLARE_ACCOUNT_ID: "old-cloudflare-account",
  NVIDIA_NIM_API_KEY: "old-nim-key",
};

const keys = [
  ...Object.keys(legacyKeys),
  "NUTRIMIND_LLM_PROVIDER",
  "GEMINI_API_KEY",
  "NUTRIMIND_CONFIDENCE_THRESHOLD",
  "NUTRI_AI_RATE_PARSE",
  "NUTRI_AI_RATE_VISION",
  "NUTRI_AI_TIMEOUT_MS",
  "NUTRI_AI_API_WINDOW_MS",
  "NUTRI_AI_BUDGET_MS",
  "NUTRI_AI_MIN_STEP_MS",
  "NUTRI_AI_AUTOMODEL",
];

beforeEach(() => {
  for (const key of keys) vi.stubEnv(key, undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function loadAi(env = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const mod = await import("./ai.js");
  const ai = mod.default ?? mod;
  ai.aiLog.reset();
  ai.aiModels.resetGeminiCatalog();
  return ai;
}

const probeItem = {
  name: "Mavrix 7K",
  kcal: 273,
  protein: 13,
  carbs: 26,
  fat: 12,
  fiber: 4,
  baseAmount: 100,
};
const mealItem = {
  name: "Elma",
  kcal: 50,
  protein: 0.3,
  carbs: 14,
  fat: 0.2,
  fiber: 2.4,
  confidence: 0.95,
};
const isProbe = (init) => init?.body?.includes("Transcribe the supplied nutrition label");
const productionCalls = (mock) =>
  mock.mock.calls.filter(([, init]) => init?.method === "POST" && !isProbe(init));

function generationResponse(items, healthNote, modelVersion = "gemini-real-001") {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ items, healthNote }) }] } }],
    modelVersion,
  });
}

function mockGemini(items = [mealItem], respond = () => generationResponse(items, "health note")) {
  return vi.fn(async (url, init) => {
    if (new URL(url).hostname !== "generativelanguage.googleapis.com") {
      throw new Error("unexpected provider");
    }
    if (init.method === "GET") {
      return Response.json({
        models: ["gemini-first", "gemini-second"].map((name) => ({
          name: "models/" + name,
          supportedGenerationMethods: ["generateContent"],
        })),
      });
    }
    return isProbe(init)
      ? generationResponse(
          [probeItem],
          undefined,
          url.includes("gemini-first") ? "gemini-real-001" : "gemini-real-002",
        )
      : respond(url, init);
  });
}

const textInput = { text: "private meal text", aliases: [] };
const imageInput = { imageBase64: "private-photo", mimeType: "image/jpeg", mode: "food_label" };

describe("Gemini through production AI entry points", () => {
  it.each(["auto", "gemini"])(
    "routes both modes through one Gemini catalog in %s mode",
    async (provider) => {
      const ai = await loadAi({
        ...legacyKeys,
        NUTRIMIND_LLM_PROVIDER: provider,
        GEMINI_API_KEY: "test-gemini-key",
        NUTRI_AI_AUTOMODEL: "0",
      });
      const fetchMock = mockGemini([{ ...mealItem, confidence: 0.4, baseAmount: 55 }]);
      vi.stubGlobal("fetch", fetchMock);

      const text = await ai.parseMealText(textInput);
      const vision = await ai.parseMealImage(imageInput);
      expect(text).toEqual({
        status: 200,
        body: {
          items: [
            {
              name: "Elma",
              nutrition: { kcal: 50, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 },
              confidence: 0.4,
              needsReview: true,
              baseAmount: 55,
            },
          ],
        },
      });
      expect(vision).toEqual({ status: 200, body: { ...text.body, healthNote: "health note" } });
      expect(fetchMock.mock.calls.filter(([, init]) => init.method === "GET")).toHaveLength(1);
      expect(productionCalls(fetchMock)).toHaveLength(2);
      for (const [url, init] of fetchMock.mock.calls) {
        expect(new URL(url).hostname).toBe("generativelanguage.googleapis.com");
        expect(new URL(url).search).toBe("");
        expect(init.headers["x-goog-api-key"]).toBe("test-gemini-key");
      }
    },
  );

  it.each([
    ["none", "gemini-key", 503, "ai_disabled"],
    ["auto", "", 500, "ai_not_configured"],
    ["gemini", "", 500, "ai_not_configured"],
    ["openrouter", "gemini-key", 503, "ai_disabled"],
  ])(
    "returns the same configuration error for both input types in %s mode",
    async (provider, key, status, code) => {
      const { parseMealText, parseMealImage } = await loadAi({
        ...legacyKeys,
        NUTRIMIND_LLM_PROVIDER: provider,
        GEMINI_API_KEY: key,
      });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(await parseMealText(textInput)).toMatchObject({ status, body: { code } });
      expect(await parseMealImage(imageInput)).toMatchObject({ status, body: { code } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("charges a single local token across model fallback and rejects a second request without fetching", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "gemini-key",
      NUTRI_AI_RATE_PARSE: "1",
      NUTRI_AI_RATE_VISION: "1",
    });
    const fetchMock = mockGemini([mealItem], (url) =>
      url.includes("gemini-first")
        ? new Response(null, { status: 503 })
        : generationResponse([mealItem]),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect((await ai.parseMealText(textInput)).status).toBe(200);
    expect(productionCalls(fetchMock).map(([url]) => url)).toEqual([
      expect.stringContaining("gemini-first"),
      expect.stringContaining("gemini-second"),
    ]);
    const calls = fetchMock.mock.calls.length;
    expect(await ai.parseMealText(textInput)).toMatchObject({
      status: 429,
      body: { code: "ai_rate_limit", retryAfter: expect.any(Number) },
    });
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect((await ai.parseMealImage(imageInput)).status).toBe(200);
    const afterVision = fetchMock.mock.calls.length;
    expect(await ai.parseMealImage(imageInput)).toMatchObject({
      status: 429,
      body: { code: "ai_rate_limit", retryAfter: expect.any(Number) },
    });
    expect(fetchMock).toHaveBeenCalledTimes(afterVision);
    expect(ai.aiLog.snapshot().buckets).toEqual([
      { name: "parse", cap: 1, tokens: 0, fill: 0 },
      { name: "vision", cap: 1, tokens: 0, fill: 0 },
    ]);
  });

  it("exposes verified input modes, the runtime, and model waits without copying private content", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const key = "private-gemini-key";
    const ai = await loadAi({ NUTRIMIND_LLM_PROVIDER: "gemini", GEMINI_API_KEY: key });
    const memoryName = "private memory item";
    const aliases = [
      {
        name: memoryName,
        serving_g: 30,
        nutrition: { kcal: 100, protein: 1, carbs: 2, fat: 3, fiber: 4 },
        triggers: ["private memory trigger"],
      },
    ];
    const fetchMock = mockGemini([mealItem], (url) =>
      url.includes("gemini-first") && productionCalls(fetchMock).length > 2
        ? Response.json(
            { error: { message: textInput.text + imageInput.imageBase64 + memoryName + key } },
            { status: 429 },
          )
        : generationResponse([mealItem], "private health note"),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect((await ai.parseMealText({ ...textInput, aliases })).status).toBe(200);
    expect((await ai.parseMealImage({ ...imageInput, aliases, mode: "food_photo" })).status).toBe(
      200,
    );
    expect((await ai.parseMealImage({ ...imageInput, aliases })).status).toBe(200);
    const [, photoCall, labelCall] = productionCalls(fetchMock);
    expect(photoCall[1].body).toContain(memoryName);
    expect(labelCall[1].body).not.toContain(memoryName);
    const status = ai.aiLog.snapshot();
    expect(status.gemini).toMatchObject({
      catalogRefreshedAt: expect.any(Number),
      active: {
        text: { model: "models/gemini-first", modelVersion: "gemini-real-001" },
        vision: { model: "models/gemini-second", modelVersion: "gemini-real-001" },
      },
      models: [
        {
          model: "models/gemini-first",
          text: { state: "verified" },
          vision: { state: "verified" },
          waiting: { reason: "rate-limit", retryAt: expect.any(Number) },
        },
        { model: "models/gemini-second", vision: { state: "verified" } },
      ],
    });
    const recorded = JSON.stringify({ status, logs: log.mock.calls });
    for (const secret of [
      key,
      textInput.text,
      imageInput.imageBase64,
      memoryName,
      "private memory trigger",
      "private health note",
    ]) {
      expect(recorded).not.toContain(secret);
    }
  });

  it("retains the known runtime when a successful response omits it", async () => {
    const ai = await loadAi({ NUTRIMIND_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "gemini-key" });
    vi.stubGlobal(
      "fetch",
      mockGemini([mealItem], () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [mealItem] }) }] } }],
        }),
      ),
    );
    expect((await ai.parseMealText(textInput)).status).toBe(200);
    const snapshot = ai.aiLog.snapshot().gemini;
    expect(snapshot.active.text.modelVersion).toBe("gemini-real-001");
    expect(snapshot.models[0].text.modelVersion).toBe("gemini-real-001");

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Response.json({
          models: [
            {
              name: "models/gemini-first",
              version: "replacement",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      ),
    );
    expect((await ai.aiModels.refreshGeminiCatalog()).ok).toBe(true);
    expect(ai.aiLog.snapshot().gemini).toMatchObject({
      active: { text: null },
      models: [{ text: { state: "untested", modelVersion: null } }],
    });

    vi.stubEnv("GEMINI_API_KEY", "rotated-gemini-key");
    expect(ai.aiLog.snapshot().gemini).toMatchObject({ active: { text: null }, models: [] });
  });

  it("preserves provider and malformed-response client errors", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = await loadAi({ NUTRIMIND_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "gemini-key" });
    const fetchMock = mockGemini([], () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await ai.parseMealText(textInput)).toMatchObject({
      status: 502,
      body: { code: "ai_provider_error" },
    });

    ai.aiModels.resetGeminiCatalog();
    vi.stubGlobal(
      "fetch",
      mockGemini([], () => Response.json({ candidates: [] })),
    );
    expect(await ai.parseMealImage(imageInput)).toMatchObject({
      status: 502,
      body: { code: "ai_bad_response" },
    });
  });

  it("keeps the default request budget below the proxy window and skips work below the configured minimum", async () => {
    const ai = await loadAi({ NUTRIMIND_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "gemini-key" });
    expect(ai.AI_LIMITS.budgetMs).toBeLessThan(ai.AI_LIMITS.apiWindowMs);
    const configured = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "gemini-key",
      NUTRI_AI_BUDGET_MS: "1000",
      NUTRI_AI_MIN_STEP_MS: "2500",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await configured.parseMealText(textInput)).toMatchObject({
      status: 504,
      body: { code: "ai_timeout" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AI istem dili (server/ai.js `lang`)", () => {
  /** Gemini isteğinin gövdesinden prompt metnini çıkarır. */
  function promptOf(call) {
    const body = JSON.parse(call[1].body);
    return body.contents[0].parts[0].text;
  }

  it("lang=tr iken istem Türkçe ve 'Yanıtı Türkçe ver' talimatı içerir", async () => {
    const mockFetch = mockGemini();
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealText({ text: "2 yumurta", aliases: [], lang: "tr" });
    expect(res.status).toBe(200);

    const prompt = promptOf(productionCalls(mockFetch)[0]);
    expect(prompt).toContain("Sen bir beslenme uzmanısın");
    expect(prompt).toContain("Yanıtı Türkçe ver");
    expect(prompt).toContain("KULLANICININ GİRDİSİ");
    expect(prompt).toContain("2 yumurta");
  });

  it("lang=pl iken istem Lehçe üretilir", async () => {
    const mockFetch = mockGemini();
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealText({ text: "2 jajka", aliases: [], lang: "pl" });
    expect(res.status).toBe(200);

    const prompt = promptOf(productionCalls(mockFetch)[0]);
    expect(prompt).toContain("ekspertem ds. żywienia");
    expect(prompt).toContain("Odpowiedz w języku polskim");
  });

  it("lang verilmezse (ya da tanınmıyorsa) İngilizce'ye düşer — varsayılan uygulama dili", async () => {
    const mockFetch = mockGemini();
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const noLang = await parseMealText({ text: "2 eggs", aliases: [] });
    expect(noLang.status).toBe(200);
    expect(promptOf(productionCalls(mockFetch)[0])).toContain("Answer in English");

    const bogus = await parseMealText({ text: "2 eggs", aliases: [], lang: "de-DE" });
    expect(bogus.status).toBe(200);
    expect(promptOf(productionCalls(mockFetch)[1])).toContain("Answer in English");
  });

  it("besin hafızası satırları da istem diliyle yazılır (karışık dil yok)", async () => {
    const mockFetch = mockGemini();
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    await parseMealText({
      text: "1 scoop",
      aliases: [
        {
          name: "Whey",
          serving_g: 30,
          nutrition: { kcal: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0 },
          triggers: ["protein tozu"],
        },
      ],
      lang: "en",
    });

    const prompt = promptOf(productionCalls(mockFetch)[0]);
    expect(prompt).toContain("USER'S FOOD MEMORY");
    expect(prompt).toContain("g protein");
    expect(prompt).not.toContain("KULLANICININ BESİN HAFIZASI");
    expect(prompt).not.toContain("karbonhidrat");
  });

  it("görsel istemi de `lang` alır (etiket modu)", async () => {
    const mockFetch = mockGemini();
    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    const res = await parseMealImage({
      imageBase64: "x",
      mimeType: "image/jpeg",
      mode: "food_label",
      aliases: [],
      lang: "pl",
    });
    expect(res.status).toBe(200);
    expect(promptOf(productionCalls(mockFetch)[0])).toContain("Odpowiedz w języku polskim");
  });
});

describe("etiket tabanı (baseAmount) — canlıdan depoya taşındı", () => {
  /** Gemini isteğinin gövdesinden prompt metnini çıkarır (kendi kopyamız:
   *  üstteki bloktaki yardımcı o describe'un içindedir). */
  function geminiPromptOf(call) {
    return JSON.parse(call[1].body).contents[0].parts[0].text;
  }

  it("etiket istemi baseAmount alanını ve kuralını içerir (üç dilde)", async () => {
    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });

    for (const [lang, needle] of [
      ["tr", "baseAmount"],
      ["en", "baseAmount"],
      ["pl", "baseAmount"],
    ]) {
      const mockFetch = mockGemini();
      vi.stubGlobal("fetch", mockFetch);
      const res = await parseMealImage({
        imageBase64: "x",
        mimeType: "image/jpeg",
        mode: "food_label",
        aliases: [],
        lang,
      });
      expect(res.status).toBe(200);
      const prompt = geminiPromptOf(productionCalls(mockFetch)[0]);
      expect(prompt).toContain(needle);
      expect(prompt).toMatch(/100\s?g/);
      vi.unstubAllGlobals();
    }
  });

  it("yanıttaki baseAmount yalnızca POZİTİF ve sonlu geldiğinde taşınır", async () => {
    const cases = [
      { raw: 100, expected: 100 },
      { raw: 30, expected: 30 },
      { raw: 0, expected: undefined },
      { raw: -5, expected: undefined },
      { raw: "100", expected: undefined },
      { raw: undefined, expected: undefined },
    ];

    for (const c of cases) {
      const item = {
        name: "Ürün (100g)",
        kcal: 250,
        protein: 10,
        carbs: 30,
        fat: 8,
        fiber: 3,
        confidence: 0.9,
      };
      if (c.raw !== undefined) item.baseAmount = c.raw;
      const mockFetch = mockGemini([item]);
      vi.stubGlobal("fetch", mockFetch);

      const { parseMealText } = await loadAi({
        NUTRIMIND_LLM_PROVIDER: "gemini",
        GEMINI_API_KEY: "test_gemini_key",
      });
      const res = await parseMealText({ text: "ürün", aliases: [], lang: "tr" });
      expect(res.status).toBe(200);
      expect(res.body.items[0].baseAmount).toBe(c.expected);
      vi.unstubAllGlobals();
    }
  });
});

describe("baseAmount — metin/fotoğraf istemleri", () => {
  it("metin ve yemek-fotoğrafı istemleri porsiyon gramajını baseAmount'a yazma kuralını içerir (üç dilde)", async () => {
    const { parseMealText, parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
    });
    // Her dilin KENDİ porsiyon-gramaj cümlesi — dil başına ayrı doğrulanır ki
    // bir isteme yanlış dilin kuralı sızarsa test kırmızıya dönsün.
    const needleOf = { en: "portion size in GRAMS", tr: "porsiyon gramajını", pl: "wagę porcji" };
    for (const lang of ["tr", "en", "pl"]) {
      // (i) METİN istemi
      const mock = mockGemini();
      vi.stubGlobal("fetch", mock);
      await parseMealText({ text: "1 elma", aliases: [], lang });
      const textPrompt = JSON.parse(productionCalls(mock)[0][1].body).contents[0].parts[0].text;
      expect(textPrompt).toContain("baseAmount");
      expect(textPrompt).toContain(needleOf[lang]);
      expect(textPrompt).not.toContain("otherwise write 0");
      vi.unstubAllGlobals();
      vi.resetAllMocks();

      // (ii) YEMEK-FOTOĞRAFI istemi — aynı porsiyon kuralını taşımalı.
      const imgMock = mockGemini();
      vi.stubGlobal("fetch", imgMock);
      await parseMealImage({
        imageBase64: "x",
        mimeType: "image/jpeg",
        mode: "food_photo",
        aliases: [],
        lang,
      });
      const photoPrompt = JSON.parse(productionCalls(imgMock)[0][1].body).contents[0].parts[0].text;
      expect(photoPrompt).toContain("baseAmount");
      expect(photoPrompt).toContain(needleOf[lang]);
      vi.unstubAllGlobals();
      vi.resetAllMocks();
    }
  });
});
