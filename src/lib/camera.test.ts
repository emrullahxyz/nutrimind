import { describe, expect, it } from "vitest";
import {
  cropRectFor,
  describeConstraints,
  guideRectFor,
  measuredFacing,
  pickBackCameraDeviceId,
  resolveCameraPick,
  visionModeFor,
} from "./camera";
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

// ============================================================================
// ÖLÇÜLMÜŞ BUG (iPhone, standalone): "kamerayı açınca ÖN kamera açıldı ve arka
// kameraya geçiş yapamadık". İki mekanizma birden mümkündü; ikisi de aşağıdaki
// karar fonksiyonunda kapatılır:
//   M1 — `facingMode: {ideal:"environment"}` yumuşak kısıt; ilk çağrıda
//        yok sayılıp varsayılan (ön) kamera dönebilir.
//   M2 — eski kod geçişi `if (pick && current && …)` ile koruyordu;
//        `getSettings().deviceId` gelmeyen cihazda (iOS) bu kapı false oluyor ve
//        doğru lense geçiş HİÇ denenmiyordu.
// Aşağıda "cihaz ios gibi davranıyor" senaryosu: settings'te deviceId YOK,
// etiketler izinden sonra dolu. Beklenen: ana arka kameraya geçilmesi.
// ============================================================================
const iosDevices: CameraDeviceLike[] = [
  { deviceId: "ios-front", label: "Front Camera", kind: "videoinput" },
  { deviceId: "ios-back", label: "Back Camera", kind: "videoinput" },
  { deviceId: "ios-dual", label: "Back Dual Wide Camera", kind: "videoinput" },
  { deviceId: "ios-ultra", label: "Back Ultra Wide Camera", kind: "videoinput" },
];

describe("measuredFacing — 'ne istedik' değil 'ne geldi'", () => {
  it("facingMode söylenmişse otoritedir", () => {
    expect(measuredFacing({ facingMode: "user" }, iosDevices)).toBe("user");
    expect(measuredFacing({ facingMode: "environment" }, iosDevices)).toBe("environment");
  });

  it("deviceId etiketle eşleşiyorsa yön çıkarılır", () => {
    expect(measuredFacing({ deviceId: "ios-front" }, iosDevices)).toBe("user");
    expect(measuredFacing({ deviceId: "ios-back" }, iosDevices)).toBe("environment");
  });

  it("bilinmeyen/boş etiket 'bilmiyoruz' demektir (uydurmaz)", () => {
    expect(measuredFacing({ deviceId: "yok" }, iosDevices)).toBeNull();
    expect(measuredFacing({ deviceId: "a" }, [{ deviceId: "a", label: "", kind: "videoinput" }])).toBeNull();
    expect(measuredFacing({ width: 1280, height: 720 }, iosDevices)).toBeNull();
    expect(measuredFacing(null, iosDevices)).toBeNull();
  });
});

describe("resolveCameraPick — yön kararı", () => {
  it("M2: deviceId gelmese bile ANA arka kameraya geçilir (eski kod burada duruyordu)", () => {
    const d = resolveCameraPick({
      facing: "environment",
      devices: iosDevices,
      settings: { width: 1280, height: 720 },
    });
    expect(d.kind).toBe("retry-device");
    expect(d.deviceId).toBe("ios-back"); // ultra-geniş DEĞİL
    expect(d.reason).toBe("unverified");
  });

  it("M1: ön kamera geldiği ÖLÇÜLÜRSE hedef lense geçilir", () => {
    const d = resolveCameraPick({
      facing: "environment",
      devices: iosDevices,
      settings: { deviceId: "ios-front", facingMode: "user" },
    });
    expect(d.kind).toBe("retry-device");
    expect(d.deviceId).toBe("ios-back");
    expect(d.actualFacing).toBe("user");
    expect(d.reason).toBe("wrong-facing:user");
  });

  it("zaten ana kameradaysa GEREKSİZ durdur/başlat yok", () => {
    const d = resolveCameraPick({
      facing: "environment",
      devices: iosDevices,
      settings: { deviceId: "ios-back", facingMode: "environment" },
    });
    expect(d.kind).toBe("keep");
    expect(d.reason).toBe("verified");
  });

  it("ölçüm yok + hedef lens de bilinmiyorsa sert YÖN isteği (id uydurulmaz)", () => {
    const d = resolveCameraPick({
      facing: "environment",
      devices: [
        { deviceId: "a", label: "", kind: "videoinput" },
        { deviceId: "b", label: "", kind: "videoinput" },
      ],
      settings: { width: 640, height: 480 },
    });
    expect(d.kind).toBe("retry-facing");
    expect(d.deviceId).toBeNull();
    expect(d.reason).toBe("unverified-no-device");
  });

  it("ön kamera isteniyorsa (çift dokunuş) ön lens seçilir", () => {
    const d = resolveCameraPick({
      facing: "user",
      devices: iosDevices,
      settings: { deviceId: "ios-back", facingMode: "environment" },
    });
    expect(d.kind).toBe("retry-device");
    expect(d.deviceId).toBe("ios-front");
  });

  it("tek kameralı cihazda çıkmaza girmez: sert yön isteği (geri çekilme var)", () => {
    const d = resolveCameraPick({
      facing: "environment",
      devices: [{ deviceId: "web", label: "Integrated Camera", kind: "videoinput" }],
      settings: { deviceId: "web", facingMode: "user" },
    });
    expect(d.kind).toBe("retry-facing");
  });

  it("cihaz listesi hiç yoksa yön isteğiyle devam eder (çökmaz)", () => {
    const d = resolveCameraPick({ facing: "environment", devices: null, settings: null });
    expect(d.kind).toBe("retry-facing");
    expect(d.actualFacing).toBeNull();
  });
});

describe("describeConstraints — tanılama özeti", () => {
  it("yumuşak/sert yön ve cihaz kısıtlarını ayırt eder", () => {
    expect(describeConstraints({ video: { facingMode: { ideal: "environment" } } })).toBe(
      "facingMode.ideal=environment",
    );
    expect(describeConstraints({ video: { facingMode: { exact: "user" } } })).toBe(
      "facingMode.exact=user",
    );
    expect(describeConstraints({ video: { deviceId: { exact: "ios-back" } } })).toBe(
      "deviceId.exact=ios-back",
    );
    expect(describeConstraints({ video: true })).toBe("default");
    expect(describeConstraints(null)).toBe("default");
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
