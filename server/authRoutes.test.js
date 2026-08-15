import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import migrateModule from "./migrate.js";

// ============================================================================
// Faz E: oturum + e-posta/parola uçları. Buradaki testlerin çoğu "çalışıyor mu"
// değil, "SIZDIRIYOR MU / AYIRT EDİLEBİLİYOR MU" sorusunu soruyor:
//   - bilinmeyen e-posta ile yanlış parola AYNI yanıtı vermeli
//   - bayrak kapalıyken hiçbir uç iş yapmamalı (fazın davranış değiştirmeden
//     gönderilebilmesini sağlayan şey bu)
//   - bir kullanıcının oturumu diğerinin verisini açmamalı
// ============================================================================

const V0_SCHEMA = `
  CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, meals TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS aliases (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`;

const BAYRAKLAR = [
  "NUTRIMIND_AUTH_ENABLED",
  "NUTRIMIND_ALLOW_SIGNUP",
  "NUTRI_SECURE_COOKIE",
  "NUTRIMIND_PUBLIC_ORIGIN",
  "NUTRIMIND_OWNER_EMAIL",
];
const yedek = {};

beforeEach(() => {
  for (const k of BAYRAKLAR) yedek[k] = process.env[k];
});
afterEach(() => {
  for (const k of BAYRAKLAR) {
    if (yedek[k] === undefined) delete process.env[k];
    else process.env[k] = yedek[k];
  }
});

/** Bayraklar modül yüklenirken okunuyor → her senaryo için taze yükleme. */
async function yukle(env) {
  vi.resetModules();
  for (const k of BAYRAKLAR) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import("./authRoutes.js");
  return mod.default ?? mod;
}

function yeniDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(V0_SCHEMA);
  migrateModule.migrate(db, { ownerEmail: "sahip@x.co" });
  return db;
}

/** Tarayıcıdan gelen normal bir istek. `sec-fetch-site: same-origin` olmadan
 *  CSRF kapısı POST'ları reddeder — bu bilinçli. */
const istek = (cookie, ekstra) => ({
  headers: { "sec-fetch-site": "same-origin", "user-agent": "test", ...(cookie ? { cookie } : {}), ...(ekstra || {}) },
  socket: { remoteAddress: "127.0.0.1" },
});

const govde = (obj) => async () => obj;

/** `Set-Cookie` başlığından çerez dizesini çıkarır. */
const cerezden = (r) => {
  const sc = r.headers && r.headers["Set-Cookie"];
  if (!sc) return null;
  return sc.split(";")[0];
};

describe("bayrak KAPALIYKEN (varsayılan) hiçbir şey değişmez", () => {
  it("/me geçirgen döner — istemci giriş ekranını hiç göstermez", async () => {
    const R = await yukle({});
    const db = yeniDb();
    const r = await R.handleAuth({ db, req: istek(), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, user: null, authDisabled: true });
    db.close();
  });

  it("diğer uçlar 503 — kod prod'a gitse bile özellik inaktif kalır", async () => {
    const R = await yukle({});
    const db = yeniDb();
    for (const p of ["/api/auth/login", "/api/auth/register", "/api/auth/logout"]) {
      const r = await R.handleAuth({ db, req: istek(), method: "POST", path: p, readBody: govde({}) });
      expect(r.status).toBe(503);
    }
    db.close();
  });
});

describe("kayıt", () => {
  it("ALLOW_SIGNUP kapalıyken reddedilir (varsayılan)", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1" });
    const db = yeniDb();
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "yeni@x.co", password: "parola1234" }),
    });
    expect(r.status).toBe(403);
    db.close();
  });

  it("açıkken hesap oluşur, çerez döner ve oturum hemen geçerlidir", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const kayit = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "  Yeni@X.CO ", password: "parola1234", name: "Yeni" }),
    });
    expect(kayit.status).toBe(201);
    expect(kayit.body.user.email).toBe("yeni@x.co"); // normalize edildi
    const cerez = cerezden(kayit);
    expect(cerez).toBeTruthy();

    const me = await R.handleAuth({ db, req: istek(cerez), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("yeni@x.co");
    db.close();
  });

  it("çerez HttpOnly + SameSite=Lax taşır", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    const sc = r.headers["Set-Cookie"];
    expect(sc).toContain("HttpOnly");
    expect(sc).toContain("SameSite=Lax"); // Strict DEĞİL — Google dönüşü için
    expect(sc).toContain("Path=/");
    db.close();
  });

  it("aynı e-posta ikinci kez kaydolamaz", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const g = { email: "a@x.co", password: "parola1234" };
    await R.handleAuth({ db, req: istek(), method: "POST", path: "/api/auth/register", readBody: govde(g) });
    const r = await R.handleAuth({ db, req: istek(), method: "POST", path: "/api/auth/register", readBody: govde(g) });
    expect(r.status).toBe(409);
    db.close();
  });

  it("zayıf parola / geçersiz e-posta 400 döner", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const kisa = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "kisa" }),
    });
    expect(kisa.status).toBe(400);
    const bozuk = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "abc", password: "parola1234" }),
    });
    expect(bozuk.status).toBe(400);
    db.close();
  });
});

