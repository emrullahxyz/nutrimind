# Nutrimind Güvenlik Dokümanı — denetim bulguları ve kabuller

Tarih: 2026-09-07 (49 maddelik yayın öncesi denetim + SSH canlı doğrulama)

## Kabul edilen riskler (kod değişikliği YOK — kullanıcı kararı)

- **AI harcama kotası global** (madde 22/32): `server/ai.js` kovaları (parse 10/dk,
  vision 15/dk, NIM 10/5) TÜM kullanıcılar için ortaktır; kullanıcı başına günlük
  limit ve bütçe uyarısı yoktur. Mevcut ölçek 5 kullanıcıdır; tek hesap kotayı
  tüketirse tüm uygulama 429 olur. Çok kullanıcılı büyümede yeniden değerlendir.
- **Register 409 "e-posta zaten kayıtlı"** (madde 30): hesap varlığını ele verir;
  1-5 kişilik kapalı uygulamada kabul edilmiş (kod yorumu da aynısını söylüyor).
- **allowBackup** (madde 39): düzeltildi — `android:allowBackup="false"`.

## Denetimde doğrulanan güçlü yönler (izleme gerektirmez)

Şifreler scrypt (N=32768,r=8,p=1), oturum id DB'de hash'li + HttpOnly `__Host-`
çerez, sunucu tam parametreli SQL, XSS sink yok (React otomatik escape), SSRF yok
(tüm dış URL'ler sabit), repo private + CI yok, keystore/.env git dışı.

## Prod canlı doğrulama sonuçları (2026-09-07)

- `NUTRIMIND_AUTH_ENABLED=1` (401 kapısı canlı teyitli)
- `NUTRI_SECURE_COOKIE=1` (`__Host-` çerez)
- HTTP→HTTPS 301 + HSTS / nosniff / X-Frame (nginx = YunoHost katmanı, repo dışı)
- Yedekleme: kuruldu — `nutrimind-backup.timer` günlük çalışır
  (bkz. docs/operations/backup.md)
