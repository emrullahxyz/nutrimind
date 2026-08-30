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
  /** Bu `popstate` bir bileşenin kendi temizliğindeki `back()`'inden mi doğdu? */
  isProgrammaticBack?: boolean;
}): PopStateDecision {
  const { newState, hasOpenOverlay, hasActiveSubView, isProgrammaticBack } = params;

  // Kendi ürettiğimiz geri gidiş: kullanıcının niyeti değil, temizlik artığı.
  // Bunu "kullanıcı kökte geri bastı" sanmak sahte çıkış uyarısını doğuruyordu
  // (FAB menüsünden bir öğe seçince ya da menüyü dışarı tıklayıp kapatınca).
  if (isProgrammaticBack) {
    return "ignore";
  }

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
// Programatik `history.back()` yutma sayacı — Modal, ExerciseModal ve BottomNav'ın
// FAB menüsü PAYLAŞIR. Temizliğinde `history.back()` çağıran HER bileşen bunu
// çağırmak zorunda; BottomNav bir süre çağırmıyordu ve FAB'dan açılan modallar
// açılır açılmaz kapanıyordu (bkz. o dosyadaki not).
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
/** Programatik olduğu SAPTANMIŞ son olay. Aynı `popstate`'i birden çok dinleyici
 *  görür (App'in globali + o an açık modal); hepsi aynı cevabı almalı ama sayaç
 *  yalnızca BİR kez düşmeli. */
let markedEvent: unknown = null;

/** Temizlikte `history.back()` çağırmadan HEMEN ÖNCE çağır. */
export function markProgrammaticBack(): void {
  pendingProgrammaticBacks += 1;
}

/**
 * `popstate` dinleyicisinin ilk satırı. `true` dönerse olay bizim kendi
 * `back()`'imizden geliyordur — kapatma sayma, çıkış mantığı çalıştırma.
 *
 * OLAYI GEÇ (`event`): aynı olay için tekrar sorulduğunda sayaç düşürülmeden
 * yine `true` döner. Buna ihtiyaç var çünkü App'in global dinleyicisi (önce
 * çalışır, çünkü ebeveyn önce mount olur) ile modalın kendi dinleyicisi AYNI
 * olayı görüyor. App katılmasaydı iki hata birden çıkardı:
 *   1. FAB menüsü kapanırken doğan `back()` App'e "kullanıcı kökte geri bastı"
 *      gibi görünüp sahte "uygulamadan çıkmak için tekrar bas" uyarısını
 *      tetikliyordu;
 *   2. ortada tüketecek bir modal yoksa sayaç birikip kullanıcının GERÇEK geri
 *      basışını yerdi.
 * App her `popstate`'te bunu çağırdığı için sayaç asla birikmez.
 */
export function consumeProgrammaticBack(event?: unknown): boolean {
  if (event !== undefined && event !== null && markedEvent === event) return true;
  if (pendingProgrammaticBacks > 0) {
    pendingProgrammaticBacks -= 1;
    if (event !== undefined && event !== null) markedEvent = event;
    return true;
  }
  return false;
}

/** Yalnızca testler için — modül düzeyi sayacı ve işaretli olayı sıfırlar. */
export function resetProgrammaticBacks(): void {
  markedEvent = null;
  pendingProgrammaticBacks = 0;
}

// ---------------------------------------------------------------------------
// Bir overlay'i (ör. FAB menüsü) kapatıp AYNI tıklamada yeni bir modal
// açarken kullanılır (`BottomNav`'ın FAB menüsü öğeleri gibi).
//
// Kapanan overlay'in temizliği `markProgrammaticBack()` + `history.back()`
// çağırıyor — bu ASENKRON. Yeni modal bunu beklemeden hemen `pushState`
// çağırırsa (React state güncellemesi + efekt aynı/bir sonraki tick'te
// senkron çalışabildiği için mümkün), tarayıcı `back()`'in hedefini ÇAĞRI
// ANINDAKİ konuma göre kaydediyor gibi davranıyor — aradaki yeni push'u
// ATLAYIP bir fazla geri gidiyor. Sonuç: yeni modal açık ama
// `window.history.state` zaten köke düşmüş oluyor; kullanıcı o modalı tek
// bir gerçek geri basışla kapattığında ARTIK hiçbir koruma kalmıyor — bir
// SONRAKİ geri basış (ya da hızlı ikinci bir basış) doğrudan uygulamadan
// çıkarıyor. Canlı tarayıcıda `pnpm preview` ile FAB → "Yemek Taraması" →
// geri → geri dizisiyle üretildi ve doğrulandı.
//
// Çözüm: yeni modalı açmadan önce, kapanan overlay'in `back()`'inin
// GERÇEKTEN ürettiği `popstate`'i bekle — tahmini bir gecikme (`setTimeout`)
// DEĞİL, olayın kendisi. `back()` hiç popstate üretmezse (ör. zaten kökteyse)
// takılı kalmamak için iki kademeli bir emniyet ağı var:
//   1. Bekleyen programatik back SAYACINI yokla: back işlendiğinde popstate
//      düşer ve App'in global dinleyicisi sayacı tüketir (0'a düşer). Sayaç
//      önce >0 GÖRÜLÜP sonra 0'a düşerse back GERÇEKTEN bitmiştir. "Sayaç 0
//      ama popstate gelmedi" (temizlik henüz yürümedi — React pasif efekti
//      çağrıdan sonra çalışır) bu sinyalle KARIŞTIRILMAMALI; o yüzden önce
//      >0 görmeden 0'a düşüşe güvenilmez.
//   2. Nihai zaman aşımı: sayaç hiç düşmezse (back poplayacak girdi bulamadı,
//      popstate üretmedi) sonsuza dek beklememek için bir üst sınır.
//
// ESKİ haldeki kör 50ms'lik `setTimeout` asıl yarışı kapatıyordu: yavaş
// cihazda popstate 50ms'den SONRA geliyorsa 50ms'de geri çağrı çalışıp yeni
// modal `pushState` yapıyor, aradaki gecikmiş `back()` de O YENİ girdiyi
// popluyordu → "zombi modal" (React'te açık, geçmişte girdisi yok). Artık
// geri çağrı yalnızca back GERÇEKTEN işlendikten sonra çalışır.
/** `setOpen(false)` gibi bir overlay-kapatma çağrısından HEMEN sonra, yeni bir
 *  modal açmadan ÖNCE çağır. */
export function afterHistoryBackSettles(callback: () => void): void {
  let done = false;
  let sawPendingBack = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", onPopState);
    window.clearInterval(pollId);
    window.clearTimeout(timeoutId);
    callback();
  };
  const onPopState = () => finish();
  window.addEventListener("popstate", onPopState);

  // Temizliğin `markProgrammaticBack()`'i (ve dolayısıyla `back()`) React
  // pasif efektinde — yani bu çağrıdan SONRA çalışabilir. Sayaç ilk tiklarda
  // bu yüzden hâlâ 0 olabilir; "0 gördüm, aç" demek zombi yarışını geri
  // getirirdi. Önce >0 GÖRMEDEN 0'a düşüşe güvenilmez (sawPendingBack).
  const pollId = window.setInterval(() => {
    if (pendingProgrammaticBacks > 0) sawPendingBack = true;
    if (sawPendingBack && pendingProgrammaticBacks === 0) finish();
  }, 16);

  // Sayaç hiç düşmezse (back poplayacak girdi bulamadı → popstate yok):
  // `pushState` güvenli çünkü ortada işlenecek bir navigasyon yok. Üst sınır
  // yalnızca sonsuz beklemeyi önler.
  const timeoutId = window.setTimeout(finish, 2000);
}

