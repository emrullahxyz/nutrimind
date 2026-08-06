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
const { DatabaseSync } = require("node:sqlite");
const auth = require("./auth.js");
const { migrate, OWNER_ID } = require("./migrate.js");

function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  if (!emailArg || !passwordArg) {
    console.error("kullanım: node server/setpassword.js <e-posta> <parola>");
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
  } else {
    const owner = db.prepare("SELECT id, email FROM users WHERE id = ?").get(OWNER_ID);
    if (!owner) {
      console.error(`hesap bulunamadı: ${email} — ve sahip hesabı (${OWNER_ID}) da yok`);
      db.close();
      process.exit(1);
    }
    targetId = owner.id;
    db.prepare("UPDATE users SET email = ?, password_hash = ? WHERE id = ?").run(email, hash, targetId);
    console.log(`sahip hesabı güncellendi: ${owner.email} → ${email} (${targetId})`);
  }

  // Parola değişince o hesabın TÜM açık oturumları düşürülür. Parola
  // değiştirmenin anlamı çalınmış bir oturumu kesmekse, bu şart.
  const kalan = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
  if (kalan && kalan.changes > 0) console.log(`${kalan.changes} açık oturum kapatıldı`);

  db.close();
}

main();
