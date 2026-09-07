// Router entegrasyon testi: server/index.js'i AUTH=1 + :memory: DB ile yükler,
// gerçek HTTP üzerinden uçları çağırır. Kapsanan boşluk (madde 23):
// oturum kapısı, IDOR sahiplik koruması, bozuk gövde 400.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";

const BAYRAKLAR = [
  "NUTRIMIND_AUTH_ENABLED",
  "NUTRIMIND_ALLOW_SIGNUP",
  "NUTRI_SECURE_COOKIE",
  "NUTRIMIND_PUBLIC_ORIGIN",
  "NUTRIMIND_OWNER_EMAIL",
];
const yedek = {};

let server;
let base;

/** env'i yedekle + index.js'i taze yükle (bayraklar yükleme anında okunur). */
async function yukle() {
  const mod = await import("./index.js");
  server = mod.server;
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}`;
}

function request(method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = {};
    if (data) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      `${base}${path}`,
      { method, headers },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* boş/bölük gövde */
          }
          const setCookie = res.headers["set-cookie"];
          resolve({ status: res.statusCode, json, cookie: setCookie ? setCookie[0].split(";")[0] : null });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  for (const k of BAYRAKLAR) yedek[k] = process.env[k];
  process.env.NUTRI_DB = ":memory:";
  process.env.NUTRIMIND_AUTH_ENABLED = "1";
  process.env.NUTRIMIND_ALLOW_SIGNUP = "1";
  process.env.NUTRIMIND_OWNER_EMAIL = "owner@test.co";
  process.env.NUTRIMIND_PUBLIC_ORIGIN = "http://localhost:5173";
  vi.resetModules();
  await yukle();
});

afterEach(async () => {
  for (const k of BAYRAKLAR) {
    if (yedek[k] === undefined) delete process.env[k];
    else process.env[k] = yedek[k];
  }
});

describe("router entegrasyon (madde 23 boşluğu)", () => {
  it("oturumsuz veri isteği 401 döner", async () => {
    const r = await request("GET", "/api/data");
    expect(r.status).toBe(401);
  });

  it("register → day/alias yaz → başka kullanıcı dokunamaz (IDOR)", async () => {
    const k1 = await request("POST", "/api/auth/register", { body: { email: "a@test.co", password: "parola1234" } });
    expect(k1.status).toBe(201);
    const k2 = await request("POST", "/api/auth/register", { body: { email: "b@test.co", password: "parola1234" } });
    expect(k2.status).toBe(201);

    // A gün + alias yazar.
    const day = await request("POST", "/api/day", { body: { date: "2026-09-07", meals: [{ name: "Yumurta" }] }, cookie: k1.cookie });
    expect(day.status).toBe(200);
    const alias = await request("POST", "/api/alias", {
      body: { name: "A besini", triggers: ["yumurta"], nutrition: { kcal: 70 } },
      cookie: k1.cookie,
    });
    expect(alias.status).toBe(200);
    const aliasId = alias.json.id;

    // B, A'nın gününü silmeye çalışır — satır korunur.
    const delDay = await request("DELETE", "/api/day/2026-09-07", { cookie: k2.cookie });
    expect(delDay.status).toBe(200);
    const aData = await request("GET", "/api/data", { cookie: k1.cookie });
    expect(aData.json.days["2026-09-07"]).toBeTruthy();

    // B, A'nın alias'ını silmeye çalışır — satır korunur.
    const delAlias = await request("DELETE", `/api/alias/${aliasId}`, { cookie: k2.cookie });
    expect(delAlias.status).toBe(200);
    const aAliases = await request("GET", "/api/data", { cookie: k1.cookie });
    expect(aAliases.json.aliases.some((a) => a.id === aliasId)).toBe(true);
  });

  it("bozuk JSON gövde 400 döner", async () => {
    const k = await request("POST", "/api/auth/register", { body: { email: "c@test.co", password: "parola1234" } });
    const r = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/api/day`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: k.cookie },
      }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(raw) }));
      });
      req.on("error", reject);
      req.write("{bozuk json");
      req.end();
    });
    expect(r.status).toBe(400);
  });
});
