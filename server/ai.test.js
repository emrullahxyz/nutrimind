import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NUTRIMIND_LLM_PROVIDER",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_TIER2_MODEL",
  "GEMINI_TIER3_MODEL",
  "NVIDIA_NIM_API_KEY",
  "NVIDIA_NIM_MODEL",
  "NVIDIA_NIM_VISION_MODEL",
  "OPENCODE_API_KEY",
  "OPENCODE_MODEL",
  "NUTRIMIND_CONFIDENCE_THRESHOLD",
  "NUTRI_AI_RATE_PARSE",
  "NUTRI_AI_RATE_GEMINI_TIER2",
  "NUTRI_AI_RATE_GEMINI_TIER3",
  "NUTRI_AI_RATE_VISION",
  "NUTRI_AI_RATE_NIM",
  "NUTRI_AI_RATE_NIM_VISION",
  "NUTRI_AI_RATE_OPENCODE",
  "NUTRI_AI_TIMEOUT_MS",
  "NUTRI_AI_NIM_TIMEOUT_MS",
];

const envBackup = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

async function loadAi(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  const mod = await import("./ai.js");
  return mod.default ?? mod;
}

function makeGeminiOkResponse(items = [{ name: "Elma", kcal: 50, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, confidence: 0.95 }]) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ items }) }],
            },
          },
        ],
      }),
  };
}

function makeNimOkResponse(items = [{ name: "Elma", kcal: 50, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, confidence: 0.95 }]) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify({ items }) },
          },
        ],
      }),
  };
}

function makeErrorResponse(status = 429) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ error: `HTTP ${status}` }),
  };
}

describe("AI fallback zinciri (server/ai.js)", () => {
  it("NUTRIMIND_LLM_PROVIDER=auto iken, mock fetch ilk çağrıda (Gemini tier1) 429 dönerse, ikinci çağrının (tier2, farklı model adıyla) yapıldığını doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeGeminiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      GEMINI_MODEL: "gemini-flash-latest",
      GEMINI_TIER2_MODEL: "gemini-3.5-flash",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain("gemini-flash-latest");
    expect(mockFetch.mock.calls[1][0]).toContain("gemini-3.5-flash");
  });

  it("Tier1/tier2/tier3 hepsi 429/502 dönerse, dördüncü çağrının NIM'e gittiğini doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");

    const nimBody = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(nimBody.model).toBe("meta/llama-3.1-8b-instruct");
  });

  it("Tüm Gemini + NIM adımları başarısız olursa, metin zincirinde beşinci (son) çağrının OpenCode Zen'e gittiğini doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(mockFetch.mock.calls[4][0]).toBe("https://opencode.ai/zen/v1/chat/completions");
  });

  it("GEMINI_API_KEY yokken (env'den sil) ve auto modda, zincirin doğrudan NIM'den başladığını doğrula (Gemini'ye hiç istek atılmadığını)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
  });

  it("Hiçbir API key yokken (auto modda), parseMealText'in ağa hiç çıkmadan {status:500} döndüğünü doğrula", async () => {
    const mockFetch = vi.fn();

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "",
      NVIDIA_NIM_API_KEY: "",
      OPENCODE_API_KEY: "",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("İlk denemede başarılı olursa (200), zincirin durduğunu ve ikinci bir çağrı yapılmadığını doğrula", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeGeminiOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("LLM_PROVIDER=gemini (tekil zorlama modu) iken hâlâ sadece tier1 modeliyle tek istek atıldığını, zincire hiç girmediğini doğrula", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(makeErrorResponse(429));

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealText } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
      OPENCODE_API_KEY: "test_opencode_key",
    });

    const res = await parseMealText({ text: "1 elma", aliases: [] });

    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("gemini-flash-latest");
  });

  it("parseMealImage için: tüm Gemini kademeleri başarısız olursa NIM Vision'a düştüğünü, ve bu çağrıda imageBase64'ün OpenAI image_url (data URI) şeklinde gönderildiğini doğrula", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeErrorResponse(502))
      .mockResolvedValueOnce(makeNimOkResponse());

    vi.stubGlobal("fetch", mockFetch);

    const { parseMealImage } = await loadAi({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      NVIDIA_NIM_API_KEY: "test_nim_key",
    });

    const res = await parseMealImage({
      imageBase64: "test_base64_data",
      mimeType: "image/jpeg",
      mode: "food_photo",
      aliases: [],
    });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[3][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");

    const nimBody = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(nimBody.model).toBe("meta/llama-3.2-90b-vision-instruct");
    const userMessage = nimBody.messages[0];
    expect(Array.isArray(userMessage.content)).toBe(true);

    const imagePart = userMessage.content.find((part) => part.type === "image_url");
    expect(imagePart).toBeDefined();
    expect(imagePart.image_url.url).toBe("data:image/jpeg;base64,test_base64_data");
  });
});
