import { describe, expect, it } from "vitest";
import { classifyPopState, shouldExitOnSecondPress } from "./backStack";

// ============================================================================
// Bug: Ayarlar > Profil'den ya da Geçmiş > hafta/gün detayından geri tuşuyla
// çıkınca, alt-sayfa doğru kapanıyordu AMA App'in genel popstate dinleyicisi
// AYNI olayda "çıkmak için bir kez daha bas" toast'ını da tetikliyordu.
// classifyPopState artık bu iki senaryoyu ayırt ediyor — `hasActiveSubView`
// (canlı registry, bkz. subViewRegistry.ts) üzerinden, "bir önceki durum"
// tahmini YAPMADAN (o yaklaşım tarayıcıda yanlış çıkmıştı, bkz. backStack.ts
// başındaki not).
// ============================================================================
describe("classifyPopState", () => {
  it("modal'ın kendi ittiği duruma inince ignore döner (modal kendi dinleyicisinde kapanır)", () => {
    const decision = classifyPopState({
      newState: { isModal: true },
      hasOpenOverlay: false,
      hasActiveSubView: false,
    });
    expect(decision).toBe("ignore");
  });

  it("ekranda açık bir overlay varsa (FAB menüsü / modal) yeni durum ne olursa olsun ignore döner", () => {
    const decision = classifyPopState({
      newState: { isRoot: true },
      hasOpenOverlay: true,
      hasActiveSubView: false,
    });
    expect(decision).toBe("ignore");
  });

  it("bir alt-görünüme inilirken (ör. Ayarlar > Profil açılırken, registry henüz güncellenmemiş) settle döner", () => {
    const decision = classifyPopState({
      newState: { isRoot: undefined }, // {tab:"settings", subView:"profile"} — isRoot yok
      hasOpenOverlay: false,
      hasActiveSubView: false,
    });
    expect(decision).toBe("settle");
  });

  it("BUG: bir alt-görünümden (Ayarlar > Profil) köke YENİ çıkılırken (registry hâlâ aktif diyor) sahte çıkış toast'ı tetiklenmemeli — settle döner", () => {
    // App'in dinleyicisi SettingsSheet'inkinden ÖNCE çalışır: yeni durum zaten
    // kök (`isRoot:true`), ama SettingsSheet henüz `setSubView(null)`
    // çağırmadığı için registry hâlâ "aktif" diyor.
    const decision = classifyPopState({
      newState: { isRoot: true },
      hasOpenOverlay: false,
      hasActiveSubView: true,
    });
    expect(decision).toBe("settle");
  });

  it("Geçmiş > gün detayından haftaya, sonra haftadan köke çıkarken de HİÇBİR adımda toast tetiklenmemeli", () => {
    // 1) gün -> hafta: yeni durum kök değil, registry hâlâ aktif (hafta seçili).
    expect(
      classifyPopState({
        newState: { isRoot: undefined },
        hasOpenOverlay: false,
        hasActiveSubView: true,
      }),
    ).toBe("settle");

    // 2) hafta -> kök: yeni durum kök, registry hâlâ aktif (HistoryPage henüz
    //    setSelectedWeek(null) çağırmadı).
    expect(
      classifyPopState({
        newState: { isRoot: true },
        hasOpenOverlay: false,
        hasActiveSubView: true,
      }),
    ).toBe("settle");
  });

  it("kullanıcı GERÇEKTEN bir sekmenin çıplak kökündeyken (hiçbir overlay/alt-görünüm registry'de değilken) geri basarsa evaluate-exit döner", () => {
    const decision = classifyPopState({
      newState: { isRoot: true },
      hasOpenOverlay: false,
      hasActiveSubView: false,
    });
    expect(decision).toBe("evaluate-exit");
  });

  it("hiç durum yokken (yığının dibi) ve hiçbir registry aktif değilken evaluate-exit döner", () => {
    const decision = classifyPopState({
      newState: null,
      hasOpenOverlay: false,
      hasActiveSubView: false,
    });
    expect(decision).toBe("evaluate-exit");
  });
});

describe("shouldExitOnSecondPress", () => {
  it("2 saniye içindeki ikinci basışta true döner (çıkışa izin ver)", () => {
    expect(shouldExitOnSecondPress(1000, 1000 + 1999)).toBe(true);
  });

  it("tam 2 saniye ya da sonrasında false döner (yeni bir 'ilk basış' say)", () => {
    expect(shouldExitOnSecondPress(1000, 1000 + 2000)).toBe(false);
    expect(shouldExitOnSecondPress(1000, 1000 + 5000)).toBe(false);
  });
});
