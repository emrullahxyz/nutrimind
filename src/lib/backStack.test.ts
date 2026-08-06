import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyPopState,
  consumeProgrammaticBack,
  markProgrammaticBack,
  resetProgrammaticBacks,
  shouldExitOnSecondPress,
} from "./backStack";

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

// ============================================================================
// Bug: FAB menüsünden "Yemek Taraması" seçilince tarayıcı ya hiç açılmıyor ya
// da açılırken "Uygulamadan çıkmak için bir kez daha geri basın" uyarısı
// çıkıyordu. Sebep: menünün temizliğindeki `history.back()` asenkron bir
// popstate doğuruyor ve bunu AYNI ANDA iki dinleyici görüyor — App'in globali
// (önce) ve yeni açılan modalınki (sonra). Sayaç tek tüketimliydi, dolayısıyla
// yalnızca biri korunabiliyordu.
// ============================================================================
describe("programatik back sayacı", () => {
  beforeEach(() => resetProgrammaticBacks());

  it("işaretlenmemiş bir olay programatik sayılmaz", () => {
    expect(consumeProgrammaticBack({})).toBe(false);
  });

  it("aynı olay için birden çok dinleyici de true alır, sayaç bir kez düşer", () => {
    const olay = { tur: "popstate" };
    markProgrammaticBack();

    expect(consumeProgrammaticBack(olay)).toBe(true); // App'in globali
    expect(consumeProgrammaticBack(olay)).toBe(true); // modalın kendi dinleyicisi
    expect(consumeProgrammaticBack(olay)).toBe(true); // fazladan bir dinleyici de olsa

    // Sayaç yalnızca bir kez düştüğü için BAŞKA bir olay artık korunmaz.
    expect(consumeProgrammaticBack({ tur: "baska" })).toBe(false);
  });

  it("iki ayrı programatik back, iki ayrı olayı korur", () => {
    const a = { n: 1 };
    const b = { n: 2 };
    markProgrammaticBack();
    markProgrammaticBack();
    expect(consumeProgrammaticBack(a)).toBe(true);
    expect(consumeProgrammaticBack(b)).toBe(true);
    expect(consumeProgrammaticBack({ n: 3 })).toBe(false);
  });

  it("App her popstate'te sorduğu için sayaç birikmez (tüketecek modal olmasa bile)", () => {
    markProgrammaticBack();
    // Modal yok; yalnızca App sordu.
    expect(consumeProgrammaticBack({ n: 1 })).toBe(true);
    // Kullanıcının GERÇEK geri basışı artık yutulmamalı.
    expect(consumeProgrammaticBack({ n: 2 })).toBe(false);
  });

  it("olaysız çağrı eski davranışı korur (geriye dönük çağrılar)", () => {
    markProgrammaticBack();
    expect(consumeProgrammaticBack()).toBe(true);
    expect(consumeProgrammaticBack()).toBe(false);
  });
});

describe("classifyPopState — programatik back", () => {
  it("kendi temizliğimizden doğan popstate çıkış mantığını TETİKLEMEZ", () => {
    // Bu bileşim düzeltmeden önce "evaluate-exit" dönüyordu: FAB menüsü
    // kapandığı için overlay yok, durum kök — yani sahte çıkış uyarısı.
    expect(
      classifyPopState({
        newState: { isRoot: true },
        hasOpenOverlay: false,
        hasActiveSubView: false,
        isProgrammaticBack: true,
      }),
    ).toBe("ignore");
  });

  it("gerçek kullanıcı basışında (programatik değil) çıkış mantığı çalışır", () => {
    expect(
      classifyPopState({
        newState: { isRoot: true },
        hasOpenOverlay: false,
        hasActiveSubView: false,
        isProgrammaticBack: false,
      }),
    ).toBe("evaluate-exit");
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
