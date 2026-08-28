#!/bin/bash
# Nutrimind data.db haftalık yedek.
# cron: 0 3 * * 0 /home/emrullah/nutri-api/server/backup.sh
#
# sqlite3 online backup kullanır (production DB kilitli olsa bile çalışır).
# .backup komutu atomik snapshot alır; mevcut dosya kilitlenmez.
# Yerel kopyaladıktan sonra isteğe bağlı uzak (S3/Backblaze) push yapılabilir.

set -euo pipefail

# Production server /home/emrullah/nutri-api/ üzerinde; DB oradaki index.js'in
# yanında olur (index.js __dirname hesaplar). Frontend dist'i /var/www/nutri'ye
# basılır ama server orada DEĞİL. NUTRI_DB env ile override edilebiliyor.
DB_PATH="${NUTRI_DB:-/home/emrullah/nutri-api/data.db}"
BACKUP_DIR="/var/backups/nutrimind"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/data-$TIMESTAMP.db"

if [ ! -f "$DB_PATH" ]; then
  echo "DB bulunamadı: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# 30 günden eski yedekleri temizle
find "$BACKUP_DIR" -name "data-*.db" -mtime +$RETENTION_DAYS -delete

echo "Yedek tamam: $BACKUP_FILE"