describe("kayıt — izinli e-postalar kapısı", () => {
  async function hazir() {
    const R = await yukle({
      NUTRIMIND_AUTH_ENABLED: "1",
      NUTRIMIND_ALLOW_SIGNUP: "1",
      NUTRIMIND_OWNER_EMAIL: "sahip@x.co",
    });
    const db = yeniDb();
    // Tabloyu production'da handleAuth lazy kurar; test doğrudan dolduruyor.
    db.exec("CREATE TABLE IF NOT EXISTS signup_allowlist (email TEXT PRIMARY KEY)");
    return { R, db };
  }

  it("liste DOLUYSA yalnızca listedeki e-posta kayıt olabilir", async () => {
    const { R, db } = await hazir();
    db.prepare("INSERT INTO signup_allowlist (email) VALUES (?)").run("davetli@x.co");

    const listede = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "davetli@x.co", password: "parola1234" }),
    });
    expect(listede.status).toBe(201);

    const listedeDegil = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "yabanci@x.co", password: "parola1234" }),
    });
    expect(listedeDegil.status).toBe(403);
    expect(listedeDegil.body.error).toContain("izinli değil");
    db.close();
  });

  it("liste BOŞSA eski davranış: herkes kayıt olabilir", async () => {
    const { R, db } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "davetli@x.co", password: "parola1234" }),
    });
    expect(r.status).toBe(201);
    db.close();
  });

  it("eşleşme NORMALİZE edilmiş e-postayla yapılır (büyük/küçük harf, boşluk)", async () => {
    const { R, db } = await hazir();
    db.prepare("INSERT INTO signup_allowlist (email) VALUES (?)").run("davetli@x.co");
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "  Davetli@X.CO ", password: "parola1234" }),
    });
    expect(r.status).toBe(201);
    db.close();
  });

  it("kayıt bayrağı kapalıysa listedeki e-posta bile reddedilir (kill-switch önceliği)", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_OWNER_EMAIL: "sahip@x.co" });
    const db = yeniDb();
    db.exec("CREATE TABLE IF NOT EXISTS signup_allowlist (email TEXT PRIMARY KEY)");
    db.prepare("INSERT INTO signup_allowlist (email) VALUES (?)").run("davetli@x.co");
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "davetli@x.co", password: "parola1234" }),
    });
    expect(r.status).toBe(403);
    db.close();
  });
});

describe("giriş", () => {
  async function hazir() {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    return { R, db };
  }

  it("doğru parola girer ve YENİ bir oturum kimliği verir (oturum sabitleme)", async () => {
    const { R, db } = await hazir();
    const ilk = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    const ikinci = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    expect(ilk.status).toBe(200);
    expect(cerezden(ilk)).not.toBe(cerezden(ikinci));
    db.close();
  });

  it("YANLIŞ PAROLA ile BİLİNMEYEN E-POSTA ayırt edilemez", async () => {
    const { R, db } = await hazir();
    const yanlisParola = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "yanlisparola" }),
    });
    const yokEposta = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "yok@x.co", password: "parola1234" }),
    });
    expect(yanlisParola.status).toBe(401);
    expect(yokEposta.status).toBe(401);
    expect(yanlisParola.body).toEqual(yokEposta.body); // gövdeler BİREBİR aynı
    expect(yanlisParola.headers).toBeUndefined(); // çerez sızmıyor
    db.close();
  });

  it("parolası olmayan hesaba (göçten gelen sahip) giriş yapılamaz", async () => {
    const { R, db } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "sahip@x.co", password: "herhangibirsey" }),
    });
    expect(r.status).toBe(401);
    db.close();
  });
});

