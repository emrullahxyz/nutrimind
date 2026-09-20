// ============================================================================
// Nutrimind — kamera yaşam döngüsü, barkoddan BAĞIMSIZ.
//
// NEDEN AYRI BİR DOSYA (bu bir yeniden düzenleme değil, bug düzeltmesi):
// Kamera açma mantığı `offScanner.ts`'te barkod dedektörüne KİLİTLİYDİ —
//   • `cameraScanSupported()` (off.ts) üç koşul istiyor, İLKİ `BarcodeDetector`,
//   • `useOffScanner`'ın efekti de `if (!Ctor) { setScanning(false); return; }`
//     ile kamerayı hiç başlatmıyordu.
// `BarcodeDetector` iOS Safari'de YOK. Yemek fotoğrafı ve besin etiketi okuma ise
// barkoda hiç ihtiyaç duymuyor; ama o kilit yüzünden bu cihazlarda kamera HİÇ
// açılmıyordu — "kamera yemek tanıma yapamıyor" şikâyetinin yapısal sebebi buydu.
//
// Burada kamera (getUserMedia + <video>) tek başına ele alınıyor; barkod tarama
// ONUN ÜSTÜNDE opsiyonel bir katman (`useBarcodeDetection`). `useOffScanner`
// artık bu ikisinin bileşimi — `OffSearch`'ün gördüğü API değişmedi.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { FOOD_BARCODE_FORMATS, barcodeDetectorCtor } from "./off";
import type { BarcodeDetectorLike } from "./off";
import type { VisionMode } from "../types";
import i18n from "../i18n/i18n";
import {
  cameraDiag,
  summarizeDevices,
  summarizeSettings,
  truncateNote,
} from "./cameraDiag";

/** Kamera karesi tarama aralığı. 400 ms göze anında görünüyor, CPU'yu yormuyor. */
const SCAN_INTERVAL_MS = 400;

/**
 * CANLI kamera modları. "Galeri" bilerek burada YOK: o bir mod değil, bir eylem —
 * dosya seçiciyi açar ve seçim bitince kullanıcı yine içinde bulunduğu canlı moda
 * döner. Eskiden dördüncü bir "mod" gibi durması, "Food Label"a basınca da galeri
 * açılması bug'ıyla aynı kafa karışıklığının parçasıydı.
 */
export type ScanMode = "scan_food" | "barcode" | "food_label";

/** Tarama modu → görsel analiz istemi. `barcode` yerel dedektörle çalıştığı için
 *  AI'a hiç gitmez. Galeriden seçilen görsel de o anki modun istemini kullanır:
 *  etiket modundayken galeriden seçilen fotoğraf da etiket olarak okunur. */
