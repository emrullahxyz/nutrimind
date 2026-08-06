// ============================================================================
// Nutrimind — minimal service worker (ağ-öncelikli, çevrimdışı için önbellek yedeği).
//
// SÜRÜM ARTIŞI KOZMETİK DEĞİL. v1 HER başarılı GET'i koşulsuz önbelleğe yazıyordu:
// URL filtresi yok, origin kontrolü yok. Yani `/api/data` yanıtları — kullanıcının
// TÜM beslenme verisi — Cache Storage'a düşüyordu ve ağ tökezlediğinde oradan
// servis ediliyordu. Çok kullanıcılı sürümde bu doğrudan bir SIZINTI olur:
// A kullanıcısının verisi B kullanıcısına gösterilir.
//
// Adı `nutrimind-v2` yapmak + `activate`'te eskisini silmek, zaten zehirlenmiş
// v1 önbelleğinin kurulu cihazlardan ATILMA mekanizmasıdır. Yalnızca isim
// değiştirmek yetmez; temizlik olmadan v1 diskte kalır.
// ============================================================================
const CACHE = "nutrimind-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return; // ayrıştırılamayan istek: dokunma, ağa gitsin
  }

  // API'ye HİÇ dokunma. `respondWith` çağırmadan dönmek isteği el değmemiş
  // biçimde ağa bırakır. Bilinmeyen bir andan kalma önbelleklenmiş `/api/data`,
  // dürüst bir ağ hatasından daha kötüdür — üstelik kullanıcıya ait.
  // NOT: Bu, uygulamanın çevrimdışı çalışmadığı anlamına gelir. Zaten fiilen
  // çalışmıyordu; gerçek çevrimdışı desteği kullanıcıya göre anahtarlanmış bir
  // IndexedDB deposu ister — ayrı bir iş.
  if (url.pathname.startsWith("/api/")) return;

  // Yalnızca kendi origin'imiz. v1, Google Fonts yanıtlarını da süresiz
  // önbelleğe alıyordu (index.html'deki fonts.googleapis.com bağlantıları).
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches
          .open(CACHE)
          .then((c) => c.put(req, copy))
          .catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
  );
});
