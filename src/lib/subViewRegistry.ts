// ============================================================================
// Nutrimind — açık alt-görünüm (Ayarlar > Profil, Geçmiş > hafta/gün) kayıt defteri.
//
// İlk yaklaşım (App.tsx'te "bir önceki bilinen durumu" bir ref'te tutup
// karşılaştırmak) tarayıcıda YANLIŞ çıktı: SettingsSheet ve HistoryPage
// `window.history.pushState`'i DOĞRUDAN kendileri çağırıyor — bu çağrı hiçbir
// `popstate` doğurmadığı için App'in ref'i o pushState'ten HİÇ haberdar
// olmuyordu. Sonuç: Ayarlar > Profil'den geri çıkınca App hâlâ "en son
// bildiğim durum köktü" sanıp sahte "çıkmak için bir kez daha bas" toast'ını
// gösteriyordu.
//
// Doğru çözüm, `overlayLock.ts`'teki modal deseniyle AYNI: alt-görünümü
// sahiplenen bileşen (SettingsSheet/HistoryPage) "şu an bir alt-görünümdeyim"
// bilgisini CANLI bir sayaca yazar (`useSubViewRegistration`). App'in global
// `popstate` dinleyicisi bu bileşenlerin KENDİ dinleyicilerinden ÖNCE
// tetiklenir (ebeveyn önce mount olur → dinleyicisi önce kayıtlanır), yani App
// karar anında sayacı okuduğunda alt-görünüm henüz KAPANMAMIŞ olur — React
// state güncellemesi (ve dolayısıyla sayacın azalması) her zaman bir sonraki
// render'a kadar ertelenir. Bu da App'e "bu pop bir alt-görünümden mi
// çıkıyor" sorusunun DOĞRU ve anlık cevabını, hiçbir "önceki durum" tahmini
// gerekmeden verir.
//
// Bilerek `overlayLock.ts`'in body-scroll sayacından AYRI: alt-görünümler
// normal, kaydırılabilir gömülü içerik — scroll'u kilitlememeli.
// ============================================================================
import { applyLockAction } from "./overlayLock";

let activeCount = 0;

export function enterSubView(): void {
  activeCount = applyLockAction(activeCount, "acquire").count;
}

export function exitSubView(): void {
  activeCount = applyLockAction(activeCount, "release").count;
}

/** Şu an ekranda (Ayarlar > alt-sayfa, Geçmiş > hafta/gün gibi) en az bir
 *  gömülü alt-görünüm açık mı? */
export function hasActiveSubView(): boolean {
  return activeCount > 0;
}

/** Yalnızca testler için: modül-düzeyi sayaç durumunu sıfırlar. */
export function __resetSubViewRegistryForTests(): void {
  activeCount = 0;
}