// ---------------------------------------------------------------------------
// Modal girdisi kimliği (`useModalHistory` tarafından kullanılır).
//
// Modal açılırken `pushState({ isModal: true, __nutriModalToken: <benzersiz> })`
// yapar. Üzerine itilen çocuk girdiler (ör. kamera önizlemesinin P'si, iç içe
// modallar) bu token'ı TAŞIMAZ. Bir `popstate` geldiğinde üstte hâlâ bizim
// token'ımız varsa poplanan girdi bizimki DEĞİLDİR (bir çocuk) — modal kendi
// girdisini kaybetmedi, kapanış sayılmamalı. Token olmadan bu ayrım yapılamaz:
// `{isModal:true}` şekli hem bizim girdimizle hem çocuk girdilerle aynıdır.
// ---------------------------------------------------------------------------
export const MODAL_ENTRY_TOKEN_KEY = "__nutriModalToken";

/** Poplanan girdiden SONRA yeni durumda bizim modal girdimiz hâlâ üstte mi?
 *  Evetse poplanan girdi bir çocuktu (ör. kamera önizlemesinin P'si) — bizim
 *  girdimiz yığında duruyor; bir sonraki kapanış onu `back()` ile sökmeli. */
export function isModalEntryOnTop(state: unknown, myToken: string): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[MODAL_ENTRY_TOKEN_KEY] === myToken
  );
}

