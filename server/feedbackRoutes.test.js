import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import migrateModule from "./migrate.js";

// ============================================================================
// Uygulama-içi geri bildirim uçları (POST her oturumlu kullanıcı; GET/PATCH
// yalnızca sahip). Test altyapısı authRoutes.test.js'ten kopyalandı: env
// bayrakları modül YÜKLENİRKEN okunduğu için her senaryo taze `yukle` yapar.
// feedbackRoutes, authRoutes'un İÇİNDE require ettiği modüle bağlı — aynı
// ajanla ikisini de import etmek aynı örneği paylaştırır (vi.resetModules).
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

function yeniDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(V0_SCHEMA);
  migrateModule.migrate(db, { ownerEmail: "sahip@x.co" });
  return db;
}

/** Tarayıcıdan gelen normal bir istek (CSRF kapısını geçer). */
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

const FB_ENV = {
  NUTRIMIND_AUTH_ENABLED: "1",
  NUTRIMIND_ALLOW_SIGNUP: "1",
  NUTRIMIND_OWNER_EMAIL: "sahip@x.co",
  NUTRIMIND_PUBLIC_ORIGIN: "http://localhost:5173",
};

/** Bayraklar kapalıyken taze yükleme (yalnızca feedbackRoutes). */
async function yukle(env) {
  vi.resetModules();
  for (const k of BAYRAKLAR) delete process.env[k];
  Object.assign(process.env, env);
  return await import("./feedbackRoutes.js");
}

/** Açık bayraklarla feedbackRoutes + authRoutes'u AYNI örnek olarak yükler.
 *  `A` hesap açma/silme ve sahip oturumu için; `F` test edilen uçlar. */
async function ortam() {
  vi.resetModules();
  for (const k of BAYRAKLAR) delete process.env[k];
  Object.assign(process.env, FB_ENV);
  const db = yeniDb();
  const F = await import("./feedbackRoutes.js");
  const A = await import("./authRoutes.js");
  return { F, A, db };
}

async function kayitVeCerez(A, db, email, password = "parola1234") {
  const r = await A.handleAuth({
    db, req: istek(), method: "POST", path: "/api/auth/register",
    readBody: govde({ email, password }),
  });
  return cerezden(r);
}

/** Göçten gelen sahip (u_owner / sahip@x.co) için elle oturum. */
function sahipCerezi(A, db) {
  const { sessionId } = A.createSession(db, "u_owner", istek(), Date.now());
  return `${A.COOKIE_NAME}=${sessionId}`;
}

const gecerliGovde = (ek = {}) => ({ category: "feature", message: "yeterince açıklayıcı bir geri bildirim mesajı", ...ek });

describe("bayrak KAPALIYKEN geri bildirim uçları 503 döner", () => {
  it("POST /api/feedback 503 — kill-switch önceliği", async () => {
    const F = await yukle({});
    const db = yeniDb();
    const r = await F.handleFeedback({
      db, req: istek(), method: "POST", path: "/api/feedback", readBody: govde(gecerliGovde()),
    });
    expect(r.status).toBe(503);
    db.close();
  });
});

