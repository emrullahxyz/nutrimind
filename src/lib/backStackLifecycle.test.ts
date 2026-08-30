// ============================================================================
// Geri-tusu gecmis butunlugu — TUM modal acilis yollari:
//   - FAB menusu: Egzersiz Kaydet / Besin Arama / Yemek Taramasi / Kayitli
//     Besinler (hepsi afterHistoryBackSettles ile sarili)
//   - Ogune ekle / duzenle (DayView): MealForm, NutritionSheet, ExerciseModal,
//     MergeModal — hepsi ayni useModalHistory sinifi
//   - Hafiza (AliasPage): ScanSheet "Barkod", AliasForm "Yeni Besin",
//     RecipeBuilder "Tarif"; kamera onizlemesinin cocuk girdisi (P)
//   - Ayarlar: alt gorunumler (pushState {tab,subView} + kendi popstate'i),
//     ic ice modal (hesap silme onayi; embedded GoalsForm modal itmez)
//   - Gecmis (HistoryPage): hafta/gun drill-down (pushState {tab,week,day} +
//     kendi popstate'i), gun detayi uzerinde ogun formu (modal)
//
// Tarayici yok: sahte bir history + App'in global popstate dinleyicisinin
// birebir taklidi uzerinden GERCEK karar kodlari surulur — ModalHistoryController
// (useModalHistory'in cekirdegi), classifyPopState, consumeProgrammaticBack,
// afterHistoryBackSettles, gercek overlayLock ve subViewRegistry sayaclari.
//
// BUTUNLUK DEGISMEZI: her acilis tam olarak BIR girdi iter; geri/X ile kapanis
// onu soker; kokte fazladan geri HICBIR popstate uretmez (artik girdi yok) ve
// hicbir adimda sahte "cikmak icin bir kez daha bas" toast'i tetiklenmez
// (overlay/alt-gorunum varken karar asla evaluate-exit olmaz).
// ============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  afterHistoryBackSettles,
  classifyPopState,
  consumeProgrammaticBack,
  isModalEntryOnTop,
  markProgrammaticBack,
  ModalHistoryController,
  resetProgrammaticBacks,
  type PopStateDecision,
} from "./backStack";
import {
  acquireOverlayLock,
  hasOpenOverlay,
  releaseOverlayLock,
  __resetOverlayLockForTests,
} from "./overlayLock";
import {
  enterSubView,
  exitSubView,
  hasActiveSubView,
  __resetSubViewRegistryForTests,
} from "./subViewRegistry";

// ---------------------------------------------------------------------------
// Sahte tarayici: history + window popstate dinleyicileri AYNI kayitta.
// back() sinron dagitir (tarayici gorevi siniri yerine determinizm); kokte
// (ilk girdide) no-op'tur — tipki gercek tarayicinin girdi poplayamamasi gibi.
// ---------------------------------------------------------------------------
interface PopEvent {
  state: unknown;
}
type PopListener = (e: PopEvent) => void;

class FakeHistory {
  entries: Array<{ state: Record<string, unknown> | null }> = [{ state: null }];
  index = 0;

  get state(): Record<string, unknown> | null {
    return this.entries[this.index]?.state ?? null;
  }

  pushState(state: Record<string, unknown>): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state });
    this.index += 1;
  }
  replaceState(state: Record<string, unknown>): void {
    this.entries[this.index] = { state };
  }
  back(): void {
    if (this.index <= 0) return;
    this.index -= 1;
    const evt: PopEvent = { state: this.state };
    for (const fn of [...popListeners]) fn(evt);
  }
}

// window'da kayitli popstate dinleyicileri (App globali + modallar + settle).
let popListeners: PopListener[] = [];
const fakeWindow = {
  addEventListener: (type: string, fn: PopListener) => {
    if (type === "popstate") popListeners.push(fn);
  },
  removeEventListener: (type: string, fn: PopListener) => {
    if (type === "popstate") popListeners = popListeners.filter((f) => f !== fn);
  },
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
  clearTimeout: (id?: unknown) => clearTimeout(id as number),
  setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms),
  clearInterval: (id?: unknown) => clearInterval(id as number),
};

