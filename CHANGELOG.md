# Değişiklik Günlüğü

Tüm önemli değişiklikler burada belgelenir. Sürümler [SemVer](https://semver.org/) takip eder.

## [0.1.0] — 2026-08-26

### Eklenen
- Besin hafızalı serbest metin öğün kaydı
- Alias öğrenme sistemi (kullanıcının kendi besin kısayolları)
- Kamera ile etiket/barkod okuma (Open Food Facts entegrasyonu)
- Google Gemini AI ile görselden besin değeri çıkarma
- TDEE bazlı günlük hedef hesaplama (Bazal metabolizma + aktivite)
- 5 adımlı onboarding sihirbazı (yaş, cinsiyet, boy, kilo, aktivite)
- 2000+ birim/entegrasyon testi (vitest)
- Hesap silme ve veri dışa aktarma (KVKK m.7, m.11 / GDPR Art.17, Art.20)
- KVKK uyumlu gizlilik politikası (TR/EN/PL)
- SEO meta etiketleri (Open Graph, Twitter Card)
- robots.txt + sitemap.xml

### Altyapı
- Vite 6 + React 18 + TypeScript 5
- Tailwind CSS 3, Manrope + JetBrains Mono font
- Sıfır bağımlılıklı Node backend (node:http + node:sqlite + node:crypto, Node 22+)
- scrypt şifre hash + SHA-256 oturum hash
- PWA manifest + minimal service worker (network-first, çevrimdışı YOK)
- Cookie tabanlı oturum (`__Host-nm_session`, HttpOnly, Secure, SameSite=Lax, 30 gün kayan)
- Google OAuth 2.0 + PKCE S256 girişi
- CSRF koruması (Same-Origin + Sec-Fetch-Site)
- Rate limit (IP + email başına)

### Bilinen Sınırlamalar
- Çevrimdışı çalışmaz (bilinçli: API önbelleğe alınmaz, sızıntı riski)
- Google Play Store yayını için Capacitor wrapper + assetlinks.json gerekir
- i18n altyapısı Faz 5'te gelecek (varsayılan TR)
