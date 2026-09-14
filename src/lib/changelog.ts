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
    version: "0.30.1",
    date: "2026-09-15",
    summary: {
      tr: "Yeni hesaplarda kurulumun hemen ardından altı adımlık kısa bir tur başlıyor: tur uygulamayı baştan gezmez, ekranda duran ilgili bölümü vurgular ve istediğin an atlanabilir. Ayarlar'daki “Kilo & Vücut Geçmişi” ekranı artık gerçekten senin verilerini gösteriyor — son ölçümün, hedef kilon, yolun yüzde kaçını aldığın, kilo grafiği ve tüm ölçümlerinin listesi; önceden herkese aynı sabit değerleri gösteriyordu. Hedef kilonu artık Profil Bilgileri'nden değiştirebilirsin ve Ayarlar daha anlaşılır bir sıraya girdi.",
      en: "New accounts now get a short six-step tour right after setup: it doesn't march you through the app — each step highlights the part of the screen that's already there, and you can skip it at any time. The “Weight & Body History” screen in Settings now shows your real data — your latest measurement, your target weight, how far along you are, the weight chart and the full list of your measurements; it used to show the same fixed placeholders to everyone. You can now change your target weight in Profile too, and Settings itself is ordered more sensibly.",
    },
    items: [
      {
        type: "new",
        tr: 'Yeni hesapta ilk kurulumdan sonra altı adımlık kısa bir rehber açılıyor; her adımda "Sonraki" ile ilerler, "Atla" ile çıkarsın. Rehber her adımda ekrandaki ilgili bölümü vurguluyor (kalori özeti, öğün ekleme, Hafıza, + düğmesi, İlerleme, Ayarlar), yani gerçek arayüzü öğretiyor.',
        en: 'A short six-step guide now appears after first-time setup; move on with "Next" or leave with "Skip". Each step highlights the relevant part of the screen (calorie summary, adding a meal, Memory, the + button, Progress, Settings) so you learn the real interface.',
      },
      {
        type: "improved",
        tr: "Rehberi Ayarlar'dan istediğin zaman yeniden başlatabilirsin; gördükten sonra kendiliğinden tekrar çıkmaz ve hesabına bağlıdır (başka bir cihazda da yine çıkmaz).",
        en: "You can restart the tour from Settings at any time; it won't come back on its own and it's tied to your account (so it stays dismissed on your other devices too).",
      },
      {
        type: "fixed",
        tr: "“Kilo & Vücut Geçmişi” ekranındaki sahte değerler kaldırıldı: “mevcut kilo” artık en son ölçümün, “hedef kilo” ise gerçekten belirlediğin hedef; ilerleme çubuğu bu iki değere göre hesaplanıyor.",
        en: "The fake numbers on the “Weight & Body History” screen are gone: “current weight” is your latest measurement, “target weight” is the goal you actually set, and the progress bar is computed from those two.",
      },
      {
        type: "new",
        tr: "O ekranda artık ölçüm geçmişin listeleniyor (tarih, kilo ve önceki ölçüme göre fark) ve yanlış/eski bir kaydı tek dokunuşla silebiliyorsun.",
        en: "That screen now lists your measurement history (date, weight and the change since the previous one) and lets you delete a wrong or stale entry with one tap.",
      },
      {
        type: "new",
        tr: "Hedef kilonu Profil Bilgileri'nde değiştirebilirsin — kurulum sırasında girdiğin bu değer şimdiye kadar hiçbir yerde kullanılmıyordu.",
        en: "You can change your target weight in Profile — the value you entered during setup was never used anywhere until now.",
      },
      {
        type: "improved",
        tr: "Kurulumda girdiğin kilo, kilo geçmişinin başlangıç ölçümü olarak kaydediliyor; geçmiş boş kalmıyor ve ilerleme yüzdesi ilk günden anlamlı.",
        en: "The weight you enter during setup is now saved as the starting measurement of your weight history, so the history isn't empty and the progress percentage is meaningful from day one.",
      },
      {
        type: "improved",
        tr: "Ayarlar yeniden sıralandı: veri yedekleme/gizlilik/geri bildirim kendi bölümünde, bölüm başlıkları içeriğiyle uyumlu ve “Çıkış Yap” en sonda.",
        en: "Settings was reordered: data backup, privacy and feedback now sit together, section titles match what's inside them, and “Log out” is last.",
      },
      {
        type: "fixed",
        tr: "Profil bilgileri (ad, yaş, boy, kilo) artık hesabına kaydediliyor — önceden yalnızca bu cihazda saklanıyordu; profil kartı ve alanlar da boşken uydurma değerler (29 yaş / 78 kg gibi) göstermiyor.",
        en: "Your profile info (name, age, height, weight) is now saved to your account — it used to live only on this device; the profile card and fields no longer show made-up values (like age 29 / 78 kg) when empty.",
      },
      {
        type: "fixed",
        tr: "Android geri tuşu, Escape ve ekranın dışına dokunma rehberi temiz biçimde kapatıyor; arka plandaki sayfa kilitli kalıyor ve kapanınca odak açtığın yere dönüyor.",
        en: "The Android back button, Escape and tapping outside close the tour cleanly; the page behind stays locked and focus returns to where you opened it.",
      },
    ],
    dev: [
      'Kok neden: SettingsSheet\'teki weight alt-gorunumu gercek veriye baglanmamis bir yer tutucuydu — mevcut kilo localStorage->profile.weightKg->literal "78", hedef kilo i18n `settings.targetWeightValue` (3 dilde sabit "75 kg"), cubuk sabit `w-3/4`.',
      "Onboarding'in topladigi `profile.targetWeightKg` uygulamada HIC okunmuyordu (grep: yalnizca OnboardingModal + tdee tipi) — hedef kilo artik tek dogruluk kaynagi bu alan.",
      "lib/weight.ts: sortedEntries/latestEntry/seedEntry/parseBodyStats/profileWeightEntries/weightProgress (saf + testli). weightProgress tek formulle iki yonde calisir ve [0,1] kirpilir; |hedef-baslangic|<0.05 ise pct=null.",
      "components/WeightSettings.tsx (yeni): ozet + gercek ilerleme + RangePicker/WeightTrendCard + olcum listesi (tek tek silme); yazma yolu WeightCard'in kendisi (tek yazar).",
      "profileWeightEntries: yalnizca kilo alani BU oturumda duzenlendiyse yazar — sadece adi duzeltmek icin kaydetmek bugunun olcumunu bayat form degeriyle eziyordu.",
      "handleSaveProfile artik `config.profile`a yaziyor (onceden SADECE localStorage) ve form onceligi config-first'e cevrildi; `hasCompletedOnboarding` spread ile korunuyor.",
      "Sihirbaz bitisinde `seedEntry` ile bugune baslangic olcumu yazilir (try/catch — kurulumu bloklamaz; o gun kayit varsa dokunmaz).",
      'Uydurma veri temizligi: avatar fallback literal `"EB"` -> jenerik ikon; form varsayilanlari "29"/"78"/"178" -> bos; profil kartindaki kg yalnizca gercek deger varsa yazilir.',
      'Ayarlar sirasi: veri satiri Hesap & Profil -> Veri & Destek (ilk satir); kilo satiri hedeflerin altina; Destek blogu veri/gizlilik/geri bildirim/destek/yardim/surum sirasinda; `settings.accountActions` basligi "Hesap Islemleri" -> "Uygulama & Hesap"; olu anahtar `targetWeightValue` 3 dilden silindi (796 -> 814 anahtar).',
      "Backend DEGISMEDI; `config.weight` sekli (`{entries}`) ayni — migration yok.",
      "lib/guide.ts (saf): GUIDE_VERSION + parseGuideState/isGuideDone/shouldShowGuide + GUIDE_STEPS; guide.test.ts karar matrisini ve adim tablosunu kilitler.",
      "Rehber durumu `config.guide` altinda (RESERVED_CONFIG_KEYS'e dokunulmadi; anahtar `^[a-z][a-z0-9_]{0,31}$` desenine uyuyor) — backend DEGISMEDI.",
      "components/ProductGuide.tsx: tek portal, uc katman (seffaf perde + box-shadow spotlight + kart); yerlesim lib/anchor.placeAnchoredPanel ile, odak/geri-tusu useDialogFocus/useModalHistory/useBodyScrollLock ile (elle focus trap YOK).",
      "Kapilanma yolu = skipped, son adimda Tamam = completed; niyet ref'te tutulup useModalHistory'nin onClose'unda okunuyor (geri tusu ile X ayni onClose'a dusuyor).",
      "data-guide-target isaretleri: StatCardCarousel (day-summary), DayView iki ekleme CTA'si (add-meal), BottomNav sekmeleri (${tab.id}-tab) + FAB (fab).",
      "Hedef bulunamazsa kart ekranin ortasina duser (tur yarida kesilmez); changelog popup'i rehber kapanana kadar erteleniyor.",
    ],
  },
  {
    version: "0.30.0",
    date: "2026-09-13",
    summary: {
      tr: "Bir öğüne uzun basarak (ya da satırdaki ⋮ düğmesiyle) işlem menüsünü açabilirsin: şablon olarak kaydet, aynısından bir tane daha ekle, düzenle, seç, tarif olarak kaydet (100 g) ve sil. Menü, dokunduğun satırın yanında yüzen yuvarlak bir panel olarak açılır; parmağını kaldırırken aksiyon kendiliğinden çalışmaz ve arkadaki sayfa kaymaz.",
      en: "Long-press a meal (or use its ⋮ button) to open its actions: save as a template, add another one, edit, select, save as a recipe (100 g) and delete. The menu floats as a rounded panel next to the row you touched; lifting your finger won't trigger an action, and the page behind stays put.",
    },
    items: [
      {
        type: "new",
        tr: "Öğüne uzun basınca işlem menüsü açılıyor; öğünü tek dokunuşla şablon olarak kaydedebiliyorsun.",
        en: "Long-pressing a meal opens an action menu; you can save the meal as a template with one tap.",
      },
      {
        type: "new",
        tr: "Menü, dokunduğun satıra demirlenen yüzen yuvarlak bir panel: basış noktasından büyüyerek açılır, satırlar 30 ms arayla gelir, kapanırken aynı yoldan geri çekilir.",
        en: "The menu is a floating rounded panel anchored to the row you touched: it grows from your press point, its rows arrive 30 ms apart, and it retracts the same way when it closes.",
      },
      {
        type: "new",
        tr: "Uzun basarken satırın altında 500 ms'lik bir dolgu göstergesi ilerliyor: ne kadar tutman gerektiğini ve basışın nereye gittiğini gösterir.",
        en: "While you hold, a 500 ms fill indicator advances along the bottom of the row, showing how long to hold and where the press is heading.",
      },
      {
        type: "new",
        tr: "Menüden öğünü bugüne kopyalayabilir, seçim moduna alabilir ve tarif olarak kaydedebilirsin.",
        en: "From the menu you can copy a meal to today, add it to a selection, or save it as a recipe.",
      },
      {
        type: "fixed",
        tr: "Uzun basıp parmağını kaldırınca menü kendiliğinden bir aksiyon çalıştırmıyor ya da kapanmıyor (parmağın kalkışı menüye geçmiyor).",
        en: "Lifting your finger after a long press no longer triggers or dismisses the menu by itself (the release doesn't leak into the menu).",
      },
      {
        type: "fixed",
        tr: "Menü açıkken arkadaki sayfa hiç kaymıyor; kaydırma denemeleri menü kapanana kadar yutulur.",
        en: "While the menu is open the page behind cannot scroll; scroll attempts are swallowed until it closes.",
      },
      {
        type: "fixed",
        tr: "Kaydedilmiş şablonlar Bugün sekmesinde yeniden görünüyor (tek dokunuşla ekleme çipleri).",
        en: "Saved templates are visible again on the Today tab as one-tap add chips.",
      },
      {
        type: "improved",
        tr: '"Şablon olarak kaydet" ve "Tarif olarak kaydet (100 g)" artık ne yaptıklarını söylüyor: şablon öğünü tek dokunuşla geri getirir, tarif hafızada 100 g\'ı üzerinden hesaplanan yeni bir besin yaratır.',
        en: '"Save as a template" and "Save as a recipe (100 g)" now say what they do: a template brings the meal back with one tap, a recipe creates a new food in memory measured per 100 g.',
      },
      {
        type: "improved",
        tr: "Menü klavyeyle de tam kullanılabiliyor: Tab panelin içinde kalır, Escape kapatır ve kapanınca odak menüyü açtığın satıra geri döner.",
        en: "The menu is fully keyboard-usable: Tab stays inside the panel, Escape closes it, and focus returns to the row you opened it from.",
      },
      {
        type: "fixed",
        tr: "Menüdeki satırlar (sil, düzenle, şablon kaydet) artık çıkış animasyonunu beklemeden kapanmıyor; bekleme süresi kısaltıldı ve hareket her aksiyonda aynı.",
        en: "Menu rows (delete, edit, save as template) no longer drop the panel without its exit motion; the wait is shorter and every action now moves the same way.",
      },
      {
        type: "fixed",
        tr: "Tam ekran pencerelerde (öğün ekle/düzenle, besin ekle, tarif, besin detayı, ilk kurulum) klavye kullanırken Tab artık pencerenin dışına kaçmıyor, Escape kapatıyor ve kapanınca odak açtığın yere dönüyor.",
        en: "In full-screen sheets (add/edit meal, add food, recipe, nutrition detail, onboarding) Tab no longer escapes the window, Escape closes it, and focus returns to where you opened it.",
      },
    ],
    dev: [
      "lib/mealActions.ts (saf): mealToTemplate, duplicatePayload, buildRecipePreset, canSaveAsRecipe, mealMenuActions, mealSheetReducer.",
      "Uzun basma: lib/longPress.ts + hooks/useLongPress.ts; usePressSpring handler'lari ile birlestirildi, sentetik click yutulur, `holding` dolgu gostergesini besler.",
      "Basış kapısı (lib/pressGate.ts + hooks/usePressGate.ts): iki fazlı (basili: zaman asimi yok / birakildi: 400 ms click penceresi); capture asamasinda click yutulur, `data-gated` hover/active'i sondurur. Sizinti uretim derlemesinde olculdu (click perdeye dusuyordu).",
      "lib/anchor.ts (saf): placeAnchoredPanel — alt/ust secimi, kenar kisitlari, transform-origin basis noktasindan; MealActionSheet artik paylasilan Modal'i degil kendi yuvarlak panelini kullaniyor (portal + FAB malzeme dili).",
      "Arka plan kilidi: onTouchMove preventDefault React 17+ (passive) yuzunden ETKISIZDI — wheel/touchmove icin pasif olmayan pencere dinleyicisi eklendi; panelin kendi govdesi muaf.",
      "Animasyon: index.css .menu-panel-in/out, .menu-item-in (30 ms stagger), .menu-step-in, .hold-fill — iki temada da calisir (velvet dahil).",
      "Sablon cipleri enableScan'den ayrildi (o bayrak artik hic true gecmiyordu — cipsler ölüydü); HistoryPage showTemplates={false}.",
      "Menu → MealForm/RecipeBuilder gecisi afterHistoryBackSettles ile sarili (zombi gecmis girdisi yok).",
      "updateConfig cevrimdisi kuyruga girmedigi icin 'Sablona ekle' offline'da pasif; sil/cogalt kuyruga girer.",
      "Inceleme sertlestirmesi: useLongPress onPointerLeave + pencere seviyesinde pointerup emniyeti (capture kaybolsa da jest sonlanir); clearClickSuppression artik gercekten donuyor (tipcheck kirikti).",
      "Simetrik cikis TEK yoldan yonetiliyor: MealActionSheet.closeThen(cikis animasyonu → aksiyon) — sil/sablon/cogalt/duzenle/sec/tarif yollarinin HEPSI ayni hareketi izler; unmount'ta cikis zamanlayicisi temizlenir.",
      "aria-modal iddiasi karsilandi: Tab tuzagi + kapanista odak iadesi (Modal.tsx deseni). menu-panel-out artik girisin baslangic degerine (scale 0.92) doner.",
      "anchor: kenar bosluklari yalnizca sigdiginda uygulanir (cok dar WebView'da tasma yok); kullanilmayan PANEL_MIN_WIDTH kaldirildi.",
      "Diyalog odak yonetimi tek kaynakta: lib/focusTrap.ts (saf: FOCUSABLE_SELECTOR, nextTrapIndex, acik diyalog yigini) + hooks/useDialogFocus.ts. Modal/ScanSheet/MealActionSheet'teki uc elle kopya teklesti; OnboardingModal ve dort data-modal tam-ekran sheet (MealForm, RecipeBuilder, AliasForm, NutritionSheet) ayni hook'a baglandi — aria-modal ilan edip tuzak kurmayan iddia kapandi.",
      "Ic ice diyaloglarda Escape artik tek katmani kapatir (kamera sheet'i icindeki onay karti + Modal ayni olayda ikisi birden kapaniyordu) — yigin tepesini lib/focusTrap.ts belirler.",
      "Olcumle bulunan iki hata: (1) kapsayici `visibility: hidden` iken focus() SESSIZCE basarisiz oluyordu (yerlesim olculmeden once odak cagriliyordu) — hook artik `ready` ile yeniden deniyor ve basariyi olcuyor; (2) odagi tasiyan efekt ayri bir efekte bolununce previouslyFocused artik panelin kendisi oluyordu ve kapanista odak BODY'ye donuyordu — yakalama ref'e alinip odak denemesinden ONCE yapiliyor.",
      "Menu cikis animasyonu 160 ms → 120 ms (MealActionSheet EXIT_MS + index.css menu-panel-out/menu-scrim-out birlikte): sil 159 ms, duzenle 166 ms (click→form), Escape 30 ms.",
    ],
  },
  {
    version: "0.29.0",
    date: "2026-09-08",
    summary: {
      tr: "Kayıtlı besinler için varsayılan birim seçebilirsin. Yeni öğünlerde yumurtayı adet, protein tozunu ölçek gibi kendi alışkanlığına uygun şekilde kullanmak artık daha hızlı.",
      en: "You can now choose a default unit for saved foods. New meals can start with the unit you actually use, such as pieces for eggs or scoops for protein powder.",
    },
    items: [
      {
        type: "new",
        tr: "Her kayıtlı besin için varsayılan birim belirleme desteği eklendi.",
        en: "Added support for choosing a default unit for each saved food.",
      },
      {
        type: "improved",
        tr: "Yeni öğünlerde varsayılan birimin porsiyon miktarı otomatik olarak doğru dönüştürülüyor.",
        en: "Default meal quantities are now automatically converted to the selected unit.",
      },
    ],
    dev: ["Alias defaultUnit alanı; g fallback'i ve özel birim serving dönüşümü."],
  },
  {
    version: "0.28.9",
    date: "2026-09-07",
    summary: {
      tr: "Güvenlik iyileştirmeleri yapıldı: beklenmedik hatalar artık detay sızdırmıyor, öğün ve besin kayıtlarında giriş doğrulaması güçlendirildi.",
      en: "Security improvements: unexpected errors no longer leak details, and stricter input validation was added for meal and food entries.",
    },
    items: [
      {
        type: "fixed",
        tr: "Beklenmedik hatalarda teknik detayların (iç klasör yolları vb.) ekrana düşmesi engellendi.",
        en: "Unexpected errors no longer expose technical details (such as internal file paths) on screen.",
      },
      {
        type: "fixed",
        tr: "Öğün ve besin kayıtlarında giriş doğrulaması güçlendirildi: geçersiz kayıtlar sunucuda reddediliyor.",
        en: "Input validation strengthened for meal and food entries: invalid records are now rejected on the server.",
      },
    ],
    dev: [
      "Beklenmedik 500'ler client'a genel mesaj döner (madde 13).",
      "server/meals.js izole modülü ile /api/day öğe doğrulaması (madde 6,25).",
    ],
  },
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
        tr: 'Uygulama içinden geri bildirim ve özellik isteği gönderebilirsin ("Özellik iste ve geri bildirim" bölümünde).',
        en: 'Send feedback and feature requests from inside the app (in the "Request a feature & feedback" section).',
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
