import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetOverlayLockForTests,
  acquireOverlayLock,
  applyLockAction,
  hasOpenOverlay,
  releaseOverlayLock,
} from "./overlayLock";

// ============================================================================
// Bug: Modal.tsx, BottomNav.tsx (FAB backdrop) ve doğrudan useBodyScrollLock
// çağıran bileşenler (ör. ScanSheet, hem KENDİSİ hem sardığı <Modal>) AYNI ANDA
// body scroll'unu kilitleyebiliyordu. Sayaçsız save/restore'da ikinci kilit,
// birincinin zaten "hidden" yaptığı değeri "önceki değer" sanıp kaydediyor —
// biri kapanınca arka plan kilitli kalıyor ya da erken açılıyordu.
//
// applyLockAction bu kararı saf hale getirir: yalnızca sayaç 0->1 olduğunda
// DOM kilidi uygulanmalı (didLock), yalnızca 1->0 olduğunda kaldırılmalı
// (didUnlock). Ara geçişler (1->2, 2->1) DOM'a hiç dokunmamalı.
// ============================================================================
describe("applyLockAction", () => {
  it("ilk acquire (0 -> 1) DOM kilidini uygulamalı", () => {
    expect(applyLockAction(0, "acquire")).toEqual({ count: 1, didLock: true, didUnlock: false });
  });

  it("iç içe ikinci acquire (1 -> 2) DOM'a dokunmamalı", () => {
    expect(applyLockAction(1, "acquire")).toEqual({ count: 2, didLock: false, didUnlock: false });
  });

  it("iç içe overlay'lerden biri kapanınca (2 -> 1) DOM'a dokunmamalı", () => {
    expect(applyLockAction(2, "release")).toEqual({ count: 1, didLock: false, didUnlock: false });
  });

  it("son overlay de kapanınca (1 -> 0) DOM kilidi kaldırılmalı", () => {
    expect(applyLockAction(1, "release")).toEqual({ count: 0, didLock: false, didUnlock: true });
  });

  it("sayaç zaten 0'ken fazladan release gelirse negatife düşmemeli ve DOM'a dokunmamalı", () => {
    expect(applyLockAction(0, "release")).toEqual({ count: 0, didLock: false, didUnlock: false });
  });
});

describe("overlay kayıt defteri (acquire/release/hasOpenOverlay)", () => {
  beforeEach(() => {
    __resetOverlayLockForTests();
  });

  it("hiç kilit yokken hasOpenOverlay false döner", () => {
    expect(hasOpenOverlay()).toBe(false);
  });

  it("tek bir overlay açıkken hasOpenOverlay true döner", () => {
    acquireOverlayLock();
    expect(hasOpenOverlay()).toBe(true);
  });

  it("iç içe iki overlay'den biri kapansa bile diğeri açık olduğu sürece hasOpenOverlay true kalır", () => {
    // Tam olarak ScanSheet + <Modal> senaryosu: aynı ekranda iki bağımsız kilit sahibi.
    acquireOverlayLock();
    acquireOverlayLock();
    releaseOverlayLock();
    expect(hasOpenOverlay()).toBe(true);
  });

  it("tüm overlay'ler kapanınca hasOpenOverlay false döner", () => {
    acquireOverlayLock();
    acquireOverlayLock();
    releaseOverlayLock();
    releaseOverlayLock();
    expect(hasOpenOverlay()).toBe(false);
  });
});
