import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetSubViewRegistryForTests,
  enterSubView,
  exitSubView,
  hasActiveSubView,
} from "./subViewRegistry";

// ============================================================================
// Bug: App.tsx'in geri-tuşu dinleyicisi Ayarlar > Profil ya da Geçmiş >
// hafta/gün gibi alt-görünümlerden çıkışı algılayamıyordu (bkz. backStack.ts
// başındaki not) çünkü bu bileşenlerin `pushState` çağrıları App'e hiç
// görünmüyordu. Bu registry, alt-görünüm sahibi bileşenin "şu an açığım"
// bilgisini App'in SENKRON olarak okuyabileceği paylaşılan bir sayaca yazmasını
// sağlar — tıpkı overlayLock.ts'in modal/scroll-kilit sayacı gibi.
// ============================================================================
describe("subViewRegistry", () => {
  beforeEach(() => {
    __resetSubViewRegistryForTests();
  });

  it("hiçbir alt-görünüm kayıtlı değilken hasActiveSubView false döner", () => {
    expect(hasActiveSubView()).toBe(false);
  });

  it("bir alt-görünüm (ör. Ayarlar > Profil) girilince hasActiveSubView true döner", () => {
    enterSubView();
    expect(hasActiveSubView()).toBe(true);
  });

  it("Geçmiş > hafta -> gün gibi iç içe iki seviyede (iki ayrı enterSubView çağrısı gerekmez ama gerekirse) sayaç 0'a düşene kadar aktif kalır", () => {
    enterSubView();
    enterSubView();
    exitSubView();
    expect(hasActiveSubView()).toBe(true);
    exitSubView();
    expect(hasActiveSubView()).toBe(false);
  });

  it("alt-görünümden çıkılınca (exitSubView) hasActiveSubView false döner", () => {
    enterSubView();
    exitSubView();
    expect(hasActiveSubView()).toBe(false);
  });

  it("fazladan exitSubView çağrısı sayacı negatife düşürmez", () => {
    exitSubView();
    exitSubView();
    expect(hasActiveSubView()).toBe(false);
    enterSubView();
    expect(hasActiveSubView()).toBe(true);
  });
});
