import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "NUTRIMIND_LLM_PROVIDER",
  "OPENROUTER_API_KEY",
  "OPENCODE_API_KEY",
  "OLLAMA_CLOUD_API_KEY",
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

async function loadDiscovery(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("./aiDiscovery.js");
  return mod.default ?? mod;
}

const keys = {
  OPENROUTER_API_KEY: "or_key",
  OPENCODE_API_KEY: "oc_key",
  OLLAMA_CLOUD_API_KEY: "ol_key",
  CLAUDEFLARE_API_KEY: "cf_key",
  CLAUDEFLARE_ACCOUNT_ID: "acct-1",
};

describe("Gemini catalog scheduler", () => {
  it.each([
    { NUTRIMIND_LLM_PROVIDER: "none", GEMINI_API_KEY: "test-gemini-key" },
    { NUTRIMIND_LLM_PROVIDER: "auto", GEMINI_API_KEY: "" },
    {
      NUTRIMIND_LLM_PROVIDER: "gemini",
      GEMINI_API_KEY: "test-gemini-key",
      NUTRI_AI_AUTOMODEL: "0",
    },
  ])(
    "skips catalog and synthetic requests when background discovery is unavailable",
    async (env) => {
      const discovery = await loadDiscovery({ ...keys, ...env });
      const probeRound = vi.fn();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();
      const stop = discovery.startGeminiDiscovery(undefined, { probeRound });
      try {
        await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(probeRound).not.toHaveBeenCalled();
      } finally {
        stop();
        vi.useRealTimers();
      }
    },
  );

  it("fetches only the Gemini catalog on startup, retries an initial failure, then waits six hours", async () => {
    const discovery = await loadDiscovery({
      NUTRIMIND_LLM_PROVIDER: "auto",
      GEMINI_API_KEY: "test_gemini_key",
      ...keys,
    });
    discovery._aiModels.resetGeminiCatalog();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(() => Promise.resolve(Response.json({ models: [] })));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const stop = discovery.startGeminiDiscovery();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [url, { method }] of fetchMock.mock.calls) {
        expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models");
        expect(method).toBe("GET");
      }
      stop();
      await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });
});