export function visionModeFor(mode: ScanMode): VisionMode {
  return mode === "food_label" ? "food_label" : "food_photo";
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Asist çerçevesi ----------------------------------------------------------

/**
 * Mod başına çerçeve geometrisi. `aspect` = genişlik / yükseklik.
 *
 * Çerçeve yalnızca dekor değil: yakalanan kare tam olarak buraya KIRPILIYOR
 * (`cropRectFor`). Model tüm sahne yerine sadece ilgili bölgeyi gördüğü için
 * etiket okuma belirgin biçimde iyileşiyor.
 */
const GUIDE_SPEC: Record<ScanMode, { widthPct: number; aspect: number }> = {
  // Barkod yatay bir şerittir; uzun-ince çerçeve kullanıcıyı doğru mesafeye zorlar.
  barcode: { widthPct: 0.86, aspect: 2.6 },
  // Besin değerleri tablosu neredeyse her zaman DİKEY bir liste.
  food_label: { widthPct: 0.74, aspect: 0.68 },
  // Tabak kare-ish bir alana daha iyi oturuyor.
  scan_food: { widthPct: 0.84, aspect: 1 },
};

/** Dikey çerçeve kısa ekranlarda taşmasın diye üst sınır. */
const MAX_HEIGHT_PCT = 0.62;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Verilen görüntüleme alanı için asist çerçevesini (CSS pikseli, alanın kendi
 * koordinatlarında, ortalanmış) döner. Alan henüz ölçülmemişse (ilk render'da
 * 0×0) null — çağıran çerçeveyi çizmez.
 */
export function guideRectFor(mode: ScanMode, viewW: number, viewH: number): Rect | null {
  if (viewW <= 0 || viewH <= 0) return null;
  const spec = GUIDE_SPEC[mode];

  let width = viewW * spec.widthPct;
  let height = width / spec.aspect;

  const maxH = viewH * MAX_HEIGHT_PCT;
  if (height > maxH) {
    height = maxH;
    width = height * spec.aspect;
  }
  // Genişlik de taşmasın (çok dar ve kısa alanlarda olabilir).
  if (width > viewW) {
    width = viewW;
    height = width / spec.aspect;
  }

  return { x: (viewW - width) / 2, y: (viewH - height) / 2, width, height };
}

/**
 * Ekrandaki çerçeveyi videonun KENDİ piksel koordinatlarına çevirir.
 *
 * Video `object-cover` ile çizildiği için görüntü alanı doldurmak üzere büyütülüp
 * taşan kenarları eşit olarak kırpılıyor; ekrandaki bir dikdörtgen bu yüzden
 * doğrudan video pikseline karşılık gelmiyor. Ölçek `max(...)`, ofset ise taşan
 * payın yarısı. Sonuç video sınırlarına kırpılır — aksi hâlde `drawImage` boş
 * (siyah) alan çizerdi.
 */
export function cropRectFor(
  videoW: number,
  videoH: number,
  viewW: number,
  viewH: number,
  guide: Rect,
): Rect {
  if (videoW <= 0 || videoH <= 0 || viewW <= 0 || viewH <= 0) {
    return { x: 0, y: 0, width: Math.max(1, videoW), height: Math.max(1, videoH) };
  }

  const scale = Math.max(viewW / videoW, viewH / videoH);
  const offsetX = (videoW * scale - viewW) / 2;
  const offsetY = (videoH * scale - viewH) / 2;

  const x = clamp((guide.x + offsetX) / scale, 0, Math.max(0, videoW - 1));
  const y = clamp((guide.y + offsetY) / scale, 0, Math.max(0, videoH - 1));
  const width = clamp(guide.width / scale, 1, videoW - x);
  const height = clamp(guide.height / scale, 1, videoH - y);

  return { x, y, width, height };
}

// --- Yetenek ------------------------------------------------------------------

/**
 * Kamera bu tarayıcıda açılabilir mi? `cameraScanSupported()`'tan (off.ts) FARKI:
 * `BarcodeDetector` ARANMAZ. Yemek/etiket çekimi ona ihtiyaç duymuyor.
 */
export interface CameraDeviceLike {
  deviceId: string;
  label: string;
  kind: string;
}

/**
 * Kamera yönü. `environment` = arkaya bakan (yemek/etiket/barkod için doğru
 * olan), `user` = öne bakan (kullanıcı çift dokunuşla geçebilir).
 */
export type CameraFacing = "environment" | "user";

/** Cihaz etiketleri yalnızca İZİNDEN SONRA dolar; bu eşlemeler tarayıcının
 *  verdiği DONANIM adı üzerinde çalışır, arayüz metni değil. */
// i18n-exempt: cihaz ETİKETİ eşlemesi (tarayıcının verdiği donanım adı), arayüz metni değil
const LABEL_FRONT_RE = /front|user|selfie|ön kamera/i;
// i18n-exempt: cihaz ETİKETİ eşlemesi (yardımcı lens adları)
const LABEL_BACK_RE = /back|rear|environment|arka/i;
// i18n-exempt: cihaz ETİKETİ eşlemesi (yardımcı lens adları)
const LABEL_AUX_RE =
  /ultra|wide[-\s]?angle|telephoto|\btele\b|zoom|depth|macro|monochrome|infrared|\bir\b/i;

/** `camera2 3, facing back` → 3; indeks yoksa Infinity (iOS, masaüstü). */
function camera2Index(label: string): number {
  const m = /camera2\s+(\d+)/i.exec(label);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Çok kameralı telefonlarda istenen yöndeki ANA kamerayı seçer.
 *
 * `facingMode: "environment"` yalnızca "arkaya bakan bir kamera" diyor; hangisi
 * olduğunu GARANTİ ETMİYOR. Cihaz ultra-geniş lensi verdiğinde iki şey birden
 * bozuluyor: ultra-geniş lensler genelde SABİT ODAKLI olduğu için yakın çekim
 * (besin etiketi) net çıkmıyor, ayrıca daha düşük çözünürlüklü oluyorlar.
 *
 * Eleme sırası: önce istenen yöne bakanlar, sonra arka için yardımcı lensler
 * (ultra-geniş, telefoto, derinlik, makro) atılır. Kalanlar arasında Android'in
 * "camera2 N, facing back" etiketindeki EN KÜÇÜK indeks seçilir — Camera2
 * API'sinde 0 numaralı arka kamera ana kameradır.
 */
export function pickCameraDeviceId(
  devices: CameraDeviceLike[],
  facing: CameraFacing = "environment",
): string | null {
  const inputs = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  if (inputs.length === 0) return null;
  // Etiketler yalnızca izin verildikten SONRA dolar. Boşken hangi lensin
  // hangisi olduğu bilinemez; yanlış kamerayı (ör. ön kamerayı) seçmektense
  // hiç dokunmamak doğru — çağıran KARARI kendi ölçümüyle verir (bkz.
  // `resolveCameraPick`; eskiden buradaki boş etiket, ikinci isteği
  // tamamen iptal ediyordu ve ön kamera öylece kalıyordu).
  if (inputs.every((d) => !d.label.trim())) return null;

  if (facing === "user") {
    let front = inputs.filter((d) => LABEL_FRONT_RE.test(d.label));
    if (front.length === 0) front = inputs.filter((d) => !LABEL_BACK_RE.test(d.label));
    return (front.length > 0 ? front : inputs)[0].deviceId;
  }

  let back = inputs.filter((d) => LABEL_BACK_RE.test(d.label));
  if (back.length === 0) back = inputs.filter((d) => !LABEL_FRONT_RE.test(d.label));
  if (back.length === 0) back = inputs;

  const main = back.filter((d) => !LABEL_AUX_RE.test(d.label));
  const pool = main.length > 0 ? main : back;

  // `sort` kararlı: indeks yoksa (iOS, masaüstü) sıralama bozulmaz, ilki seçilir.
  return [...pool].sort((a, b) => camera2Index(a.label) - camera2Index(b.label))[0].deviceId;
}

/** Geriye dönük ad: yalnızca arka kamera. Testler ve çağıranlar bunu kullanır. */
export function pickBackCameraDeviceId(devices: CameraDeviceLike[]): string | null {
  return pickCameraDeviceId(devices, "environment");
}

// --- Yön kararı ---------------------------------------------------------------

export interface CameraSettingsLike {
  deviceId?: string;
  facingMode?: string;
  width?: number;
  height?: number;
}

export interface CameraPickInput {
  facing: CameraFacing;
  devices: CameraDeviceLike[] | null;
  settings: CameraSettingsLike | null;
}

export type CameraDecisionKind = "keep" | "retry-device" | "retry-facing";

export interface CameraDecision {
  kind: CameraDecisionKind;
  /** Yeniden istekte `deviceId: {exact}` olarak kullanılacak cihaz (varsa). */
  deviceId: string | null;
  reason: string;
  /** Ölçülebilen gerçek yön; ölçülemiyorsa null. */
  actualFacing: CameraFacing | null;
}

/**
 * ELDEKİ AKIŞIN hangi yöne baktığını söyler — "ne istediğimiz" değil, "ne
 * geldiği". İki kaynak sırayla denenir:
 *   1. `getSettings().facingMode` — varsa OTORİTE (tarayıcı kendi söylüyor),
 *   2. `getSettings().deviceId` + etiketli cihaz listesi — eşleştirme.
 * İkisi de yoksa `null`: "bilmiyoruz". iOS bazı sürümlerde deviceId'yi
 * vermiyor; bu yüzden bilinmezlik BİR HATA DEĞİL, ele alınması gereken bir
 * durumdur (eski kod bunu "dokunma" diye yorumlayıp ön kamerada kalıyordu).
 */
export function measuredFacing(
  settings: CameraSettingsLike | null | undefined,
  devices: CameraDeviceLike[] | null | undefined,
): CameraFacing | null {
  const raw = settings?.facingMode;
  if (raw === "environment" || raw === "user") return raw;

  const id = settings?.deviceId;
  if (!id || !devices) return null;
  const hit = devices.find((d) => d.kind === "videoinput" && d.deviceId === id);
  if (!hit || !hit.label.trim()) return null;
  if (LABEL_FRONT_RE.test(hit.label)) return "user";
  if (LABEL_BACK_RE.test(hit.label)) return "environment";
  return null;
}

/**
 * ÖLÇÜLMÜŞ ARİZA (iPhone, standalone): yemek/etiket taramasında ÖN kamera açıldı
 * ve arkaya geçmenin hiçbir yolu yoktu. İki mekanizma birden mümkündü ve ikisi
 * de burada kapatılır:
 *   M1 — `facingMode: {ideal: "environment"}` YUMUŞAK bir kısıt; tarayıcı ilk
 *        çağrıda yok sayıp varsayılanı (ön kamera) verebiliyor.
 *   M2 — eski kod ana-lens geçişini `if (pick && current && …)` ile korumuştu:
 *        `getSettings().deviceId` gelmeyen bir cihazda (iOS) bu kapı `false`
 *        oluyor ve geçiş HİÇ denenmiyordu. Yön "bilinmiyor" diye hiç
 *        dokunmamak, ön kamerada kalmak demekti.
 *
 * Karar kuralları:
 *   • ölçülen yön istenenle AYNI → `keep` (gereksiz durdur/başlat yok),
 *   • ölçülen yön FARKLI → hedef lens biliniyorsa ona geç (`retry-device`),
 *     bilinmiyorsa sert yön isteği (`retry-facing`),
 *   • ölçülemedi → hedef lens biliniyorsa ona geç, bilinmiyorsa sert yön isteği.
 * Çağıran EN FAZLA bir kez yeniden dener (sınırsız döngü yok).
 */
export function resolveCameraPick({ facing, devices, settings }: CameraPickInput): CameraDecision {
  const wanted = devices ? pickCameraDeviceId(devices, facing) : null;
  const actual = measuredFacing(settings, devices);
  const current = settings?.deviceId ?? null;

  if (actual === facing) {
    const known = wanted ?? current;
    return { kind: "keep", deviceId: known, reason: "verified", actualFacing: actual };
  }

  if (actual !== null) {
    // Yanlış yöndeyiz: önce HEDEF LENSE geçmeyi dene, lens bilinmiyorsa sert yön.
    if (wanted && wanted !== current) {
      return { kind: "retry-device", deviceId: wanted, reason: `wrong-facing:${actual}`, actualFacing: actual };
    }
    return { kind: "retry-facing", deviceId: null, reason: `wrong-facing:${actual}`, actualFacing: actual };
  }

  // Ölçülemedi — iOS'un imzası. Hedef lens biliniyorsa ona geç.
  if (wanted && wanted !== current) {
    return { kind: "retry-device", deviceId: wanted, reason: "unverified", actualFacing: null };
  }
  if (wanted && wanted === current) {
    // İstediğimiz lens zaten açık; ölçemiyoruz ama yanlış olduğunu da bilmiyoruz.
    return { kind: "keep", deviceId: wanted, reason: "unverified-but-picked", actualFacing: null };
  }
  return { kind: "retry-facing", deviceId: null, reason: "unverified-no-device", actualFacing: null };
}

/**
 * Tanılama kaydı için kısıtın TEK SATIR özeti: "facingMode.ideal=environment",
 * "facingMode.exact=user", "deviceId.exact=ios-back", "default".
 * Rapor, arızanın hangi adımda olduğunu bu satırdan okur — tahmine yer bırakmaz.
 */
export function describeConstraints(constraints: MediaStreamConstraints | null | undefined): string {
  const v = constraints?.video;
  const dict = typeof v === "object" && v !== null ? (v as MediaTrackConstraints) : null;
  if (!dict) return "default";

  const params = (x: unknown): ConstrainDOMStringParameters | null =>
    typeof x === "object" && x !== null ? (x as ConstrainDOMStringParameters) : null;

  const mode = dict.facingMode;
  if (mode !== undefined) {
    const p = params(mode);
    if (p?.exact) return `facingMode.exact=${String(p.exact)}`;
    if (p?.ideal) return `facingMode.ideal=${String(p.ideal)}`;
    return `facingMode=${String(mode)}`;
  }

  const id = dict.deviceId;
  if (id !== undefined) {
    const p = params(id);
    return `deviceId.exact=${String(p?.exact ?? id)}`;
  }
  return "default";
}

export function cameraSupported(): boolean {
  const g = globalThis as unknown as {
    navigator?: { mediaDevices?: { getUserMedia?: unknown } };
    isSecureContext?: boolean;
  };
  if (typeof g.navigator?.mediaDevices?.getUserMedia !== "function") return false;
  return g.isSecureContext === true;
}

// --- Akış ---------------------------------------------------------------------

export interface UseCameraStreamResult {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  /** Akış bağlandı ve oynuyor — deklanşör ancak bundan sonra anlamlı. */
  ready: boolean;
  error: string | null;
  /** Kamerayı yeniden dener (izin reddi / geçici hata sonrası). Eskiden `cameraError`
   *  bir kez set edilince hiçbir yerde null'a dönmüyordu; tek bir başarısız deneme
   *  sheet kapanana kadar ekranda yapışık kalıyordu. */
  retry: () => void;
  /** Şu an aktif olan yön. */
  facing: CameraFacing;
  /** Ön/arka geçişi. Kamera değiştirmek YENİ bir akış ister (mobilde iki kamerayı
   *  aynı anda açmak reddediliyor), bu yüzden akış durdurulup yeniden kurulur. */
  switchCamera: () => void;
}

export interface UseCameraStreamOptions {
  /** Başlangıç yönü. Varsayılan `"environment"`: barkod/etiket/yemek çekimi
   *  arkaya bakan kamerayı ister. */
  facing?: CameraFacing;
}

/**
 * `active` true olduğu sürece kamera akışı yaşar. Efektin temizliği HER çıkışta
 * (kapatma, mod değişimi, unmount) parçaları durdurur — açık kalan kamera gerçek
 * bir hatadır, telefonun ışığı yanık kalır.
 */
export function useCameraStream(
  active: boolean,
  options: UseCameraStreamOptions = {},
): UseCameraStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const initialFacing = options.facing ?? "environment";
  const [facing, setFacing] = useState<CameraFacing>(initialFacing);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  /** Yön başına ÇÖZÜLMÜŞ lens: ilk açılışta bir kez "yanlış lens mi?" bedelini
   *  ödüyoruz, sonraki açılışlar doğrudan doğru lensin `deviceId`'siyle başlar
   *  (kamera her açılışta iki kez durdurulup başlatılmaz). Geçersiz kalırsa
   *  istek hata verir ve girdi silinip akış sıfırdan çözülür. */
  const resolvedRef = useRef<Partial<Record<CameraFacing, string>>>({});
  const switchCamera = useCallback(() => {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }, []);
  // Sayfa gizlenince async başlatma zinciri de abortsun: `stopped` gibi senkron
  // okunan bir bayrak — state olsa zincir yarıştan önce yeni değeri göremez.
  const hiddenRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    // Her yeni denemede eski hata silinir. Eskiden `cameraError` bir kez set
    // edilince hiçbir yerde null'a dönmüyordu: tek bir izin reddi, sonraki tüm
    // denemelerde ekranda yapışık kalıyordu.
    setError(null);
    // Efekt gizliyken de kurulabilir (ör. gizli sayfada retry): bayrağı o anki
    // gerçeğe senkronla — ilk koruma noktasındaki `document.hidden` kontrolünü
    // görmeden getUserMedia'ya girmemek için.
    hiddenRef.current = document.hidden;

    let stopped = false;
    let stream: MediaStream | null = null;

    const release = () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    // --- Kısıtlar ---------------------------------------------------------
    // ÇÖZÜNÜRLÜK İSTEMEK ŞART. İstenmediğinde tarayıcı düşük bir varsayılan
    // seçiyordu (Android'de sıklıkla 640x480) ve bu İKİ şeyi birden bozuyordu:
    //   1. Akış telefon ekranına büyütüldüğü için görüntü BULANIK,
    //   2. çerçeveye kırpılan bölge o küçük kareden alındığı için AI'a giden
    //      etiket okunamayacak kadar küçük gidiyordu ("bazen algılıyor bazen
    //      algılamıyor" şikâyetinin sebebi).
    // `ideal` desteklenmiyorsa HATA VERMEZ, tarayıcı en yakınını seçer.
    const RES = { width: { ideal: 2560 }, height: { ideal: 1440 } } as const;
    const byFacing = (f: CameraFacing, strict = false): MediaStreamConstraints => ({
      video: { facingMode: strict ? { exact: f } : { ideal: f }, ...RES },
    });
    const byDevice = (id: string): MediaStreamConstraints => ({
      video: { deviceId: { exact: id }, ...RES },
    });

    if (stopped || hiddenRef.current) return;

    const devicesNow = async (): Promise<CameraDeviceLike[] | null> => {
      try {
        return (await navigator.mediaDevices.enumerateDevices?.()) ?? null;
      } catch {
        return null; // cihaz listesi yok — karar "bilinmiyor" üzerinden verilir
      }
    };
    const settingsOf = (s: MediaStream | null): CameraSettingsLike | null =>
      (s?.getVideoTracks?.()[0]?.getSettings?.() as CameraSettingsLike | undefined) ?? null;

    /** Kamerayı bırakır ve YENİ istekten önce kısa bir bekleme koyar: iOS akışı
     *  eşzamanlı bırakmıyor, hemen gelen ikinci istek reddedilebiliyor
     *  (`NotReadableError`) — "kamera bazen hiç açılmıyor" sınıfının kardeşi. */
    const stopAndSettle = async (s: MediaStream | null) => {
      if (!s) return;
      s.getTracks().forEach((t) => t.stop());
      await new Promise<void>((res) => window.setTimeout(res, 60));
    };

    void (async () => {
      try {
        const cached = resolvedRef.current[facing];
        let used = cached ? byDevice(cached) : byFacing(facing);
        try {
          stream = await navigator.mediaDevices.getUserMedia(used);
        } catch (e) {
          if (!cached) throw e;
          // Önbellekteki lens artık yok/değişmiş: girdiyi at, sıfırdan çöz.
          delete resolvedRef.current[facing];
          used = byFacing(facing);
          stream = await navigator.mediaDevices.getUserMedia(used);
        }
        if (stopped || hiddenRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          return;
        }

        // İlk akış izni alır (etiketler ancak bundan sonra dolar), ardından
        // "gerçekten doğru lens mi?" sorusu ÖLÇÜLEREK cevaplanır.
        let devices = await devicesNow();
        let settings = settingsOf(stream);
        const decision = resolveCameraPick({ facing, devices, settings });
        cameraDiag.record({
          facing,
          attempt: 1,
          requested: describeConstraints(used),
          result: decision.kind === "keep" ? "ok" : "retry",
          got: summarizeSettings(settings),
          devices: summarizeDevices(devices),
          note: decision.reason,
        });
        if (decision.kind === "keep" && decision.deviceId) {
          resolvedRef.current[facing] = decision.deviceId;
        }

        if (decision.kind !== "keep" && !stopped && !hiddenRef.current) {
          // SINIRLI: en fazla bir yeniden deneme. Yanlış lens biliniyorsa ona,
          // bilinmiyorsa sert yön isteğine geçilir (ikisi de tek adım).
          const next =
            decision.kind === "retry-device" && decision.deviceId
              ? byDevice(decision.deviceId)
              : byFacing(facing, true);
          const previous = stream;
          stream = null;
          await stopAndSettle(previous);
          if (stopped || hiddenRef.current) return;
          try {
            stream = await navigator.mediaDevices.getUserMedia(next);
          } catch (e) {
            // `exact` bir cihazda karşılanamayabilir (tek kamera, masaüstü) —
            // hata değil, geri çekilme: ilk (yumuşak) kısıtlarla devam.
            cameraDiag.record({
              facing,
              attempt: 2,
              requested: describeConstraints(next),
              result: "failed",
              got: "n/a",
              devices: summarizeDevices(devices),
              note: truncateNote(e),
            });
            stream = await navigator.mediaDevices.getUserMedia(byFacing(facing));
          }
          if (stopped || hiddenRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
            return;
          }
          devices = await devicesNow();
          settings = settingsOf(stream);
          const settled = measuredFacing(settings, devices);
          const finalPick = resolveCameraPick({ facing, devices, settings });
          if (finalPick.deviceId && (settled === facing || finalPick.kind === "keep")) {
            resolvedRef.current[facing] = finalPick.deviceId;
          }
          cameraDiag.record({
            facing,
            attempt: 2,
            requested: describeConstraints(next),
            // "Ok" demek için YÖN ÖLÇÜLMÜŞ olmalı; ölçülemeyen ama doğru lensle
            // açılan akış `unverified` olarak kaydedilir (uydurma yok).
            result: settled === facing ? "ok" : settled ? "failed" : "unverified",
            got: summarizeSettings(settings),
            devices: summarizeDevices(devices),
            note: finalPick.reason,
          });
        }

        const active = stream;
        if (stopped || hiddenRef.current || !active) {
          active?.getTracks().forEach((t) => t.stop());
          return;
        }

        // Sürekli otomatik odak. Bazı Android cihazlarda `getUserMedia` akışı
        // sabit odakla başlıyor; etiket gibi YAKIN çekimlerde görüntü net
        // olmuyor. Desteklenmeyen cihazda `applyConstraints` reddediyor —
        // sessizce yutuyoruz, kamera yine çalışır.
        const track = active.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            });
          } catch {
            /* cihaz desteklemiyor — sorun değil */
          }
        }
        if (stopped || hiddenRef.current) return;

        const video = videoRef.current;
        if (!video) {
          release();
          return;
        }
        // muted + playsInline JSX tarafında: mobil tarayıcılar sessiz olmayan
        // videoyu kendiliğinden oynatmaz.
        video.srcObject = active;

        // Metadata gelmeden `play()` çağırmak bazı Android tarayıcılarında
        // reddediliyor — kameranın "bazen hiç açılmaması" bununla uyumlu.
        // Ölçüler gelene kadar bekliyoruz; `videoWidth` deklanşörün de ön koşulu.
        if (!video.videoWidth) {
          await new Promise<void>((res) => {
            const done = () => {
              video.removeEventListener("loadedmetadata", done);
              res();
            };
            video.addEventListener("loadedmetadata", done);
            // Olay hiç gelmezse takılı kalmayalım.
            window.setTimeout(done, 3000);
          });
        }
        if (stopped || hiddenRef.current) return;

        // `play()` reddi tek başına ölümcül değil: akış bağlı ve kare akıyor
        // olabilir. Kamerayı kapatmak yerine devam ediyoruz.
        try {
          await video.play();
        } catch {
          /* autoplay reddi — aşağıdaki videoWidth kontrolü asıl kararı verir */
        }
        if (stopped || hiddenRef.current) return;
        if (!video.videoWidth) {
          release();
          setError(i18n.t("camera.errNotStarted"));
          return;
        }
        setReady(true);
      } catch (e) {
        if (stopped || hiddenRef.current) return;
        release();
        setError(i18n.t("camera.errOpen", { detail: String((e as Error)?.message ?? e) }));
      }
    })();

    return () => {
      setReady(false);
      release();
    };
    // `attempt` bilerek bağımlılıkta: "tekrar dene" tam olarak bu efekti yeniden kurar.
    // `facing` de öyle: çift dokunuş yönü değiştirir, akış yeniden kurulur.
  }, [active, attempt, facing]);

  // Sayfa arka plana alınınca kamerayı durdur, geri gelince yeniden başlat.
  // Mobilde uygulama değiştirince kamera LED'inin yanık kalmasını önler.
  useEffect(() => {
    if (!active) return;

    const onVisibility = () => {
      if (document.hidden) {
        // Bayrağı senkron kur: halihazırda bağlı akışı durdururken, async
        // başlatma zinciri de (getUserMedia in-flight ise) bir sonraki koruma
        // noktasında abort eder — "LED yanık kaldı" hatasının kaçan penceresi.
        hiddenRef.current = true;
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setReady(false);
      } else {
        hiddenRef.current = false;
        retry();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, retry]);

  return { videoRef, ready, error, retry, facing, switchCamera };
}

// --- Barkod katmanı -----------------------------------------------------------

export interface UseBarcodeDetectionOptions {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  active: boolean;
  onDetected: (barcode: string) => void;
}

/**
 * Canlı `<video>` üzerinde barkod arar. `BarcodeDetector` yoksa SESSİZCE hiçbir şey
 * yapmaz — kamerayı KAPATMAZ. Eski davranışta bu durum tüm kamerayı düşürüyordu.
 */
export function useBarcodeDetection({
  videoRef,
  active,
  onDetected,
}: UseBarcodeDetectionOptions): void {
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!active) return;
    const Ctor = barcodeDetectorCtor();
    if (!Ctor) return;

    let stopped = false;
    let timer: number | null = null;
    const stop = () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };

    void (async () => {
      let detector: BarcodeDetectorLike;
      try {
        // Desteklenmeyen biçim istemek Chrome'da fırlatır — kesişim alınıyor.
        const supported = (await Ctor.getSupportedFormats?.()) ?? null;
        const formats = supported
          ? FOOD_BARCODE_FORMATS.filter((f) => supported.includes(f))
          : [...FOOD_BARCODE_FORMATS];
        detector = new Ctor(formats.length > 0 ? { formats } : undefined);
      } catch {
        return; // dedektör kurulamadı — kamera yine de açık kalır
      }
      if (stopped) return;

      timer = window.setInterval(() => {
        const video = videoRef.current;
        if (!video || stopped) return;
        void detector
          .detect(video)
          .then((hits) => {
            const value = hits[0]?.rawValue?.trim();
            if (!value || stopped) return;
            stop();
            onDetectedRef.current(value);
          })
          .catch(() => {
            // Tek karenin çözülememesi normal — sonraki kare denenir.
          });
      }, SCAN_INTERVAL_MS);
    })();

    return stop;
  }, [active, videoRef]);
}