// ---------------------------------------------------------------------------
// App'in global popstate dinleyicisinin birebir taklidi: HER olayda sayaci
// tuketir (consumeProgrammaticBack) ve classifyPopState ile karar verir.
// App ebeveyn olarak once mount oldugu icin dinleyicisi ILK kayitlanir.
// ---------------------------------------------------------------------------
function makeApp(rootState: Record<string, unknown>): { history: FakeHistory; appDecision: () => PopStateDecision } {
  const history = new FakeHistory();
  history.replaceState(rootState);
  let lastDecision: PopStateDecision = "settle";
  popListeners.push((e: PopEvent) => {
    lastDecision = classifyPopState({
      newState: e.state as { tab?: string; isRoot?: boolean; isModal?: boolean } | null,
      hasOpenOverlay: hasOpenOverlay(),
      hasActiveSubView: hasActiveSubView(),
      isProgrammaticBack: consumeProgrammaticBack(e),
    });
  });
  return { history, appDecision: () => lastDecision };
}

// ---------------------------------------------------------------------------
// useModalHistory'in kablosunun birebir taklidi (kararlar GERCEK controller'da).
// ---------------------------------------------------------------------------
interface MountedModal {
  ctl: ModalHistoryController;
  requestClose: () => void;
  unmount: () => void;
}
function mountModal(history: FakeHistory, onClose: () => void): MountedModal {
  acquireOverlayLock(); // Modal/useBodyScrollLock — App'in overlay karari icin
  const ctl = new ModalHistoryController();
  ctl.open((st) => history.pushState(st));
  const listener = (e: PopEvent) => {
    if (ctl.onPopState(history.state, e)) onClose();
  };
  popListeners.push(listener);
  return {
    ctl,
    requestClose: () => {
      // Modal X/backdrop/Escape → requestClose
      if (ctl.needsBack(history.state)) history.back();
      else onClose();
    },
    unmount: () => {
      popListeners = popListeners.filter((f) => f !== listener);
      releaseOverlayLock();
      if (ctl.needsBack(history.state)) {
        markProgrammaticBack();
        history.back();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// SettingsSheet'in alt-gorunum kablosu: openSubView → pushState {tab,subView}
// + kendi popstate dinleyicisi (state?.isModal ise dokunma) + subViewRegistry.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// HistoryPage'in hafta/gun drill-down kablosu: selectWeek/selectDay →
// pushState {tab:"history", week, day} + kendi popstate dinleyicisi
// (state?.isModal ise dokunma) + subViewRegistry (week/day varken aktif).
// ---------------------------------------------------------------------------
interface MountedHistory {
  selectedWeek: string | null;
  selectedDay: string | null;
  selectWeek: (week: string) => void;
  selectDay: (day: string) => void;
  goBack: () => void;
  unmount: () => void;
}
function mountHistory(history: FakeHistory): MountedHistory {
  let selectedWeek: string | null = null;
  let selectedDay: string | null = null;
  let registered = false;
  const setActive = (v: boolean) => {
    if (v === registered) return; // useSubViewRegistration: yalnizca DEGISIMDE
    registered = v;
    if (v) enterSubView();
    else exitSubView();
  };
  const listener = (e: PopEvent) => {
    const st = e.state as { isModal?: boolean; tab?: string; week?: string; day?: string | null } | null;
    if (st?.isModal) return; // modal girdisi poplandiysa dokunma
    if (st && st.tab === "history") {
      selectedWeek = st.week ?? null;
      selectedDay = st.day ?? null;
    } else {
      selectedWeek = null;
      selectedDay = null;
    }
    setActive(selectedWeek !== null || selectedDay !== null);
  };
  popListeners.push(listener);
  return {
    get selectedWeek() {
      return selectedWeek;
    },
    get selectedDay() {
      return selectedDay;
    },
    selectWeek(week: string) {
      history.pushState({ tab: "history", week, day: null });
      selectedWeek = week;
      selectedDay = null;
      setActive(true);
    },
    selectDay(day: string) {
      history.pushState({ tab: "history", week: selectedWeek, day });
      selectedDay = day;
      setActive(true);
    },
    goBack() {
      history.back();
    },
    unmount() {
      popListeners = popListeners.filter((f) => f !== listener);
      if (registered) exitSubView();
    },
  };
}

interface MountedSettings {
  subView: string | null;
  openSubView: (target: string) => void;
  goBack: () => void;
  unmount: () => void;
}
function mountSettings(history: FakeHistory): MountedSettings {
  let subView: string | null = null;
  const setSubView = (v: string | null) => {
    subView = v;
    if (v) enterSubView();
    else exitSubView();
  };
  const listener = (e: PopEvent) => {
    const st = e.state as { isModal?: boolean; tab?: string; subView?: string } | null;
    if (st?.isModal) return; // modal girdisi poplandiysa dokunma (SettingsSheet davranisi)
    if (st && st.tab === "settings") setSubView(st.subView ?? null);
    else if (!st || st.tab !== "settings") setSubView(null);
  };
  popListeners.push(listener);
  return {
    get subView() {
      return subView;
    },
    openSubView(target: string) {
      history.pushState({ tab: "settings", subView: target });
      setSubView(target);
    },
    goBack() {
      history.back();
    },
    unmount() {
      popListeners = popListeners.filter((f) => f !== listener);
      if (subView) exitSubView();
    },
  };
}

/** Butunluk degismezinin ozu: kokte fazladan geri HICBIR popstate uretmemeli. */
function expectNoLeftover(history: FakeHistory): void {
  let pops = 0;
  const probe = () => {
    pops += 1;
  };
  popListeners.push(probe);
  history.back();
  popListeners = popListeners.filter((f) => f !== probe);
  expect(pops).toBe(0);
}

const DAILY_ROOT = { tab: "daily", isRoot: true };
const SETTINGS_ROOT = { tab: "settings", isRoot: true };

beforeEach(() => {
  resetProgrammaticBacks();
  __resetOverlayLockForTests();
  __resetSubViewRegistryForTests();
  popListeners = [];
  vi.stubGlobal("window", fakeWindow);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetProgrammaticBacks();
  __resetOverlayLockForTests();
  __resetSubViewRegistryForTests();
  popListeners = [];
});

// ============================================================================
// 1) FAB menusu — menuden cikan her yol afterHistoryBackSettles ile sarili:
//    menunun back()'i islenmeden yeni modal/sekme acilmaz.
// ============================================================================
describe("FAB menusu yollari (afterHistoryBackSettles)", () => {
  it.each([
    ["Yemek Taramasi", "modal" as const],
    ["Besin Arama", "modal" as const],
    ["Egzersiz Kaydet", "modal" as const],
    ["Kayitli Besinler", "tab" as const],
  ])("FAB ogesi: %s — menu kapanisi ile yeni acilis arasinda girdi carpmasi yok", (_label, kind) => {
    const { history, appDecision } = makeApp(DAILY_ROOT);

    // FAB menusu acik (useModalHistory active:open)
    const menu = mountModal(history, () => undefined);
    expect(isModalEntryOnTop(history.state, menu.ctl.token)).toBe(true);

    // Oge tiklamasi: setOpen(false) → (pasif efekt) temizlik mark+back;
    // settle bittikten SONRA yeni modal/sekme acilir.
    let opened = false;
    let newModal: MountedModal | null = null;
    let newModalClosed = false;
    afterHistoryBackSettles(() => {
      opened = true;
      if (kind === "modal") {
        // gercek akista acilan modal (ScanSheet/MealForm/ExerciseModal) —
        // overlay kilidi de alinir; boylece App kapanis aninda "ignore" der.
        newModal = mountModal(history, () => {
          newModalClosed = true;
        });
      } else {
        history.replaceState({ tab: "aliases", isRoot: true });
      }
    });
    menu.unmount(); // temizlik: mark + back() → popstate sinron duser

    expect(opened).toBe(true); // settle tamamlandi — back islendi
    if (kind === "modal") {
      // Menunun girdisi poplandi; yeni modal kendi girdisiyle duruyor.
      expect(newModal).not.toBeNull();
      expect(isModalEntryOnTop(history.state, newModal!.ctl.token)).toBe(true);
    } else {
      // Sekte gecisi: ek girdi YOK (replaceState ile kok).
      expect(history.state).toEqual({ tab: "aliases", isRoot: true });
    }

    // Kullanici geri: yeni modal kapanir / sekmede kokteyiz.
    history.back();
    if (kind === "modal") {
      expect(newModalClosed).toBe(true);
      expect(history.state).toEqual(DAILY_ROOT);
      newModal!.unmount();
    } else {
      expect(history.state).toEqual({ tab: "aliases", isRoot: true });
    }
    expectNoLeftover(history);
    expect(appDecision()).not.toBe("evaluate-exit");
  });
});

// ============================================================================
// 2) Ogune ekle / duzenle (DayView) — MealForm, NutritionSheet, ExerciseModal,
//    MergeModal: hepsi ayni useModalHistory sinifi (ac → geri/X → kok).
// ============================================================================
describe("Ogune ekle / duzenle yollari (DayView)", () => {
  it("MealForm (oge ekle): ac → geri ile kapanir; artık girdi yok", () => {
    const { history, appDecision } = makeApp(DAILY_ROOT);
    let closed = false;
    const meal = mountModal(history, () => {
      closed = true;
    });
    expect(isModalEntryOnTop(history.state, meal.ctl.token)).toBe(true);

    history.back(); // donanim geri tusu
    expect(closed).toBe(true);
    expect(history.state).toEqual(DAILY_ROOT);
    meal.unmount();
    expectNoLeftover(history);
    expect(appDecision()).not.toBe("evaluate-exit");
  });

  it("MealForm X ile kapanir: girdiyi back() ile soker, kokte artık girdi kalmaz", () => {
    const { history } = makeApp(DAILY_ROOT);
    let closed = false;
    const meal = mountModal(history, () => {
      closed = true;
    });
    meal.requestClose(); // X
    expect(closed).toBe(true);
    expect(history.state).toEqual(DAILY_ROOT);
    meal.unmount();
    expectNoLeftover(history);
  });

  it("ExerciseModal/NutritionSheet gibi kosullu modal: once kapali (girdi yok), sonra acilir", () => {
    const { history } = makeApp(DAILY_ROOT);
    // active=false iken girdi ITILMEZ (ExerciseModal isOpen=false hali)
    const ctlKapali = new ModalHistoryController();
    expect(ctlKapali.needsBack(history.state)).toBe(false);

    let closed = false;
    const exercise = mountModal(history, () => {
      closed = true;
    });
    expect((history.state ?? {}).isModal).toBe(true);
    history.back();
    expect(closed).toBe(true);
    exercise.unmount();
    expectNoLeftover(history);
  });
});

// ============================================================================
// 3) Hafiza (AliasPage) — ScanSheet "Barkod", AliasForm "Yeni Besin",
//    RecipeBuilder "Tarif": dogrudan Modal mount (settle yok).
// ============================================================================
describe("Hafiza yollari (AliasPage)", () => {
  it("ScanSheet (Barkod): ac → geri → kok; artık girdi yok", () => {
    const { history } = makeApp(DAILY_ROOT);
    let closed = false;
    const scan = mountModal(history, () => {
      closed = true;
    });
    history.back();
    expect(closed).toBe(true);
    scan.unmount();
    expectNoLeftover(history);
  });

  it("AliasForm (Yeni Besin): X ile kapanir, kokte artık girdi yok", () => {
    const { history } = makeApp(DAILY_ROOT);
    let closed = false;
    const alias = mountModal(history, () => {
      closed = true;
    });
    alias.requestClose();
    expect(closed).toBe(true);
    alias.unmount();
    expectNoLeftover(history);
  });

  it("Kamera onizlemesi (cocuk girdi P): geri → P poplanir, modal girdisi M1 saglam kalir; X → M1 de soker", () => {
    const { history } = makeApp(DAILY_ROOT);
    let previewOpen = false;
    let scanClosed = false;
    const scan = mountModal(history, () => {
      // ScanSheet.handleModalClose: onizleme acikken sadece onizlemeyi kapatir
      if (previewOpen) previewOpen = false;
      else scanClosed = true;
    });
    expect(isModalEntryOnTop(history.state, scan.ctl.token)).toBe(true);

    // Deklansor: P girdisi (ScanSheet dogrudan itiyor, controller YOK)
    history.pushState({ isModal: true, preview: true, title: "Kamera / Tara" });
    previewOpen = true;
    expect((history.state ?? {}).preview).toBe(true);

    // Geri #1: P poplanir → onizleme kapanir, modal ACIK, isPopped zehirlenmez
    history.back();
    expect(previewOpen).toBe(false);
    expect(scanClosed).toBe(false);
    expect(isModalEntryOnTop(history.state, scan.ctl.token)).toBe(true);
    expect(scan.ctl.isPopped).toBe(false); // v0.28.3 duzeltmesi

    // X: requestClose → M1'i back() ile soker (leftover yok)
    scan.requestClose();
    expect(scanClosed).toBe(true);
    expect(history.state).toEqual(DAILY_ROOT);
    scan.unmount();
    expectNoLeftover(history);
  });
});

// ============================================================================
// 4) Ayarlar alt gorunumleri (SettingsSheet) — pushState {tab,subView} + kendi
//    popstate dinleyicisi; ic ice modallar (GoalsForm, hesap silme onayi).
// ============================================================================
describe("Ayarlar alt gorunumleri (SettingsSheet)", () => {
  it("Profil alt gorunumu: ac → geri → kok; SAHTE cikis toast'i YOK (settle)", () => {
    const { history, appDecision } = makeApp(SETTINGS_ROOT);
    const settings = mountSettings(history);
    settings.openSubView("profile");
    expect(history.state).toEqual({ tab: "settings", subView: "profile" });
    expect(settings.subView).toBe("profile");

    history.back(); // alt gorunum poplanir
    expect(settings.subView).toBeNull();
    // App'in dinleyicisi SettingsSheet'inkinden ONCE calistigi icin registry
    // hala aktif → karar "settle" (toast YOK). Bu, documented bug fix'i.
    expect(appDecision()).toBe("settle");
    settings.unmount();

    // Kokteyiz: artik geri gercek cikis karari verir (evaluate-exit).
    expect(
      classifyPopState({ newState: SETTINGS_ROOT, hasOpenOverlay: false, hasActiveSubView: false }),
    ).toBe("evaluate-exit");
  });

  it("Ic ice modal + goBack zinciri (saglamlik): tek geri hem modal girdisini hem alt-gorunumu kapatir, zincir kokte biter", () => {
    const { history, appDecision } = makeApp(SETTINGS_ROOT);
    const settings = mountSettings(history);
    settings.openSubView("goals"); // S girdisi

    let goalsClosed = false;
    const goals = mountModal(history, () => {
      goalsClosed = true;
      settings.goBack(); // onClose=goBack deseni → alt-gorunum de poplanir
    });
    expect(isModalEntryOnTop(history.state, goals.ctl.token)).toBe(true);

    history.back(); // kullanici geri #1
    expect(goalsClosed).toBe(true);
    expect(settings.subView).toBeNull();
    expect(appDecision()).not.toBe("evaluate-exit"); // hicbir adimda sahte toast yok
    goals.unmount();
    settings.unmount();
    expectNoLeftover(history);
  });

  it("Hesap silme onayi (ic ice modal, alt-gorunum YOK): geri → sadece modal kapanir", () => {
    const { history, appDecision } = makeApp(SETTINGS_ROOT);
    const settings = mountSettings(history);
    let closed = false;
    const del = mountModal(history, () => {
      closed = true;
    });
    history.back();
    expect(closed).toBe(true);
    expect(settings.subView).toBeNull();
    del.unmount();
    settings.unmount();
    expectNoLeftover(history);
    expect(appDecision()).not.toBe("evaluate-exit");
  });
});

// ============================================================================
// 4b) Gecmis (HistoryPage) — hafta/gun drill-down: pushState {tab,week,day} +
//     kendi popstate dinleyicisi + subViewRegistry. Geri adim adim cikar
//     (gun → hafta → kok) ve hicbir adimda sahte cikis toast'i yok.
// ============================================================================
describe("Gecmis alt gorunumleri (HistoryPage)", () => {
  const HISTORY_ROOT = { tab: "history", isRoot: true };

  it("hafta drill-down: ac → geri → kok; SAHTE cikis toast'i YOK (settle)", () => {
    const { history, appDecision } = makeApp(HISTORY_ROOT);
    const hist = mountHistory(history);
    hist.selectWeek("2026-08-24");
    expect(history.state).toEqual({ tab: "history", week: "2026-08-24", day: null });
    expect(hist.selectedWeek).toBe("2026-08-24");

    history.back(); // hafta poplanir
    expect(hist.selectedWeek).toBeNull();
    // App'in dinleyicisi HistoryPage'inkinden ONCE calistigi icin registry
    // hala aktif → karar "settle" (toast YOK).
    expect(appDecision()).toBe("settle");
    hist.unmount();

    expect(
      classifyPopState({ newState: HISTORY_ROOT, hasOpenOverlay: false, hasActiveSubView: false }),
    ).toBe("evaluate-exit");
  });

  it("hafta → gun drill-down: geri ADIM ADIM cikar (gun → hafta → kok), hicbir adimda toast yok", () => {
    const { history, appDecision } = makeApp(HISTORY_ROOT);
    const hist = mountHistory(history);
    hist.selectWeek("2026-08-24");
    hist.selectDay("2026-08-27");
    expect(history.state).toEqual({ tab: "history", week: "2026-08-24", day: "2026-08-27" });
    expect(hist.selectedDay).toBe("2026-08-27");

    history.back(); // gun → hafta
    expect(hist.selectedDay).toBeNull();
    expect(hist.selectedWeek).toBe("2026-08-24");
    expect(history.state).toEqual({ tab: "history", week: "2026-08-24", day: null });
    expect(appDecision()).toBe("settle");

    history.back(); // hafta → kok
    expect(hist.selectedWeek).toBeNull();
    expect(history.state).toEqual(HISTORY_ROOT);
    expect(appDecision()).toBe("settle");
    hist.unmount();
    expectNoLeftover(history);
  });

  it("gun detayinda ogun formu (alt-gorunum uzerinde modal): geri once formu, sonra kademe kademe cikar", () => {
    const { history, appDecision } = makeApp(HISTORY_ROOT);
    const hist = mountHistory(history);
    hist.selectWeek("2026-08-24");
    hist.selectDay("2026-08-27");

    // Gun detayindaki DayView'in MealForm'u — alt-gorunum uzerinde bir modal.
    let mealClosed = false;
    const meal = mountModal(history, () => {
      mealClosed = true;
    });
    expect(isModalEntryOnTop(history.state, meal.ctl.token)).toBe(true);

    history.back(); // geri #1: form kapanir, gun detayi DURUR
    expect(mealClosed).toBe(true);
    expect(hist.selectedDay).toBe("2026-08-27");
    expect(appDecision()).not.toBe("evaluate-exit");
    meal.unmount();

    history.back(); // gun → hafta
    expect(hist.selectedDay).toBeNull();
    expect(hist.selectedWeek).toBe("2026-08-24");
    history.back(); // hafta → kok
    expect(hist.selectedWeek).toBeNull();
    expect(history.state).toEqual(HISTORY_ROOT);
    hist.unmount();
    expectNoLeftover(history);
    expect(appDecision()).not.toBe("evaluate-exit");
  });
});

// ============================================================================
// 5) Kok davranisi: overlay yokken geri → evaluate-exit (cikis uyarisi);
//    overlay acikken geri → ignore (overlay kendisi kapanir).
// ============================================================================
describe("Kok davranisi", () => {
  it("ciplak kokte geri → evaluate-exit (cikis uyarisi)", () => {
    expect(
      classifyPopState({ newState: DAILY_ROOT, hasOpenOverlay: false, hasActiveSubView: false }),
    ).toBe("evaluate-exit");
    expect(
      classifyPopState({ newState: null, hasOpenOverlay: false, hasActiveSubView: false }),
    ).toBe("evaluate-exit");
  });

  it("overlay (FAB menusu) acikken geri → ignore; App dokunmaz", () => {
    const { history, appDecision } = makeApp(DAILY_ROOT);
    const menu = mountModal(history, () => undefined);
    history.back(); // menu kapanir (kendi dinleyicisi)
    expect(appDecision()).toBe("ignore");
    menu.unmount();
  });
});
