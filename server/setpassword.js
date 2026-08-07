#!/usr/bin/env node
// ============================================================================
// Nutrimind — hesap parolası kurma/değiştirme (tek seferlik CLI).
//
// Kullanım:
//   node server/setpassword.js <e-posta> <parola>
//   NUTRI_DB=/yol/data.db node server/setpassword.js <e-posta> <parola>
//
// NEDEN BİR CLI: göç, mevcut verinin sahibini `password_hash = NULL` ile
// oluşturuyor — yani o hesaba giriş YAPILAMAZ. Parolayı kurmanın alternatifi
// "parolasız bir satır görürsen register ile sahiplen" akışıydı; o dal tam
// olarak hesap ele geçirme bug'ına dönüşen daldır ve bilerek YAZILMADI.
// Bu betikle `NUTRIMIND_ALLOW_SIGNUP` sonsuza kadar "0" kalabiliyor: sahibin
// hesabına giden hiçbir HTTP yolu yok.
//
// E-posta hesapta kayıtlı olandan farklıysa ve o e-posta başkasına ait değilse,
// sahibin e-postası da bu değere GÜNCELLENİR (göç `owner@nutrimind.local`
// yer tutucusuyla oluşturuyor).
// ============================================================================
"use strict";

const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const auth = require("./auth.js");
const { migrate, OWNER_ID } = require("./migrate.js");

function main() {
  const args = process.argv.slice(2);
  const create = args.includes("--create");
  const [emailArg, passwordArg] = args.filter((a) => a !== "--create");
  if (!emailArg || !passwordArg) {
    console.error("kullanım: node server/setpassword.js <e-posta> <parola> [--create]");
    console.error("  --create : YENİ bir hesap açar (ikinci kullanıcı için)");
    process.exit(2);
  }

  const emailProblem = auth.emailProblem(emailArg);
  if (emailProblem) {
    console.error(`e-posta reddedildi: ${emailProblem}`);
    process.exit(2);
  }
  const passwordProblem = auth.passwordProblem(passwordArg);
  if (passwordProblem) {
    console.error(`parola reddedildi: ${passwordProblem}`);
    process.exit(2);
  }

  const dbPath = process.env.NUTRI_DB || path.join(__dirname, "data.db");
  const db = new DatabaseSync(dbPath);
  // Betik, sunucu hiç açılmamış bir veritabanında da çalışabilsin.
  migrate(db, { ownerEmail: process.env.NUTRIMIND_OWNER_EMAIL });

  const email = auth.normalizeEmail(emailArg);
  const hash = auth.hashPassword(passwordArg);

  const byEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  let targetId;

  if (byEmail) {
    targetId = byEmail.id;
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, targetId);
    console.log(`parola güncellendi: ${email} (${targetId})`);
  } else if (create) {
    targetId = `u_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
    db.prepare(
      "INSERT INTO users (id, email, password_hash, google_sub, display_name, created_at) VALUES (?, ?, ?, NULL, NULL, ?)",
    ).run(targetId, email, hash, new Date().toISOString());
    console.log(`YENİ hesap açıldı: ${email} (${targetId})`);
  } else {
    // ⚠️ SAHİP DEVRALMA KAPISI. Buradaki dal eskiden koşulsuzdu: e-posta
    // bulunamazsa sahip hesabının E-POSTASINI değiştirip parolayı ona yazıyordu.
    // Yani ikinci bir kullanıcı açmak isterken (ya da adresi yanlış yazarken)
    // SAHİBİN hesabı ele geçirilmiş oluyordu. Artık yalnızca sahip hesabı HÂLÂ
    // SAHİPSİZKEN (göçün bıraktığı yer tutucu e-posta + parola yok) devralınabilir.
    const owner = db.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").get(OWNER_ID);
    const sahipsiz = owner && owner.password_hash === null;
    if (!owner || !sahipsiz) {
      console.error(`hesap bulunamadı: ${email}`);
      console.error("Yeni bir hesap açmak istiyorsan --create ekle.");
      console.error("(Sahip hesabı zaten kurulmuş; e-postasını bu betikle değiştiremezsin.)");
      db.close();
      process.exit(1);
    }
    targetId = owner.id;
    db.prepare("UPDATE users SET email = ?, password_hash = ? WHERE id = ?").run(email, hash, targetId);
    console.log(`sahip hesabı kuruldu: ${owner.email} → ${email} (${targetId})`);
  }

  // Parola değişince o hesabın TÜM açık oturumları düşürülür. Parola
  // değiştirmenin anlamı çalınmış bir oturumu kesmekse, bu şart.
  const kalan = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
  if (kalan && kalan.changes > 0) console.log(`${kalan.changes} açık oturum kapatıldı`);

  db.close();
}

main();
