// ============================================================================
// Nutrimind — App.tsx'in Android geri tuşu / `popstate` yönlendirme kararı.
//
// Önceki hata: App'in global `popstate` dinleyicisi HER popstate'i "kullanıcı
// az önce bir sekmenin köküne indi, çıkış uyarısı göster" sanıyordu — Ayarlar
// > Profil'den ya da Geçmiş > hafta/gün detayından geri çıkarken bile. Alt
// görünümü kapatan bileşen (SettingsSheet, HistoryPage) kendi `popstate`
// dinleyicisinde doğru şeyi yapıyordu (alt-sayfayı kapatıyordu), ama App'in
// dinleyicisi AYNI olayda sahte bir "çıkmak için bir kez daha bas" toast'ı da
// tetikliyordu.
//
// İLK deneme (bir önceki bilinen durumu App içinde bir ref'te tutup
// karşılaştırmak) tarayıcıda YANLIŞ çıktı: SettingsSheet/HistoryPage
// `pushState`'i doğrudan kendileri çağırıyor, bu hiçbir `popstate` doğurmuyor,
// dolayısıyla App'in ref'i o geçişten HİÇ haberdar olmuyordu. Doğru çözüm,
// modallardaki `hasOpenOverlay` deseniyle AYNI: alt-görünümü sahiplenen
// bileşen "şu an açığım" bilgisini CANLI bir sayaca yazar
// (`useSubViewRegistration`, bkz. `../lib/subViewRegistry`). App'in dinleyicisi
// alt-görünüm sahibinin KENDİ dinleyicisinden ÖNCE tetiklendiği için (ebeveyn
// önce mount olur → önce kayıtlanır), karar anında bu sayaç HENÜZ
// azalmamıştır — App'e "geçmiş durum" tahmini gerekmeden doğru cevabı verir.
//
// `classifyPopState` bu kararı saf hale getirir: DOM'a ya da React state'ine
// dokunmadan, yalnızca (yeni durum, açık overlay var mı, açık alt-görünüm var
// mı) alıp App'in ne yapması gerektiğini söyler.
// ============================================================================

export interface BackStackState {
  /** Yalnızca bir sekmenin ÇIPLAK kökünde (alt-görünüm/modal yokken) true. */
  isRoot?: boolean;
  /** Modal.tsx / diğer tam-ekran modal bileşenlerinin ittiği durumlarda true. */
  isModal?: boolean;
}

export type PopStateDecision =
  /** Bir overlay (modal, FAB menüsü) zaten kendi dinleyicisinde ele alıyor — hiçbir şey yapma. */
  | "ignore"
  /** Kök olmayan bir duruma inildi/kalındı YA DA bir alt-görünümden yeni
   *  çıkıldı — iz sürmeye devam et, çıkış mantığını TETİKLEME. */
  | "settle"
  /** Kullanıcı gerçekten bir sekmenin çıplak kökündeyken geri bastı —
   *  çift-basma çıkış mantığını çalıştır. */
  | "evaluate-exit";

export function classifyPopState(params: {
  newState: BackStackState | null | undefined;
  hasOpenOverlay: boolean;
  hasActiveSubView: boolean;
}): PopStateDecision {
  const { newState, hasOpenOverlay, hasActiveSubView } = params;

  // Modal'ın kendi ittiği durum ya da ekranda açık bir overlay (scroll kilidi
  // sayacı > 0) varsa: o bileşen zaten kendi dinleyicisinde kapanışı yönetir.
  if (newState?.isModal || hasOpenOverlay) {
    return "ignore";
  }

  // Bu popstate anında bir alt-görünüm HÂLÂ kayıtlıysa (ya içine yeni
  // inildi/içeride kalınıyor, ya da ondan yeni çıkılıyor ama sahibi henüz
  // kendi dinleyicisinde kapatmadı): App'in yapacağı bir şey yok.
  if (hasActiveSubView) {
    return "settle";
  }

  // Yeni durum kök değilse (ör. registry henüz güncellenmemiş bir ilk
  // alt-görünüme iniş anı): yine de dokunma.
  if (newState && newState.isRoot !== true) {
    return "settle";
  }

  return "evaluate-exit";
}

/** Çift-basma-çık zaman penceresi kararı: son geri basıştan bu yana
 *  `windowMs` (varsayılan 2000ms) içindeyse ikinci basış sayılır, çıkışa
 *  izin verilmelidir (uygulama bu durumda ekstra bir şey YAPMAZ — browser'ın
 *  doğal geri gitmesine izin verilir). */
export function shouldExitOnSecondPress(
  lastBackPressAt: number,
  now: number,
  windowMs = 2000,
): boolean {
  return now - lastBackPressAt < windowMs;
}

// ---------------------------------------------------------------------------
// Programatik `history.back()` yutma sayacı — Modal ve ExerciseModal PAYLAŞIR.
//
// Bir overlay kapanırken temizliği `history.back()` çağırır. Bu asenkron bir
// `popstate` doğurur; overlay o sırada yeniden mount olduysa (React StrictMode
// dev'de her efekti mount→cleanup→mount olarak çalıştırır, ya da gerçek bir
// remount olur) bu olay YENİ dinleyiciye düşer ve overlay KENDİ KENDİNİ
// kapatır. Tarayıcı/kamera ekranı (`ScanSheet` → `Modal`) tam olarak böyle
// bozulmuştu: kamera açılır açılmaz sheet kapanıyordu.
//
// Sayaç (boolean DEĞİL): üst üste iki temizlik iki `back()` doğurursa ikisi de
// yutulmalı; boolean olsaydı bayrak takılı kalıp kullanıcının GERÇEK geri
// basışını yerdi.
// ---------------------------------------------------------------------------

let pendingProgrammaticBacks = 0;

/** Temizlikte `history.back()` çağırmadan HEMEN ÖNCE çağır. */
export function markProgrammaticBack(): void {
  pendingProgrammaticBacks += 1;
}

/** `popstate` dinleyicisinin ilk satırı. `true` dönerse olay bizim kendi
 *  `back()`'imizden geliyordur — kapatma sayma, dokunma. */
export function consumeProgrammaticBack(): boolean {
  if (pendingProgrammaticBacks > 0) {
    pendingProgrammaticBacks -= 1;
    return true;
  }
  return false;
}

/** Yalnızca testler için — modül düzeyi sayacı sıfırlar. */
export function resetProgrammaticBacks(): void {
  pendingProgrammaticBacks = 0;
}
