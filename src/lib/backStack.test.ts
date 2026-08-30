import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  afterHistoryBackSettles,
  classifyPopState,
  consumeProgrammaticBack,
  isModalEntryOnTop,
  isPoppedAfterModalPop,
  markProgrammaticBack,
  MODAL_ENTRY_TOKEN_KEY,
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

// ============================================================================
// Bug: "afterHistoryBackSettles" kör 50ms zaman aşımı — yavaş cihazda popstate
// 50ms'den SONRA geliyorsa geri çağrı ERKEN çalışıyor, yeni modal pushState
// yapıyor, aradaki gecikmiş back() de O YENİ girdiyi popluyordu ("zombi modal":
// React'te açık ama geçmişte girdisi yok — sonraki geri tuşu uygulamadan
// çıkarıyordu). Geri çağrı artık yalnızca back GERÇEKTEN işlendikten sonra
// (popstate olayı ya da bekleyen-sayaç sıfırlanması) çalışır.
// ============================================================================
describe("afterHistoryBackSettles", () => {
  let popstateListeners: Array<(e?: unknown) => void>;

  function firePopState() {
    for (const fn of [...popstateListeners]) fn({ tur: "popstate" });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetProgrammaticBacks();
    popstateListeners = [];
    // Node ortamında window yok — afterHistoryBackSettles'in kullandığı
    // dinleyici/zamanlayıcı API'lerini taklit eden minimal bir window kurulur.
    vi.stubGlobal("window", {
      addEventListener: (type: string, fn: (e?: unknown) => void) => {
        if (type === "popstate") popstateListeners.push(fn);
      },
      removeEventListener: (type: string, fn: (e?: unknown) => void) => {
        if (type === "popstate") {
          popstateListeners = popstateListeners.filter((f) => f !== fn);
        }
      },
      setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
      clearTimeout: (id?: unknown) => clearTimeout(id as number),
      setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms),
      clearInterval: (id?: unknown) => clearInterval(id as number),
    } as unknown as Window);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetProgrammaticBacks();
  });

  it("popstate geldiğinde geri çağrı olayla tetiklenir ve bir kez çalışır", () => {
    const cb = vi.fn();
    afterHistoryBackSettles(cb);
    firePopState();
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000); // üst sınır ikinci kez tetiklemez
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("YAVAŞ CİHAZ (eski 50ms bug'ı): back() hâlâ işlenmemişken geri çağrı 100ms/600ms'de ÇALIŞMAZ — popstate gelince çalışır", () => {
    const cb = vi.fn();
    markProgrammaticBack(); // FAB menüsünün temizliği: mark + back() (async)
    afterHistoryBackSettles(cb);
    vi.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled(); // eski kod burada açardı → zombi
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
    // back() nihayet işlendi: popstate düşer, App'in globali sayacı tüketir.
    const evt = { tur: "popstate" };
    consumeProgrammaticBack(evt);
    firePopState();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("temizlik (mark) geç çalışırsa da bekler — sayaç ilk başta 0 görünse bile erken açılmaz", () => {
    const cb = vi.fn();
    afterHistoryBackSettles(cb);
    vi.advanceTimersByTime(50); // mark henüz yok (React pasif efekt gecikmesi)
    expect(cb).not.toHaveBeenCalled(); // erken açılmak zombi yaratırdı
    markProgrammaticBack(); // temizlik çalıştı, back() kuyrukta
    vi.advanceTimersByTime(40);
    expect(cb).not.toHaveBeenCalled(); // back hâlâ işlenmedi
    const evt = { tur: "popstate" };
    consumeProgrammaticBack(evt);
    firePopState();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("popstate hiç gelmezse üst sınır (emniyet ağı) tetiklenir — sonsuza dek beklemez", () => {
    const cb = vi.fn();
    afterHistoryBackSettles(cb);
    vi.advanceTimersByTime(2100);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Bug: önizlemenin (kamera karesi onay ekranının "P" girdisinin) geri/X ile
// kapatılması modalın KENDİ girdisini (M1) zehirliyordu: P poplanırken
// isPopped true yapılıyor, sonraki X-kapanışı back()'i atlayınca M1 yığında
// kalıyordu ("leftover history girdisi" — sonraki geri tuşu beklenmedik çıkış
// uyarısını tetikliyordu). Token ile "poplanan girdi bizimki mi, çocuk mu"
// ayrımı yapılıyor; çocuk popu isPopped'u DEĞİŞTİRMİYOR.
// ============================================================================
describe("modal girdisi token'ı (leftover düzeltmesi)", () => {
  it("isModalEntryOnTop: bizim token'ımız üstteyse poplanan girdi bir çocuktu", () => {
    expect(
      isModalEntryOnTop({ isModal: true, [MODAL_ENTRY_TOKEN_KEY]: "m-1" }, "m-1"),
    ).toBe(true);
  });

  it("isModalEntryOnTop: kök, başka token ya da boş üstteyse bizim girdimiz poplanmıştır", () => {
    expect(isModalEntryOnTop({ tab: "daily", isRoot: true }, "m-1")).toBe(false);
    expect(isModalEntryOnTop({ isModal: true, [MODAL_ENTRY_TOKEN_KEY]: "m-2" }, "m-1")).toBe(false);
    expect(isModalEntryOnTop(null, "m-1")).toBe(false);
    expect(isModalEntryOnTop(undefined, "m-1")).toBe(false);
  });

  it("BUG: P poplandığında isPopped DEĞİŞMEZ — sonraki X-kapanışı M1'i hâlâ back() ile söker", () => {
    const token = "m-1";
    // P (çocuk girdi) poplandı; üstte hâlâ bizim girdimiz M1 duruyor.
    const yeniIsPopped = isPoppedAfterModalPop(
      { isModal: true, [MODAL_ENTRY_TOKEN_KEY]: token },
      token,
      false,
    );
    expect(yeniIsPopped).toBe(false);
    // Sonuç: X-kapanışı isPopped=false gördüğü için back() çağırır → M1 yığından
    // sökülür; artık girdi kalmaz. Eski kod isPopped=true yapıyor, X back()'i
    // atlıyor ve M1 yığında kalıyordu.
  });

  it("bizim girdimiz poplandığında isPopped true olur (kapanış sayılır)", () => {
    expect(isPoppedAfterModalPop({ tab: "daily", isRoot: true }, "m-1", false)).toBe(true);
    expect(isPoppedAfterModalPop(null, "m-1", false)).toBe(true);
    // Altımızda başka bir modal girdisi olsa bile (iç içe modal) bizimki
    // poplanmıştır → kapanış sayılır.
    expect(
      isPoppedAfterModalPop({ isModal: true, [MODAL_ENTRY_TOKEN_KEY]: "m-0" }, "m-1", false),
    ).toBe(true);
  });

  it("çocuk popu sırasında isPopped zaten true ise true kalır", () => {
    const token = "m-1";
    expect(
      isPoppedAfterModalPop({ isModal: true, [MODAL_ENTRY_TOKEN_KEY]: token }, token, true),
    ).toBe(true);
  });
});
