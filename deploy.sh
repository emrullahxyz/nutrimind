#!/usr/bin/env bash
# Nutrimind — tek komutla build + sunucuya deploy.
# Kullanım (Git Bash):  bash deploy.sh   ya da   pnpm deploy
set -e

KEY="/c/Users/Emrullah/Desktop/Projeler/.ssh/id_oracle"
SERVER="emrullah@92.5.42.0"
WEBROOT="/var/www/nutri"

echo "→ 1/3 build (tsc + vite)"
pnpm build

echo "→ 2/3 paketle + yükle"
tar czf nutri-dist.tar.gz -C dist .
scp -i "$KEY" -o ConnectTimeout=20 nutri-dist.tar.gz "$SERVER:/tmp/nutri-dist.tar.gz"
rm -f nutri-dist.tar.gz

echo "→ 3/3 sunucuda aç"
ssh -i "$KEY" -o ConnectTimeout=20 "$SERVER" "
  sudo find $WEBROOT -mindepth 1 -delete
  sudo tar xzf /tmp/nutri-dist.tar.gz -C $WEBROOT
  sudo chown -R www-data:www-data $WEBROOT
  rm -f /tmp/nutri-dist.tar.gz
"

echo "✓ canlı: https://nutri.emrullah.xyz"
