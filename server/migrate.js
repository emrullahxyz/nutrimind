// ============================================================================
// Nutrimind — şema göçü v0 → v2 (Faz D: çok kullanıcı).
//
// NEDEN GEREKLİ: mevcut şema tek kullanıcılık. `days`'in birincil anahtarı
// `date`, `config`'inki `key` — iki kullanıcı aynı günü işlediğinde ya da ikisinin
// de `goals` kaydı olduğunda ÇAKIŞIRLAR. SQLite bir birincil anahtarı `ALTER` ile
// değiştiremediği için bu iki tablo yeniden yaratılıp kopyalanmak zorunda.
//
// `aliases` YENİDEN YARATILMIYOR: id'leri zaten global benzersiz üretiliyor
// (`a_${base36}${randomBytes(4)}`, index.js:354), dolayısıyla sütun eklemek yetiyor.
// SQLite `NOT NULL` sütunu, varsayılanı NULL olmadığı sürece `ADD COLUMN` ile
// kabul eder.
//
// ⚠️ BU DOSYA KULLANICININ GERÇEK VERİSİNİ YENİDEN YAZAR ve `DROP TABLE days`
// içerir. Üç koruma katmanı:
//   1. `PRAGMA user_version` ile idempotent — ikinci kez çalışmaz.
//   2. Tek `BEGIN IMMEDIATE` … `COMMIT`; ortada patlarsa hiçbir şey yazılmaz.
//   3. Satır sayısı guard'ı: COMMIT'ten HEMEN ÖNCE sayılır, tutmazsa fırlatır.
//
// ⚠️ `node:sqlite` SENKRON çalışır: bir throw transaction'ı AÇIK bırakır. Bu
// yüzden catch içindeki `ROLLBACK` dekoratif değil, ZORUNLU.
// ============================================================================
"use strict";

const TARGET_VERSION = 2;

/** Mevcut tek kullanıcının sabit kimliği. Sabit bir değer olması göç sonrası
 *  elle `sqlite3` ile inceleme, geri alma ve parola kurma betiğini basitleştiriyor. */
const OWNER_ID = "u_owner";

function currentVersion(db) {
  return db.prepare("PRAGMA user_version").get().user_version;
}

function counts(db) {
  return {
    days: db.prepare("SELECT COUNT(*) AS c FROM days").get().c,
    aliases: db.prepare("SELECT COUNT(*) AS c FROM aliases").get().c,
    config: db.prepare("SELECT COUNT(*) AS c FROM config").get().c,
  };
}

/**
 * Şemayı v2'ye taşır. Zaten v2 ise hiçbir şey yapmaz.
 *
 * @param db `node:sqlite` DatabaseSync örneği
 * @param opts.ownerEmail  mevcut verinin atanacağı hesabın e-postası
 * @param opts.ownerId     varsayılan `u_owner`
 * @param opts.now         ISO zaman damgası (test edilebilirlik için dışarıdan)
 * @returns {{migrated:boolean, from:number, to:number, rows?:object}}
 */
