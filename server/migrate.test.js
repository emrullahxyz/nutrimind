import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import migrateModule from "./migrate.js";

const { migrate, migrateDown, OWNER_ID, currentVersion } = migrateModule;

// ============================================================================
// Bu göç, tüm planın KULLANICININ GERÇEK VERİSİNİ yeniden yazan tek adımı ve
// `DROP TABLE days` içeriyor. SQLite bir birincil anahtarı ALTER ile
// değiştiremediği için `days` ve `config` yeniden yaratılıp kopyalanmak zorunda.
//
// Buradaki testlerin varlık sebebi tek bir soru: "tek bir satır bile kaybolmuyor
// ve veri birebir aynı kalıyor mu?" Şema doğruluğu ikincil.
// ============================================================================

/** `server/index.js:29-31`'deki v0 şemasının birebir aynısı. */
const V0_SCHEMA = `
  CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, meals TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS aliases (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`;

const OGUN = JSON.stringify([{ name: "Skyr", nutrition: { kcal: 96, protein: 10 } }]);
const BESIN = JSON.stringify({ name: "Skyr", triggers: ["skyr"], serving_g: 100 });

let db;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(V0_SCHEMA);
  db.prepare("INSERT INTO days (date, meals) VALUES (?, ?)").run("2026-08-05", OGUN);
  db.prepare("INSERT INTO days (date, meals) VALUES (?, ?)").run("2026-08-06", "[]");
  db.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("goals", '{"kcal":2600}');
  db.prepare("INSERT INTO config (key, value) VALUES (?, ?)").run("weight", '{"entries":{}}');
  db.prepare("INSERT INTO aliases (id, data) VALUES (?, ?)").run("a_1", BESIN);
});

afterEach(() => db.close());

describe("migrate v0 → v2", () => {
  it("tek bir satır bile kaybolmaz", () => {
    const sonuc = migrate(db, { ownerEmail: "a@b.co", now: "2026-08-06T00:00:00Z" });
    expect(sonuc.migrated).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS c FROM days").get().c).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS c FROM config").get().c).toBe(2);
    expect(db.prepare("SELECT COUNT(*) AS c FROM aliases").get().c).toBe(1);
  });

  it("öğün verisi BİREBİR korunur (JSON'a dokunulmaz)", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    const satir = db.prepare("SELECT meals FROM days WHERE date = ?").get("2026-08-05");
    expect(satir.meals).toBe(OGUN);
    const besin = db.prepare("SELECT data FROM aliases WHERE id = ?").get("a_1");
    expect(besin.data).toBe(BESIN);
  });

  it("mevcut tüm veri sahibe atanır, sahipsiz satır kalmaz", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    for (const t of ["days", "config", "aliases"]) {
      const yabanci = db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id != ?`).get(OWNER_ID).c;
      expect(yabanci).toBe(0);
    }
  });

  it("sahip hesabı parolasız oluşur — setpassword.js çalışana kadar giriş yapılamaz", () => {
    migrate(db, { ownerEmail: "  Emrullah@Example.COM  ", now: "2026-08-06T00:00:00Z" });
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(OWNER_ID);
    expect(u.email).toBe("emrullah@example.com"); // kırpılıp küçük harfe indirilir
    expect(u.password_hash).toBeNull();
    expect(u.google_sub).toBeNull();
    expect(u.created_at).toBe("2026-08-06T00:00:00Z");
  });

  it("user_version 2'ye çıkar ve göç idempotent olur", () => {
    expect(currentVersion(db)).toBe(0);
    expect(migrate(db, { ownerEmail: "a@b.co" }).migrated).toBe(true);
    expect(currentVersion(db)).toBe(2);

    const ikinci = migrate(db, { ownerEmail: "a@b.co" });
    expect(ikinci.migrated).toBe(false);
    // İkinci çağrı hiçbir şey yapmadığı için veri ve hesap sayısı aynı kalmalı.
    expect(db.prepare("SELECT COUNT(*) AS c FROM users").get().c).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS c FROM days").get().c).toBe(2);
  });

  it("asıl amaç: iki kullanıcı AYNI günü ve AYNI config anahtarını tutabilir", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run("u_es", "es@b.co", "2026-08-06");

    // v0'da bunlar birincil anahtar çakışmasıyla PATLARDI — göçün varlık sebebi bu.
    db.prepare("INSERT INTO days (user_id, date, meals) VALUES (?, ?, ?)").run("u_es", "2026-08-05", "[]");
    db.prepare("INSERT INTO config (user_id, key, value) VALUES (?, ?, ?)").run("u_es", "goals", "{}");

    expect(db.prepare("SELECT COUNT(*) AS c FROM days").get().c).toBe(3);
    expect(db.prepare("SELECT meals FROM days WHERE user_id = ? AND date = ?").get(OWNER_ID, "2026-08-05").meals)
      .toBe(OGUN); // sahibin günü etkilenmedi
  });

  it("aynı kullanıcı aynı günü iki kez ekleyemez (composite PK hâlâ koruyor)", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    expect(() =>
      db.prepare("INSERT INTO days (user_id, date, meals) VALUES (?, ?, ?)").run(OWNER_ID, "2026-08-05", "[]"),
    ).toThrow();
  });

  it("aynı e-posta ile ikinci hesap açılamaz", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    expect(() =>
      db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run("u_x", "a@b.co", "2026-08-06"),
    ).toThrow();
  });

  it("boş bir veritabanında da çalışır (yeni kurulum)", () => {
    const bos = new DatabaseSync(":memory:");
    bos.exec(V0_SCHEMA);
    const sonuc = migrate(bos, { ownerEmail: "a@b.co" });
    expect(sonuc.migrated).toBe(true);
    expect(bos.prepare("SELECT COUNT(*) AS c FROM days").get().c).toBe(0);
    bos.close();
  });
});

describe("migrateDown v2 → v0 (geri alma)", () => {
  it("gidiş-dönüş sahibin verisini birebir geri getirir", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    migrateDown(db);

    expect(currentVersion(db)).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS c FROM days").get().c).toBe(2);
    expect(db.prepare("SELECT meals FROM days WHERE date = ?").get("2026-08-05").meals).toBe(OGUN);
    expect(db.prepare("SELECT value FROM config WHERE key = ?").get("goals").value).toBe('{"kcal":2600}');
    expect(db.prepare("SELECT data FROM aliases WHERE id = ?").get("a_1").data).toBe(BESIN);

    // kimlik tabloları gitmiş olmalı
    const tablolar = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tablolar).not.toContain("users");
    expect(tablolar).not.toContain("sessions");
  });

  it("geri alma diğer kullanıcıların verisini DÜŞÜRÜR (tek kullanıcılık şemada yeri yok)", () => {
    migrate(db, { ownerEmail: "a@b.co" });
    db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run("u_es", "es@b.co", "2026-08-06");
    db.prepare("INSERT INTO days (user_id, date, meals) VALUES (?, ?, ?)").run("u_es", "2026-08-05", "[]");

    migrateDown(db);
    expect(db.prepare("SELECT COUNT(*) AS c FROM days").get().c).toBe(2); // yalnızca sahibin 2 günü
  });

  it("zaten v0 ise hiçbir şey yapmaz", () => {
    expect(migrateDown(db).migrated).toBe(false);
  });
});
