# Değişiklik Günlüğü

> **Bu dosya artık sadece bir köprüdür.** Kullanıcıya görünen sürüm geçmişinin **tek kaynağı**
> `src/lib/changelog.ts`'tir (uygulama içi sürüm notu popup'ını da o besler). Sürüm geçmişi
> git etiketleriyle birlikte orada tutulur; buraya elle giriş eklenmez.
>
> Yeni sürüm çıkarırken: `src/lib/version.ts` `APP_VERSION` + `src/lib/changelog.ts` başına giriş
> (bkz. `AGENTS.md` → Sürüm kuralı).

Tüm önemli değişiklikler `src/lib/changelog.ts` içinde belgelenir. Sürümler
[SemVer](https://semver.org/) takip eder.

## Sürüm geçmişi

Tam liste ve en son sürüm: `src/lib/changelog.ts` (`APP_VERSION` ile birlikte,
şu an **0.30.0**). Bu dosyada tutulan eski `[0.1.0] — 2026-08-26` girişi gerçeklikle
çeliştiği için kaldırıldı: uygulama o tarihte 0.1.0 değildi ve "çevrimdışı çalışmaz",
"i18n Faz 5'te gelecek" gibi maddeler uygulamanın o günden sonraki hâlini yanlış
anlatıyordu (çevrimdışı yazma kuyruğu ve 3 dilli i18n artık mevcut). Git geçmişi
zaten tam tarihçeyi taşıyor.
