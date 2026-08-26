# data.db Yedekleme (haftalık cron)

`server/backup.sh` her Pazar 03:00'te çalışır; `/var/backups/nutrimind/` altında
tarih damgalı snapshot bırakır, 30 günden eskileri siler.

## Kurulum

1. Sunucuda sqlite3 yüklü mü kontrol et: `which sqlite3`
2. Backup dizinini oluştur: `sudo mkdir -p /var/backups/nutrimind && sudo chown $USER /var/backups/nutrimind`
3. Script'i executable yap: `chmod +x /var/www/nutri/server/backup.sh`
4. İlk yedek (manuel test): `bash /var/www/nutri/server/backup.sh`
5. Cron ekle: `crontab -e`, son satıra:
   ```
   0 3 * * 0 /var/www/nutri/server/backup.sh >> /var/log/nutrimind-backup.log 2>&1
   ```

## Doğrulama

- `ls -la /var/backups/nutrimind/` → `data-YYYYMMDD-HHMMSS.db` dosyaları görünmeli
- `sqlite3 data-*.db ".schema"` → schema görünmeli (bozuk değil)

## Opsiyonel: Uzak kopyalama

- AWS S3: `aws s3 cp "$BACKUP_FILE" s3://nutrimind-backups/`
- Backblaze B2: `b2 upload-file ...`
- rsync başka sunucuya: `rsync -avz /var/backups/nutrimind/ backup@other:/backups/`

## Geri yükleme

```bash
# Sunucuyu durdur (yazma kilidi)
sudo systemctl stop nutrimind

# Yedekten geri yükle
cp /var/backups/nutrimind/data-20260826-030000.db /var/www/nutri/data.db
chown $USER /var/www/nutri/data.db

# Sunucuyu başlat
sudo systemctl start nutrimind
```

## Üretimde ilk çalıştırma

Bu script sadece üretim Oracle VPS'te anlamlı; yerel repo'da veya Windows
geliştirme makinesinde çalıştırma. Linux'a özgü yollar (`/var/www/nutri/data.db`,
`/var/backups/nutrimind`) ve `sqlite3` CLI varsayımı yapıyor. Kurulum adımları
deploy runbook'unun parçası olarak sunucuda uygulanır; bu dosya referans
niteliğindedir.