describe("POST /api/feedback (her oturumlu kullanıcı)", () => {
  it("geçerli gövde 201 {ok:true,id} döner ve satır DB'ye yazılır", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "normal@x.co");
    const uid = db.prepare("SELECT id FROM users WHERE email = ?").get("normal@x.co").id;

    const r = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "bug", message: "  günlük kaydı eklenemiyor  ", name: "  Ayşe ", app_version: " 0.28.5" }),
    });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ ok: true, id: expect.any(String) });

    const satir = db.prepare("SELECT * FROM feedback WHERE id = ?").get(r.body.id);
    expect(satir).toBeTruthy();
    expect(satir.user_id).toBe(uid);
    expect(satir.category).toBe("bug");
    expect(satir.message).toBe("günlük kaydı eklenemiyor"); // trim'lendi
    expect(satir.user_name).toBe("Ayşe"); // trim'lendi
    expect(satir.app_version).toBe("0.28.5"); // trim'lendi
    expect(satir.read_at).toBeNull();
    db.close();
  });

  it("name boşsa null; oturumsuz istek 401", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "bosad@x.co");
    const r = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "other", message: "kısa ama anlamlı şikayet", name: "   " }),
    });
    expect(r.status).toBe(201);
    const satir = db.prepare("SELECT * FROM feedback WHERE id = ?").get(r.body.id);
    expect(satir.user_name).toBeNull();

    const oturumsuz = await F.handleFeedback({
      db, req: istek(), method: "POST", path: "/api/feedback", readBody: govde(gecerliGovde()),
    });
    expect(oturumsuz.status).toBe(401);
    db.close();
  });

  it("doğrulama: kısa mesaj 400, tanınmayan kategori 400", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "dogru@x.co");

    const kisa = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "feature", message: "kısacık" }),
    });
    expect(kisa.status).toBe(400);

    const kategorisiz = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "xyz", message: "yeterince açıklayıcı bir geri bildirim mesajı" }),
    });
    expect(kategorisiz.status).toBe(400);
    db.close();
  });

  it("hız sınırı: aynı kullanıcıdan peş peşe 3 başarılı POST, 4.'sü 429", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "hizli@x.co");
    let sonuc;
    for (let i = 0; i < 3; i++) {
      sonuc = await F.handleFeedback({
        db, req: istek(cerez), method: "POST", path: "/api/feedback",
        readBody: govde({ category: "feature", message: `ardışık geri bildirim ${i}` }),
      });
      expect(sonuc.status).toBe(201);
    }
    sonuc = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "feature", message: "dördüncü istek kovaya takılmalı" }),
    });
    expect(sonuc.status).toBe(429);
    db.close();
  });
});

describe("GET /api/feedback (yalnızca sahip — admin listesi)", () => {
  it("normal kullanıcı 403; sahip 200 + kayıt user_email/read:false ile gelir", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "gonderen@x.co");
    const at = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "bug", message: "liste bu kaydı içermeli" }),
    });
    expect(at.status).toBe(201);

    const yasak = await F.handleFeedback({ db, req: istek(cerez), method: "GET", path: "/api/feedback", readBody: govde({}) });
    expect(yasak.status).toBe(403);
    expect(yasak.body).toEqual({ error: "yetkisiz" });

    const sacerez = sahipCerezi(A, db);
    const liste = await F.handleFeedback({ db, req: istek(sacerez), method: "GET", path: "/api/feedback", readBody: govde({}) });
    expect(liste.status).toBe(200);
    expect(liste.body.ok).toBe(true);
    expect(liste.body.items.length).toBe(1);
    const item = liste.body.items[0];
    expect(item.id).toBe(at.body.id);
    expect(item.category).toBe("bug");
    expect(item.user_email).toBe("gonderen@x.co");
    expect(item.user_name).toBeNull();
    expect(item.read).toBe(false);
    expect(item.message).toBe("liste bu kaydı içermeli");
    db.close();
  });
});

