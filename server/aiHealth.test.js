// server/aiHealth.js birim testleri: eşikler, devrenin açılması, yarım açık
// deneme, karar katmanı ve snapshot şekli.
//
// NEDEN VAR: 2026-09-21 canlı olayında ölü bir yedek kademe (NIM vision) her
// istekte 40 sn bekletiyordu. Eşikler testli değilse bir sonraki turda
// "devre hiç açılmadı" ya da "her şeyi kapattı" hatası sessizce ürüne çıkar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NUTRI_AI_BREAKER_MS",
  "NUTRI_AI_BREAKER_TIMEOUTS",
  "NUTRI_AI_BREAKER_UNREACHABLE",
  "NUTRI_AI_BREAKER_PROVIDER_ERRORS",
];

const envBackup = {};

beforeEach(() => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k];
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

async function loadHealth(env = {}) {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("./aiHealth.js");
  return mod.default ?? mod;
}

describe("aiHealth devre kesici", () => {
  it("3 ardışık zaman aşımında devre açılır ve tek satır '[ai]' gerekçesi yazılır", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const h = await loadHealth({ NUTRI_AI_BREAKER_MS: "60000" });
    const now = 1_000_000;

    h.noteFailure("nim-vision", "timeout", null, now);
    h.noteFailure("nim-vision", "timeout", null, now);
    expect(h.isOpen("nim-vision", now).open).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();

    h.noteFailure("nim-vision", "timeout", null, now);
    const open = h.isOpen("nim-vision", now);
    expect(open.open).toBe(true);
    expect(open.retryInMs).toBe(60000);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(logSpy.mock.calls[0][0].slice("[ai] ".length));
    expect(line).toMatchObject({
      kind: "breaker",
      provider: "nim-vision",
      state: "open",
      reason: "timeout",
      failures: 3,
    });
  });

  it("sağlayıcının KENDİ 5xx'i daha toleranslı (5 hata), model hatası ise tek hatada açar", async () => {
    const h = await loadHealth({});
    const now = 2_000_000;

    for (let i = 0; i < 4; i++) h.noteFailure("gemini-tier2", "provider", 503, now);
    expect(h.isOpen("gemini-tier2", now).open).toBe(false);
    h.noteFailure("gemini-tier2", "provider", 503, now);
    expect(h.isOpen("gemini-tier2", now).open).toBe(true);

    // 410 Gone / 404 "not found for account": yapılandırma hatası, beklemeye gerek yok.
    h.noteFailure("nim", "model", 410, now);
    expect(h.isOpen("nim", now).open).toBe(true);
  });

  it("başarı sayacı sıfırlar; tanınmayan tür 'provider' sayılır (savunmacı)", async () => {
    const h = await loadHealth({});
    const now = 3_000_000;

    h.noteFailure("nim", "timeout", null, now);
    h.noteFailure("nim", "timeout", null, now);
    h.noteSuccess("nim");
    h.noteFailure("nim", "timeout", null, now);
    h.noteFailure("nim", "timeout", null, now);
    expect(h.isOpen("nim", now).open).toBe(false);

    expect(() => h.noteFailure("nim", "bilinmeyen-tur", null, now)).not.toThrow();
    expect(h.snapshot(now).find((e) => e.provider === "nim").reason).toBe("provider");
  });

  it("süresi dolan devre yarım açıktır: tek denemeye izin verir, başarısızsa yeniden açılır", async () => {
    const h = await loadHealth({ NUTRI_AI_BREAKER_MS: "1000" });
    const t0 = 5_000_000;

    h.noteFailure("opencode", "model", 404, t0);
    expect(h.isOpen("opencode", t0 + 500).open).toBe(true);
    // Süre doldu → tek denemeye izin (yarım açık).
    expect(h.isOpen("opencode", t0 + 1001).open).toBe(false);

    h.noteFailure("opencode", "model", 404, t0 + 1100);
    expect(h.isOpen("opencode", t0 + 1200).open).toBe(true);

    // Bu kez deneme başarılı olsaydı devre kapanırdı.
    h.noteSuccess("opencode");
    expect(h.isOpen("opencode", t0 + 1200).open).toBe(false);
  });

  it("snapshot durumları okunur: healthy / degraded / open + atlanan sayaç", async () => {
    const h = await loadHealth({});
    const now = 9_000_000;

    h.noteFailure("gemini-tier1", "provider", 503, now);
    h.markSkipped("gemini-tier1");
    h.markSkipped("gemini-tier1");
    h.noteSuccess("nim");
    h.noteFailure("opencode", "model", 410, now);

    const by = Object.fromEntries(h.snapshot(now).map((e) => [e.provider, e]));
    expect(by["gemini-tier1"]).toMatchObject({
      state: "degraded",
      failures: 1,
      skipped: 2,
      upstream: 503,
    });
    expect(by["opencode"]).toMatchObject({ state: "open", retryInMs: 600000 });
    // Başarı sayacı sıfırlar → sağlıklı adım "healthy" görünür.
    expect(by["nim"]).toMatchObject({ state: "healthy", failures: 0 });
  });

  it("asla throw etmez: sağlık katmanı isteği etkilememeli", async () => {
    const h = await loadHealth({});
    expect(() => h.noteFailure(null, "timeout")).not.toThrow();
    expect(() => h.noteFailure("p", "timeout", "kod-değil")).not.toThrow();
    expect(() => h.markSkipped(null)).not.toThrow();
    expect(() => h.noteSuccess(null)).not.toThrow();
    expect(h.isOpen(null).open).toBe(false);
    expect(Array.isArray(h.snapshot())).toBe(true);
  });
});