function migrate(db, opts) {
  const o = opts || {};
  const ownerId = o.ownerId || OWNER_ID;
  const ownerEmail = String(o.ownerEmail || "owner@nutrimind.local")
    .trim()
    .toLowerCase();
  const now = o.now || new Date().toISOString();

  const from = currentVersion(db);
  if (from >= TARGET_VERSION) return { migrated: false, from, to: from };

  const before = counts(db);

  db.exec("BEGIN IMMEDIATE");
  try {
    // --- kimlik tabloları ---
    db.exec(`
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_sub    TEXT UNIQUE,
        display_name  TEXT,
        created_at    TEXT NOT NULL
      );
      CREATE TABLE sessions (
        id_hash    TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        ua         TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
    `);

    // `password_hash` bilerek NULL: hesap, `server/setpassword.js` çalıştırılana
    // kadar giriş yapılamaz durumda. "Parolasız satırı ele geçir" akışı YAZILMADI —
    // o dal tam olarak hesap ele geçirme bug'ına dönüşen daldır.
    db.prepare(
      "INSERT INTO users (id, email, password_hash, google_sub, display_name, created_at) VALUES (?, ?, NULL, NULL, NULL, ?)",
    ).run(ownerId, ownerEmail, now);

    // --- days: birincil anahtar (date) → (user_id, date) ---
    // Composite PK zaten user_id'yi en soldan indeksliyor; ayrıca indeks gereksiz.
    db.exec(`
      CREATE TABLE days_new (
        user_id TEXT NOT NULL,
        date    TEXT NOT NULL,
        meals   TEXT NOT NULL,
        PRIMARY KEY (user_id, date)
      );
    `);
    db.prepare("INSERT INTO days_new (user_id, date, meals) SELECT ?, date, meals FROM days").run(ownerId);
    db.exec("DROP TABLE days");
    db.exec("ALTER TABLE days_new RENAME TO days");

    // --- config: birincil anahtar (key) → (user_id, key) ---
    db.exec(`
      CREATE TABLE config_new (
        user_id TEXT NOT NULL,
        key     TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );
    `);
    db.prepare("INSERT INTO config_new (user_id, key, value) SELECT ?, key, value FROM config").run(ownerId);
    db.exec("DROP TABLE config");
    db.exec("ALTER TABLE config_new RENAME TO config");

    // --- aliases: yalnızca sütun eklenir (id'ler zaten global benzersiz) ---
    db.exec("ALTER TABLE aliases ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
    db.prepare("UPDATE aliases SET user_id = ?").run(ownerId);
    db.exec("CREATE INDEX idx_aliases_user ON aliases(user_id)");

    // --- GUARD: tek bir satır bile kaybolmuş olamaz ---
    const after = counts(db);
    if (after.days !== before.days || after.aliases !== before.aliases || after.config !== before.config) {
      throw new Error(
        `göç iptal: satır sayısı tutmadı — önce ${JSON.stringify(before)}, sonra ${JSON.stringify(after)}`,
      );
    }
    const orphan = db.prepare("SELECT COUNT(*) AS c FROM aliases WHERE user_id != ?").get(ownerId).c;
    if (orphan > 0) throw new Error(`göç iptal: ${orphan} besin sahipsiz kaldı`);

    db.exec(`PRAGMA user_version = ${TARGET_VERSION}`);
    db.exec("COMMIT");
  } catch (e) {
    // node:sqlite senkron olduğu için throw transaction'ı AÇIK bırakır.
    try {
      db.exec("ROLLBACK");
    } catch {
      /* zaten kapanmışsa sorun değil */
    }
    throw e;
  }

  return { migrated: true, from, to: TARGET_VERSION, rows: before };
}

/**
 * Geri alma: şemayı v0'a döndürür. YALNIZCA sahibin verisi korunur — başka
 * kullanıcılar varsa verileri TANIM GEREĞİ kaybolur (tek kullanıcılık şemada
 * duracak yer yok). Gerçek ikinci kullanıcılar oluştuktan sonra geri alma
 * "yedeği geri yükle" demektir, bu betik değil.
 */
function migrateDown(db, opts) {
  const ownerId = (opts && opts.ownerId) || OWNER_ID;
  const from = currentVersion(db);
  if (from < TARGET_VERSION) return { migrated: false, from, to: from };

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE days_old (date TEXT PRIMARY KEY, meals TEXT NOT NULL);
      CREATE TABLE config_old (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO days_old (date, meals) SELECT date, meals FROM days WHERE user_id = ?").run(ownerId);
    db.prepare("INSERT INTO config_old (key, value) SELECT key, value FROM config WHERE user_id = ?").run(ownerId);
    db.exec("DROP TABLE days");
    db.exec("ALTER TABLE days_old RENAME TO days");
    db.exec("DROP TABLE config");
    db.exec("ALTER TABLE config_old RENAME TO config");

    db.prepare("DELETE FROM aliases WHERE user_id != ?").run(ownerId);
    db.exec("DROP INDEX IF EXISTS idx_aliases_user");
    // SQLite 3.35+ DROP COLUMN destekliyor; yoksa sütun zararsızca kalır.
    try {
      db.exec("ALTER TABLE aliases DROP COLUMN user_id");
    } catch {
      /* eski SQLite — sütun kalsın, v0 kodu onu okumuyor */
    }

    db.exec("DROP TABLE IF EXISTS sessions");
    db.exec("DROP TABLE IF EXISTS users");
    db.exec("PRAGMA user_version = 0");
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* yut */
    }
    throw e;
  }

  return { migrated: true, from, to: 0 };
}

module.exports = { migrate, migrateDown, TARGET_VERSION, OWNER_ID, currentVersion };