describe("oturum yaşam döngüsü", () => {
  it("çıkış oturumu SUNUCUDA siler ve çerezi temizler", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const kayit = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    const cerez = cerezden(kayit);
    expect(db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c).toBe(1);

    const cikis = await R.handleAuth({ db, req: istek(cerez), method: "POST", path: "/api/auth/logout", readBody: govde({}) });
    expect(cikis.status).toBe(200);
    expect(cikis.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c).toBe(0);

    // Çalınmış çerez artık işe yaramaz
    const me = await R.handleAuth({ db, req: istek(cerez), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(me.status).toBe(401);
    db.close();
  });

  it("süresi geçmiş oturum reddedilir VE satırı silinir", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const t0 = Date.parse("2026-01-01T00:00:00Z");
    const kayit = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "parola1234" }), now: t0,
    });
    const cerez = cerezden(kayit);
    const cokSonra = t0 + 400 * 86400000;

    const me = await R.handleAuth({ db, req: istek(cerez), method: "GET", path: "/api/auth/me", readBody: govde({}), now: cokSonra });
    expect(me.status).toBe(401);
    expect(db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c).toBe(0); // ölü satır birikmiyor
    db.close();
  });

  it("bir kullanıcının çerezi diğerinin hesabını AÇMAZ", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const a = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    const b = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "b@x.co", password: "parola1234" }),
    });
    const meA = await R.handleAuth({ db, req: istek(cerezden(a)), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    const meB = await R.handleAuth({ db, req: istek(cerezden(b)), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(meA.body.user.email).toBe("a@x.co");
    expect(meB.body.user.email).toBe("b@x.co");
    expect(meA.body.user.id).not.toBe(meB.body.user.id);
    db.close();
  });

  it("uydurma çerez reddedilir", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1" });
    const db = yeniDb();
    const r = await R.handleAuth({
      db, req: istek(`${R.COOKIE_NAME}=uydurma`), method: "GET", path: "/api/auth/me", readBody: govde({}),
    });
    expect(r.status).toBe(401);
    db.close();
  });
});

// ============================================================================
// Parola değiştirme: buradaki testlerin çoğu "değişiyor mu" değil, "BAŞKASI
// değiştirebiliyor mu / çalınmış oturum kesiliyor mu" sorusunu soruyor.
// ============================================================================
describe("parola değiştirme", () => {
  async function hazir() {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const kayit = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "a@x.co", password: "eskiParola123" }),
    });
    return { R, db, cerez: cerezden(kayit) };
  }

  it("oturumsuz istek reddedilir", async () => {
    const { R, db } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/password",
      readBody: govde({ currentPassword: "eskiParola123", newPassword: "yeniParola123" }),
    });
    expect(r.status).toBe(401);
    db.close();
  });

  it("mevcut parola yanlışsa reddedilir", async () => {
    const { R, db, cerez } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/password",
      readBody: govde({ currentPassword: "yanlisParola", newPassword: "yeniParola123" }),
    });
    expect(r.status).toBe(403);
    // Eski parola HÂLÂ geçerli olmalı — başarısız deneme hiçbir şey değiştirmedi.
    const giris = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "eskiParola123" }),
    });
    expect(giris.status).toBe(200);
    db.close();
  });

  it("zayıf yeni parola reddedilir", async () => {
    const { R, db, cerez } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/password",
      readBody: govde({ currentPassword: "eskiParola123", newPassword: "kisa" }),
    });
    expect(r.status).toBe(400);
    db.close();
  });

  it("başarılı değişimden sonra ESKİ parola çalışmaz, yenisi çalışır", async () => {
    const { R, db, cerez } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/password",
      readBody: govde({ currentPassword: "eskiParola123", newPassword: "yeniParola123" }),
    });
    expect(r.status).toBe(200);

    const eski = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "eskiParola123" }),
    });
    expect(eski.status).toBe(401);

    const yeni = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "yeniParola123" }),
    });
    expect(yeni.status).toBe(200);
    db.close();
  });

  it("DİĞER cihazların oturumu düşer, kendi oturumun KALIR", async () => {
    const { R, db, cerez } = await hazir();
    // İkinci bir cihazdan giriş (ör. çalınmış oturum)
    const digerCihaz = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "a@x.co", password: "eskiParola123" }),
    });
    const digerCerez = cerezden(digerCihaz);
    expect(db.prepare("SELECT COUNT(*) AS c FROM sessions").get().c).toBe(2);

    await R.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/password",
      readBody: govde({ currentPassword: "eskiParola123", newPassword: "yeniParola123" }),
    });

    // Kendi oturumum ayakta
    const ben = await R.handleAuth({ db, req: istek(cerez), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(ben.status).toBe(200);
    // Diğer cihaz kesildi
    const oteki = await R.handleAuth({ db, req: istek(digerCerez), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(oteki.status).toBe(401);
    db.close();
  });

  it("Google ile açılmış (parolasız) hesap mevcut parola İSTEMEDEN parola belirleyebilir", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1" });
    const db = yeniDb();
    // Göçten gelen sahip: password_hash NULL. Ona elle bir oturum açalım.
    const { sessionId } = R.createSession(db, "u_owner", istek(), Date.now());
    const cerez = `${R.COOKIE_NAME}=${sessionId}`;

    const r = await R.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/password",
      readBody: govde({ newPassword: "ilkParolam123" }),
    });
    expect(r.status).toBe(200);

    const giris = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/login",
      readBody: govde({ email: "sahip@x.co", password: "ilkParolam123" }),
    });
    expect(giris.status).toBe(200);
    db.close();
  });
});

