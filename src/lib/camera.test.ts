import { describe, expect, it } from "vitest";
import { cropRectFor, guideRectFor, pickBackCameraDeviceId, visionModeFor } from "./camera";
import type { CameraDeviceLike, ScanMode } from "./camera";

// ============================================================================
// Bug: kamera yaşam döngüsü barkod dedektörüne kilitliydi (`cameraScanSupported`
// önce `BarcodeDetector` arıyordu), bu yüzden dedektörü olmayan cihazlarda yemek
// fotoğrafı ve etiket okuma için kamera HİÇ açılmıyordu. Ayrılırken asist
// çerçevesi de dekordan işlevsele döndü: yakalanan kare tam olarak çerçeveye
// KIRPILIYOR, böylece model tüm sahne yerine sadece etiketi/tabağı görüyor.
//
// Buradaki iki fonksiyon o kırpmanın matematiği. DOM'a ihtiyaç duymadan test
// edilebilsinler diye bileşenden ayrı tutuldular.
// ============================================================================

const LIVE_MODES: ScanMode[] = ["scan_food", "barcode", "food_label"];

// ============================================================================
// Bug: kullanıcı telefonda taramaya girince cihaz ULTRA-GENİŞ kamerayı açıyordu.
// `facingMode: "environment"` yalnızca "arkaya bakan bir kamera" der, hangisi
// olduğunu söylemez. Ultra-geniş lensler genelde SABİT ODAKLI olduğu için besin
// etiketi gibi yakın çekimler net çıkmıyor — "odak yapmadı, bulanık" şikâyeti.
// ============================================================================
describe("pickBackCameraDeviceId", () => {
  const vid = (deviceId: string, label: string): CameraDeviceLike => ({ deviceId, label, kind: "videoinput" });

  it("Android: aynı yöne bakan kameralardan en küçük camera2 indeksi ana kameradır", () => {
    const secim = pickBackCameraDeviceId([
      vid("ana", "camera2 0, facing back"),
      vid("on", "camera2 1, facing front"),
      vid("genis", "camera2 2, facing back"),
    ]);
    expect(secim).toBe("ana");
  });

  it("Android: liste sırası ters olsa da ana kamera seçilir", () => {
    const secim = pickBackCameraDeviceId([
      vid("genis", "camera2 2, facing back"),
      vid("ana", "camera2 0, facing back"),
      vid("on", "camera2 1, facing front"),
    ]);
    expect(secim).toBe("ana");
  });

  it("iOS: ultra-geniş ve telefoto elenir, düz 'Back Camera' seçilir", () => {
    const secim = pickBackCameraDeviceId([
      vid("on", "Front Camera"),
      vid("genis", "Back Ultra Wide Camera"),
      vid("ana", "Back Camera"),
      vid("tele", "Back Telephoto Camera"),
    ]);
    expect(secim).toBe("ana");
  });

  it("ses cihazları yok sayılır", () => {
    const secim = pickBackCameraDeviceId([
      { deviceId: "mik", label: "Default - Microphone", kind: "audioinput" },
      vid("ana", "Back Camera"),
    ]);
    expect(secim).toBe("ana");
  });

  it("etiketler boşken (izin verilmemiş) null döner — yanlış kamerayı seçmektense dokunma", () => {
    expect(
      pickBackCameraDeviceId([vid("a", ""), vid("b", ""), vid("c", "")]),
    ).toBeNull();
  });

  it("hiç kamera yoksa null döner", () => {
    expect(pickBackCameraDeviceId([])).toBeNull();
    expect(pickBackCameraDeviceId([{ deviceId: "m", label: "Mic", kind: "audioinput" }])).toBeNull();
  });

  it("tek arka kamera ultra-geniş bile olsa onu seçer (hiç yoktan iyidir)", () => {
    const secim = pickBackCameraDeviceId([
      vid("on", "Front Camera"),
      vid("genis", "Back Ultra Wide Camera"),
    ]);
    expect(secim).toBe("genis");
  });

  it("masaüstü: tek kamera olduğu gibi seçilir", () => {
    expect(pickBackCameraDeviceId([vid("web", "Integrated Camera")])).toBe("web");
  });
});

describe("visionModeFor", () => {
  it("yalnızca etiket modu BİREBİR okuma istemine gider", () => {
    expect(visionModeFor("food_label")).toBe("food_label");
  });

  it("yemek ve barkod modları yemek fotoğrafı istemine düşer", () => {
    expect(visionModeFor("scan_food")).toBe("food_photo");
    expect(visionModeFor("barcode")).toBe("food_photo");
  });
});

