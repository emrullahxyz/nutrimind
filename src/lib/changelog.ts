// Uygulama-içi changelog — istemcide statik veri, ağ çağrısı yok.
// İçerikler TR+EN çift dillidir (PL istenmedi); `dev` satırları repo dili Turkish.
// Yeni sürüm eklerken listeye başa ekle; `date` ISO `YYYY-MM-DD`.
export type ChangeLogUserType = "new" | "improved" | "fixed";

export interface ChangeLogVersion {
  version: string; // "0.29.0"
  date: string; // "2026-09-04"
  summary: { tr: string; en: string }; // kullanıcı-önemli 1-3 cümle
  items: { type: ChangeLogUserType; tr: string; en: string }[]; // tek tek kullanıcı görünen maddeler
  dev: string[]; // dev-level detay satırları (TR, repo dili)
}

export const CHANGELOG: ChangeLogVersion[] = [
  {
    version: "0.28.8",
    date: "2026-09-04",
    summary: {
      tr: "Artık uygulama içinden doğrudan geri bildirim gönderebilir ve yeni özellik isteyebilirsin. Ayrıca her güncellemeden sonra nelerin değiştiğini bu changelog ekranından görebilirsin.",
      en: "You can now send feedback and request new features right from the app. You can also see what changed in every update from this in-app changelog screen.",
    },
    items: [
      {
        type: "new",
        tr: "Uygulama içinden geri bildirim ve özellik isteği gönderebilirsin (\"Özellik iste ve geri bildirim\" bölümünde).",
        en: "Send feedback and feature requests from inside the app (in the \"Request a feature & feedback\" section).",
      },
      {
        type: "new",
        tr: "Her sürüm sonrası değişiklikleri sana gösteren changelog eklendi (bu ekran).",
        en: "Added a changelog that shows you what changed after each release (this screen).",
      },
    ],
    dev: [],
  },
  {
    version: "0.28.0",
    date: "2026-08-31",
    summary: {
      tr: "0.28 serisiyle uygulama çevrimdışı da kullanılabilir hale geldi: internet olmasa bile kayıtlarını tutar, bağlanınca otomatik senkronize eder. Arayüz Türkçe, İngilizce ve Lehçe olarak tamamen çevrildi; kamera ve barkod tarama elden geçirildi. Ayrıca Android (Play Store) hazırlıkları başladı.",
      en: "With the 0.28 series the app now works offline: you can keep logging without an internet connection and it syncs automatically once you're back online. The whole interface is now fully translated into Turkish, English and Polish; camera and barcode scanning were reworked. Android (Play Store) groundwork also began.",
    },
    items: [
      {
        type: "new",
        tr: "Çevrimdışı destek: internet olmadan da kayıt yapabilir, verilerin bağlantı gelince otomatik senkronize olur.",
        en: "Offline support: log entries without an internet connection; data syncs automatically when you're back online.",
      },
      {
        type: "new",
        tr: "Tüm arayüz Türkçe, İngilizce ve Lehçe dillerine eksiksiz çevrildi.",
        en: "The full interface is now translated into Turkish, English and Polish.",
      },
      {
        type: "improved",
        tr: "Kamera ve barkod tarama deneyimi iyileştirildi.",
        en: "Camera and barcode scanning experience improved.",
      },
      {
        type: "improved",
        tr: "Android sürümü ve Play Store yayını için hazırlıklar başladı.",
        en: "Preparations started for an Android build and Play Store release.",
      },
    ],
    dev: [
      "feat(offline): yazma kuyrugu + projection + conflict korumali sync + SyncStatus UI",
      "feat(offline): sync cift sekme korumasi (Web Locks) + arama/barkod/kamera cevrimdisinda kilitli",
      "feat(i18n): react-i18next kurulumu + EN/TR/PL tam geçiş (Sayfalar/Modal'lar/leaf card'lar)",
      "fix(camera): ScanSheet elle giriş + önizleme geri navigasyonu; barkod modunda manuel giriş",
      "feat(capacitor): Android platformu + Play Store sarmalayıcı hazırlığı",
      "feat(ai): fotoğraf yükleme için tek seferlik onay + Sentry crash raporlama",
    ],
  },
];

export const CHANGELOG_LATEST = CHANGELOG[0]?.version ?? null;