describe("CSRF ve hız sınırı", () => {
  it("çapraz-site POST reddedilir", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const r = await R.handleAuth({
      db,
      req: { headers: { "sec-fetch-site": "cross-site" }, socket: { remoteAddress: "1.2.3.4" } },
      method: "POST", path: "/api/auth/login", readBody: govde({ email: "a@x.co", password: "parola1234" }),
    });
    expect(r.status).toBe(403);
    db.close();
  });

  it("aynı e-postaya art arda denemeler 429 + Retry-After ile durur", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    let sonuncu;
    for (let i = 0; i < 12; i++) {
      sonuncu = await R.handleAuth({
        db, req: istek(), method: "POST", path: "/api/auth/login",
        readBody: govde({ email: "kurban@x.co", password: `deneme${i}` }), now: 1_700_000_000_000,
      });
    }
    expect(sonuncu.status).toBe(429);
    expect(Number(sonuncu.headers["Retry-After"])).toBeGreaterThan(0);
    db.close();
  });

  it("nginx arkasındaki gerçek IP X-Forwarded-For'un SON sıçramasından alınır", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1" });
    const ip = R.clientIp({
      headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7" },
      socket: { remoteAddress: "127.0.0.1" },
    });
    // Öndeki değerler istemci tarafından uydurulabilir; güvenilir olan sonuncusu.
    expect(ip).toBe("203.0.113.7");
  });

  it("X-Forwarded-For yoksa X-Real-IP'ye düşer (YunoHost vhost'unun varsayılanı)", async () => {
    // Bu yedek olmadan HERKES 127.0.0.1 görünür ve IP başına sınır tek bir
    // küresel kovaya çöker — bir saldırgan tüm kullanıcıları kilitleyebilirdi.
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1" });
    expect(
      R.clientIp({ headers: { "x-real-ip": "203.0.113.9" }, socket: { remoteAddress: "127.0.0.1" } }),
    ).toBe("203.0.113.9");
  });

  it("hiçbir başlık yoksa soket adresine düşer, çökmez", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1" });
    expect(R.clientIp({ headers: {}, socket: { remoteAddress: "10.0.0.1" } })).toBe("10.0.0.1");
    expect(R.clientIp({})).toBe("bilinmiyor");
  });
});