describe("guideRectFor", () => {
  it("ölçüsüz alanda null döner (ilk render'da 0x0 olur)", () => {
    expect(guideRectFor("barcode", 0, 0)).toBeNull();
    expect(guideRectFor("scan_food", 400, 0)).toBeNull();
    expect(guideRectFor("food_label", -10, 800)).toBeNull();
  });

  it("barkod çerçevesi enine uzun (şerit)", () => {
    const r = guideRectFor("barcode", 400, 800)!;
    expect(r.width).toBeGreaterThan(r.height * 2);
  });

  it("etiket çerçevesi dikey — besin tablosu dik durur", () => {
    const r = guideRectFor("food_label", 400, 800)!;
    expect(r.height).toBeGreaterThan(r.width);
  });

  it("yemek çerçevesi kare-ish", () => {
    const r = guideRectFor("scan_food", 400, 800)!;
    expect(r.width).toBeCloseTo(r.height, 5);
  });

  it("her modda çerçeve ortalanır", () => {
    for (const mode of LIVE_MODES) {
      const r = guideRectFor(mode, 400, 800)!;
      expect(r.x + r.width / 2).toBeCloseTo(200, 5);
      expect(r.y + r.height / 2).toBeCloseTo(400, 5);
    }
  });

  it("kısa ekranda dikey çerçeve taşmaz, oran korunarak küçülür", () => {
    const tall = guideRectFor("food_label", 400, 800)!;
    const short = guideRectFor("food_label", 400, 500)!;
    expect(short.height).toBeLessThan(tall.height);
    // en-boy oranı aynı kalmalı
    expect(short.width / short.height).toBeCloseTo(tall.width / tall.height, 5);
  });

  it("hiçbir viewport/mod bileşiminde görüntü alanını taşmaz", () => {
    const viewports = [
      [320, 480],
      [400, 800],
      [412, 915],
      [768, 1024],
      [900, 400], // yatay
      [300, 300], // kare
    ];
    for (const mode of LIVE_MODES) {
      for (const [w, h] of viewports) {
        const r = guideRectFor(mode, w, h)!;
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(w + 1e-9);
        expect(r.y + r.height).toBeLessThanOrEqual(h + 1e-9);
      }
    }
  });
});

describe("cropRectFor", () => {
  it("video ile görüntü alanı birebir aynıysa çerçeve olduğu gibi kalır", () => {
    const crop = cropRectFor(640, 480, 640, 480, { x: 10, y: 20, width: 100, height: 50 });
    expect(crop).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("geniş video dar/uzun alana sığdırılırken yanlardan kırpılır (object-cover)", () => {
    // 1280x720 video, 400x800 dikey alan → ölçek 800/720, yanlardan taşar
    const crop = cropRectFor(1280, 720, 400, 800, { x: 0, y: 0, width: 400, height: 800 });
    expect(crop.x).toBeCloseTo(460, 4);
    expect(crop.y).toBeCloseTo(0, 4);
    expect(crop.width).toBeCloseTo(360, 4);
    expect(crop.height).toBeCloseTo(720, 4);
    // görünen alanın tamamı istendiğinde kırpma da aynı en-boy oranında olmalı
    expect(crop.width / crop.height).toBeCloseTo(400 / 800, 6);
  });

  it("ortadaki çerçeve videonun ortasına düşer", () => {
    const crop = cropRectFor(1600, 900, 300, 300, { x: 50, y: 50, width: 200, height: 200 });
    expect(crop.x).toBeCloseTo(500, 4);
    expect(crop.y).toBeCloseTo(150, 4);
    expect(crop.width).toBeCloseTo(600, 4);
    expect(crop.height).toBeCloseTo(600, 4);
  });

  it("sonuç her zaman videonun sınırları içinde kalır", () => {
    // Kasıtlı olarak alanın dışına taşan bir çerçeve
    const crop = cropRectFor(640, 480, 400, 800, { x: -500, y: -500, width: 5000, height: 5000 });
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(640);
    expect(crop.y + crop.height).toBeLessThanOrEqual(480);
    expect(crop.width).toBeGreaterThan(0);
    expect(crop.height).toBeGreaterThan(0);
  });

  it("video henüz ölçüsüzken (videoWidth=0) çökmez, güvenli bir dikdörtgen döner", () => {
    const crop = cropRectFor(0, 0, 400, 800, { x: 0, y: 0, width: 400, height: 800 });
    expect(crop.width).toBeGreaterThan(0);
    expect(crop.height).toBeGreaterThan(0);
  });

  it("gerçek akış: guideRectFor'un ürettiği çerçeve her zaman geçerli bir kırpma verir", () => {
    for (const mode of LIVE_MODES) {
      const guide = guideRectFor(mode, 412, 915)!;
      const crop = cropRectFor(1280, 720, 412, 915, guide);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(1280 + 1e-9);
      expect(crop.y + crop.height).toBeLessThanOrEqual(720 + 1e-9);
      expect(crop.width).toBeGreaterThan(1);
      expect(crop.height).toBeGreaterThan(1);
    }
  });
});