describe("PATCH /api/feedback/:id (yalnızca sahip — okundu işareti)", () => {
  async function hazir() {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "kaynak@x.co");
    const at = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback",
      readBody: govde({ category: "feature", message: "okundu işareti şu kayıt üstünde" }),
    });
    return { F, A, db, id: at.body.id, cerez, sahip: sahipCerezi(A, db) };
  }

  it("sahip read:true → 200; listede read:true; read:false → geri döner", async () => {
    const { F, A, db, id, sahip } = await hazir();
    const oku = await F.handleFeedback({
      db, req: istek(sahip), method: "PATCH", path: `/api/feedback/${id}`, readBody: govde({ read: true }),
    });
    expect(oku.status).toBe(200);
    expect(oku.body).toEqual({ ok: true });

    let liste = await F.handleFeedback({ db, req: istek(sahip), method: "GET", path: "/api/feedback", readBody: govde({}) });
    expect(liste.body.items[0].read).toBe(true);

    const geri = await F.handleFeedback({
      db, req: istek(sahip), method: "PATCH", path: `/api/feedback/${id}`, readBody: govde({ read: false }),
    });
    expect(geri.status).toBe(200);
    liste = await F.handleFeedback({ db, req: istek(sahip), method: "GET", path: "/api/feedback", readBody: govde({}) });
    expect(liste.body.items[0].read).toBe(false);
    db.close();
  });

  it("bilinmeyen id 404; normal kullanıcı PATCH 403; read boolean değilse 400", async () => {
    const { F, A, db, id, cerez, sahip } = await hazir();
    const yok = await F.handleFeedback({
      db, req: istek(sahip), method: "PATCH", path: "/api/feedback/olmayan-id", readBody: govde({ read: true }),
    });
    expect(yok.status).toBe(404);

    const yetkisiz = await F.handleFeedback({
      db, req: istek(cerez), method: "PATCH", path: "/api/feedback/olmayan-id", readBody: govde({ read: true }),
    });
    expect(yetkisiz.status).toBe(403);

    const kotu = await F.handleFeedback({
      db, req: istek(sahip), method: "PATCH", path: `/api/feedback/${id}`, readBody: govde({ read: "evet" }),
    });
    expect(kotu.status).toBe(400);
    db.close();
  });
});

describe("CSRF: çapraz-site POST reddedilir", () => {
  it("sec-fetch-site cross-site ile yazma 403", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "csrf@x.co");
    const r = await F.handleFeedback({
      db, req: istek(cerez, { "sec-fetch-site": "cross-site" }), method: "POST", path: "/api/feedback",
      readBody: govde(gecerliGovde()),
    });
    expect(r.status).toBe(403);
    db.close();
  });
});

describe("hesap silme geri bildirim kayıtlarını da temizler (KVKK)", () => {
  it("feedback yazmış kullanıcı silinince tablodaki satırı gider", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "silecek@x.co", "parola1234");
    const uid = db.prepare("SELECT id FROM users WHERE email = ?").get("silecek@x.co").id;
    await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback", readBody: govde(gecerliGovde()),
    });
    expect(db.prepare("SELECT COUNT(*) AS c FROM feedback WHERE user_id = ?").get(uid).c).toBe(1);

    const sil = await A.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/account",
      readBody: govde({ confirm: "DELETE", password: "parola1234" }),
    });
    expect(sil.status).toBe(200);
    expect(sil.body.silinen.feedback).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS c FROM feedback WHERE user_id = ?").get(uid).c).toBe(0);
    db.close();
  });

  it("TUZAK: hiç feedback yazmamış kullanıcı silinebilir (lazy-create sayesinde)", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "tuzak@x.co", "parola1234");
    const uid = db.prepare("SELECT id FROM users WHERE email = ?").get("tuzak@x.co").id;

    const sil = await A.handleAuth({
      db, req: istek(cerez), method: "POST", path: "/api/auth/account",
      readBody: govde({ confirm: "DELETE", password: "parola1234" }),
    });
    expect(sil.status).toBe(200);
    expect(sil.body.silinen.feedback).toBe(0);
    expect(db.prepare("SELECT 1 FROM users WHERE id = ?").get(uid)).toBeFalsy();
    db.close();
  });
});

describe("beklenmedik iç hatalar iç detay sızdırmaz", () => {
  it("readBody patlarsa 500 + genel mesaj, iç detay yok", async () => {
    const { F, A, db } = await ortam();
    const cerez = await kayitVeCerez(A, db, "sicak@x.co");
    const fakeReadBody = async () => {
      throw new Error("BOOM /secret/path");
    };
    const r = await F.handleFeedback({
      db, req: istek(cerez), method: "POST", path: "/api/feedback", readBody: fakeReadBody,
    });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/beklenmeyen durum/);
    expect(r.body.error).not.toMatch(/BOOM|secret/);
    db.close();
  });
});