// ============================================================================
// "İzinli E-postalar" yönetici uçları: listeyi yalnızca sahip
// (NUTRIMIND_OWNER_EMAIL ile eşleşen hesap) görebilir ve düzenleyebilir.
// Göçten gelen sahip `u_owner` / `sahip@x.co` (bkz. yeniDb).
// ============================================================================
describe("izinli e-postalar (yönetici uçları)", () => {
  async function hazir() {
    const R = await yukle({
      NUTRIMIND_AUTH_ENABLED: "1",
      NUTRIMIND_ALLOW_SIGNUP: "1",
      NUTRIMIND_OWNER_EMAIL: "sahip@x.co",
    });
    const db = yeniDb();
    // Sahibin hesabı parolasız (göçten) — oturumu elle açıyoruz.
    const { sessionId } = R.createSession(db, "u_owner", istek(), Date.now());
    return { R, db, sahipCerez: `${R.COOKIE_NAME}=${sessionId}` };
  }

  it("sahip listeyi görür, ekler (normalize edilir), siler", async () => {
    const { R, db, sahipCerez } = await hazir();
    const bos = await R.handleAuth({
      db, req: istek(sahipCerez), method: "GET", path: "/api/auth/admin/allowlist", readBody: govde({}),
    });
    expect(bos.status).toBe(200);
    expect(bos.body.emails).toEqual([]);

    const ekle = await R.handleAuth({
      db, req: istek(sahipCerez), method: "POST", path: "/api/auth/admin/allowlist",
      readBody: govde({ email: "  Davetli@X.CO " }),
    });
    expect(ekle.status).toBe(201);
    expect(ekle.body.email).toBe("davetli@x.co");

    const liste = await R.handleAuth({
      db, req: istek(sahipCerez), method: "GET", path: "/api/auth/admin/allowlist", readBody: govde({}),
    });
    expect(liste.body.emails).toEqual(["davetli@x.co"]);

    const sil = await R.handleAuth({
      db, req: istek(sahipCerez), method: "DELETE", path: "/api/auth/admin/allowlist",
      readBody: govde({ email: "davetli@x.co" }),
    });
    expect(sil.status).toBe(200);

    const son = await R.handleAuth({
      db, req: istek(sahipCerez), method: "GET", path: "/api/auth/admin/allowlist", readBody: govde({}),
    });
    expect(son.body.emails).toEqual([]);
    db.close();
  });

  it("aynı e-posta ikinci kez eklenemez (409)", async () => {
    const { R, db, sahipCerez } = await hazir();
    const g = govde({ email: "davetli@x.co" });
    const ilk = await R.handleAuth({ db, req: istek(sahipCerez), method: "POST", path: "/api/auth/admin/allowlist", readBody: g });
    expect(ilk.status).toBe(201);
    const ikinci = await R.handleAuth({ db, req: istek(sahipCerez), method: "POST", path: "/api/auth/admin/allowlist", readBody: g });
    expect(ikinci.status).toBe(409);
    db.close();
  });

  it("geçersiz e-posta eklenemez (400)", async () => {
    const { R, db, sahipCerez } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(sahipCerez), method: "POST", path: "/api/auth/admin/allowlist",
      readBody: govde({ email: "abc" }),
    });
    expect(r.status).toBe(400);
    db.close();
  });

  it("listedeki olmayanı silmek 404 döner", async () => {
    const { R, db, sahipCerez } = await hazir();
    const r = await R.handleAuth({
      db, req: istek(sahipCerez), method: "DELETE", path: "/api/auth/admin/allowlist",
      readBody: govde({ email: "yok@x.co" }),
    });
    expect(r.status).toBe(404);
    db.close();
  });

  it("SAHİP OLMAYAN (oturumsuz ya da başka kullanıcı) her istekte 403 alır", async () => {
    const { R, db } = await hazir();

    const oturumsuz = await R.handleAuth({
      db, req: istek(), method: "GET", path: "/api/auth/admin/allowlist", readBody: govde({}),
    });
    expect(oturumsuz.status).toBe(403);

    // Başka bir kullanıcı (liste boşken kayıt açık)
    const kayit = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "baska@x.co", password: "parola1234" }),
    });
    const baskaCerez = cerezden(kayit);

    const oku = await R.handleAuth({
      db, req: istek(baskaCerez), method: "GET", path: "/api/auth/admin/allowlist", readBody: govde({}),
    });
    expect(oku.status).toBe(403);

    const yaz = await R.handleAuth({
      db, req: istek(baskaCerez), method: "POST", path: "/api/auth/admin/allowlist",
      readBody: govde({ email: "x@x.co" }),
    });
    expect(yaz.status).toBe(403);
    db.close();
  });

  it("me ucu isAdmin'i yalnızca sahibe verir", async () => {
    const { R, db, sahipCerez } = await hazir();
    const sahip = await R.handleAuth({ db, req: istek(sahipCerez), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(sahip.status).toBe(200);
    expect(sahip.body.isAdmin).toBe(true);

    const kayit = await R.handleAuth({
      db, req: istek(), method: "POST", path: "/api/auth/register",
      readBody: govde({ email: "baska@x.co", password: "parola1234" }),
    });
    const diger = await R.handleAuth({
      db, req: istek(cerezden(kayit)), method: "GET", path: "/api/auth/me", readBody: govde({}),
    });
    expect(diger.status).toBe(200);
    expect(diger.body.isAdmin).toBe(false);
    db.close();
  });

  it("NUTRIMIND_OWNER_EMAIL BOŞSA hiçbir oturum yönetici değildir", async () => {
    const R = await yukle({ NUTRIMIND_AUTH_ENABLED: "1", NUTRIMIND_ALLOW_SIGNUP: "1" });
    const db = yeniDb();
    const { sessionId } = R.createSession(db, "u_owner", istek(), Date.now());
    const cerez = `${R.COOKIE_NAME}=${sessionId}`;
    const r = await R.handleAuth({ db, req: istek(cerez), method: "GET", path: "/api/auth/admin/allowlist", readBody: govde({}) });
    expect(r.status).toBe(403);
    const me = await R.handleAuth({ db, req: istek(cerez), method: "GET", path: "/api/auth/me", readBody: govde({}) });
    expect(me.body.isAdmin).toBe(false);
    db.close();
  });
});
