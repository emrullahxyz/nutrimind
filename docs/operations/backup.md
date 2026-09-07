# data.db Yedekleme (günlük — systemd timer)

`server/backup.sh` her gece çalışır; `/var/backups/nutrimind/` altında tarih damgalı
snapshot bırakır, 30 günden eskileri siler.

## Canlı kurulum (domdom)

Backup script `/home/emrullah/nutri-api/backup.sh` konumunda; `nutrimind-backup.timer`
ve `.service` unit'leri `/etc/systemd/system/` altında. Timer `OnCalendar=daily` +
`Persistent=true` (kaçırılanları yakalar).

```bash
# Kontrol
systemctl list-timers | grep nutri
ls -la /var/backups/nutrimind/

# Elle yedek
bash /home/emrullah/nutri-api/backup.sh
```

## Geri yükleme

```bash
# Servisi durdur (yazma kilidi) — servis adı nutri-api
sudo systemctl stop nutri-api

# Yedekten geri yükle (canlı DB: /home/emrullah/nutri-api/data.db)
cp /var/backups/nutrimind/data-YYYYMMDD-HHMMSS.db /home/emrullah/nutri-api/data.db
sudo chown emrullah:emrullah /home/emrullah/nutri-api/data.db

# Servisi başlat
sudo systemctl start nutri-api
```

## Doğrulama

- `ls -la /var/backups/nutrimind/` → `data-YYYYMMDD-HHMMSS.db` görünmeli
- Bir yedeği aç ve schema'yı kontrol et: `sqlite3 data-*.db ".schema"` → görünmeli (bozuk değil)
- Yedek `.backup` komutuyla atomik snapshot alır; üretim DB'si kilitliyken de çalışır.

## Opsiyonel: Uzak kopyalama

- AWS S3: `aws s3 cp "$BACKUP_FILE" s3://nutrimind-backups/`
- Backblaze B2: `b2 upload-file ...`
- rsync başka sunucuya: `rsync -avz /var/backups/nutrimind/ backup@other:/backups/`

## Üretimde ilk çalıştırma

Bu script sadece üretim VPS'te anlamlı; yerel repo'da veya Windows geliştirme
makinesinde çalıştırma. Linux'a özgü yollar (`/home/emrullah/nutri-api/data.db`,
`/var/backups/nutrimind`) ve `sqlite3` CLI varsayımı yapıyor. Kurulum adımları
deploy runbook'unun parçası olarak sunucuda uygulanır; bu dosya referans
niteliğindedir.