/** `popstate` dinleyicisinde yeni `isPopped` değeri. Poplanan girdi bizim
 *  girdimiz DEĞİLSE (çocuk girdi) `isPopped` DEĞİŞMEZ — girdimiz hâlâ üstte,
 *  sonraki X-kapanışı back() ile sökmeli. Bizim girdimiz (ya da altımızdaki
 *  girdi) poplandıysa kapanış sayılır: `true`. */
export function isPoppedAfterModalPop(newState: unknown, myToken: string, wasPopped: boolean): boolean {
  return isModalEntryOnTop(newState, myToken) ? wasPopped : true;
}

/** Üstte herhangi bir modal girdisi (bizimki ya da üzerimize itilmiş bir çocuk)
 *  var mı? `window.history.state?.isModal` ile aynı test — `needsBack`'in
 *  girdisi. */
function isModalish(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { isModal?: boolean }).isModal === true
  );
}

let nextModalToken = 0;
function freshModalToken(): string {
  nextModalToken += 1;
  return "nutri-modal-" + nextModalToken;
}

// ---------------------------------------------------------------------------
// Tam-ekran modalın geçmiş yaşam döngüsü — `useModalHistory`'in framework'süz
// çekirdeği. Hook yalnızca ref'ler + window dinleyici kablosu olan ince bir
// adaptördür; TÜM kararlar (it, yut, geri sök) bu sınıftadır. Böylece her
// modal açılış yolunun geçmiş bütünlüğü (aç → geri/X ile kapat → artık girdi
// yok) sahte bir history üzerinden GERÇEK kodla test edilebilir.
// ---------------------------------------------------------------------------
export class ModalHistoryController {
  /** Bu örneğin benzersiz girdi kimliği — üzerine itilen çocuk girdiler (ör.
   *  kamera önizlemesinin P'si) taşımaz. */
  readonly token: string;
  /** Kullanıcı BİZİM girdimizi popladı mı? Çocuk popu bunu DEĞİŞTİRMEZ. */
  isPopped = false;

  constructor() {
    this.token = freshModalToken();
  }

  /** Modal açıldı: sayacı sıfırla, girdiyi it. `push` = window.history.pushState. */
  open(push: (state: Record<string, unknown>) => void): void {
    this.isPopped = false;
    push({ isModal: true, [MODAL_ENTRY_TOKEN_KEY]: this.token });
  }

  /** popstate dinleyicisi gövdesi. Programatik back ise yut: false döner
   *  (onClose ÇAĞRILMAZ). Değilse isPopped'u güncelle ve true dön: onClose
   *  çağrılmalı. */
  onPopState(newState: unknown, event?: unknown): boolean {
    if (consumeProgrammaticBack(event)) return false;
    this.isPopped = isPoppedAfterModalPop(newState, this.token, this.isPopped);
    return true;
  }

  /** Kapanışta (X/backdrop/Escape ya da unmount temizliği) `history.back()`
   *  gerekli mi? isPopped değilse ve üstte bir modal girdisi (bizimki ya da
   *  çocuk — ör. kamera önizlemesinin P'si) varsa evet: back() popstate'i
   *  tetikleyip onClose'a düşer. Değilse kapatma doğrudan onClose ile. */
  needsBack(currentState: unknown): boolean {
    return !this.isPopped && isModalish(currentState);
  }
}
