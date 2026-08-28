# Çevrimdışı mod — operasyon dokümanı

## Ne yapar
- Öğün/gün ve besin hafızası (alias) yazmaları çevrimdışıda IndexedDB kuyruğuna alınır
  (`src/lib/offlineCache.ts`), arayüz projeksiyonla anında güncellenir
  (`src/lib/offlineProjection.ts`).
- Bağlantı gelince `src/lib/offlineSync.ts` kuyruğu sırayla gönderir: sunucu verisi
  değişmişse işlem `conflict` olur (sessiz ezme yok), kullanıcı cihaz/sunucu seçer.
- Ağ/5xx'te üstel geri çekilme (1s→2s→5s→15s→30s→60s); 401'de sync durur; 4xx'te
  işlem `failed` olur, SyncStatus'tan Tekrar Dene/İptal edilir.
- AI analizi, kamera, Open Food Facts ve yedek geri yükleme çevrimdışıda KİLİTLİDİR
  (`offline.featureUnavailable` / `offline.writeUnavailable` mesajları).

## Manuel smoke testi (her büyük dağıtımdan önce, ~10 dk)
1. `node server/index.js` + `pnpm preview` (4173) çalıştır; uygulamaya giriş yap.
2. Geliştirici araçları → Network → **Offline** işaretle.
3. Bir gün öğün ekle → kart anında görünmeli, üstte "1 değişiklik bekliyor" amber banner.
4. Hafızaya yeni besin öğret → alias listesinde görünmeli (`local:` id).
5. AI tarama butonuna bas → kilitli/uyarı mesajı; OFF arama aynı.
6. Ayarlar → yedek geri yükleme → engellenmeli.
7. Sayfayı yenile (kuyruk IndexedDB'de kalmalı) → banner sayısı korunmalı.
8. Network → **Online** → otomatik senkron: banner kaybolmalı, `/api/day` 200 olmalı.
9. Çakışma tatbikatı: iki sekme aç; sekme A offline öğün ekle; sekme B'de AYNI günü
   online değiştir; A'yı online yap → conflict rozeti + Cihaz/Sunucu seçimi gelmeli.
10. Android'de tekrar: uçuş modu + adım 3-8 (Capacitor build).

## Bilinen sınırlar
- Hedefler/config/profil yazmaları çevrimdışıda kapalı (bilinçli kapsam sınırı).
- Çift sekme koruması Web Locks destekli tarayıcılarda tam; eski tarayıcıda modül-içi lock.