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
 * Çok kameralı telefonlarda ANA arka kamerayı seçer.
 *
 * `facingMode: "environment"` yalnızca "arkaya bakan bir kamera" diyor; hangisi
 * olduğunu GARANTİ ETMİYOR. Cihaz ultra-geniş lensi verdiğinde iki şey birden
 * bozuluyor: ultra-geniş lensler genelde SABİT ODAKLI olduğu için yakın çekim
 * (besin etiketi) net çıkmıyor, ayrıca daha düşük çözünürlüklü oluyorlar.
 *
 * Eleme sırası: önce arkaya bakanlar, sonra yardımcı lensler (ultra-geniş,
 * telefoto, derinlik, makro) atılır. Kalanlar arasında Android'in
 * "camera2 N, facing back" etiketindeki EN KÜÇÜK indeks seçilir — Camera2
 * API'sinde 0 numaralı arka kamera ana kameradır.
 */
export function pickBackCameraDeviceId(devices: CameraDeviceLike[]): string | null {
  const inputs = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  if (inputs.length === 0) return null;
  // Etiketler yalnızca izin verildikten SONRA dolar. Boşken hangi lensin
  // hangisi olduğu bilinemez; yanlış kamerayı (ör. ön kamerayı) seçmektense
  // hiç dokunmamak doğru — çağıran mevcut akışla devam eder.
  if (inputs.every((d) => !d.label.trim())) return null;

  // i18n-exempt: cihaz ETİKETİ eşlemesi (tarayıcının verdiği donanım adı), arayüz metni değil
  const isFront = (l: string) => /front|user|selfie|ön kamera/i.test(l);
  const isAux = (l: string) =>
    /ultra|wide[-\s]?angle|telephoto|\btele\b|zoom|depth|macro|monochrome|infrared|\bir\b/i.test(l);

  let back = inputs.filter((d) => /back|rear|environment|arka/i.test(d.label));
  if (back.length === 0) back = inputs.filter((d) => !isFront(d.label));
  if (back.length === 0) back = inputs;

  const main = back.filter((d) => !isAux(d.label));
  const pool = main.length > 0 ? main : back;

  const camera2Index = (l: string) => {
    const m = /camera2\s+(\d+)/i.exec(l);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  };
  // `sort` kararlı: indeks yoksa (iOS, masaüstü) sıralama bozulmaz, ilki seçilir.
  return [...pool].sort((a, b) => camera2Index(a.label) - camera2Index(b.label))[0].deviceId;
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
}

/**
 * `active` true olduğu sürece kamera akışı yaşar. Efektin temizliği HER çıkışta
 * (kapatma, mod değişimi, unmount) parçaları durdurur — açık kalan kamera gerçek
 * bir hatadır, telefonun ışığı yanık kalır.
 */
export function useCameraStream(active: boolean): UseCameraStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
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

    /** İki `getUserMedia` çağrısı da aynı çözünürlüğü ister. */
    const RES = { width: { ideal: 2560 }, height: { ideal: 1440 } } as const;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // ÇÖZÜNÜRLÜK İSTEMEK ŞART. İstenmediğinde tarayıcı düşük bir
            // varsayılan seçiyor (Android'de sıklıkla 640x480) ve bu İKİ şeyi
            // birden bozuyordu:
            //   1. Akış telefon ekranına büyütüldüğü için görüntü BULANIK.
            //   2. Çerçeveye kırpılan bölge o küçük kareden alındığı için AI'a
            //      giden etiket okunamayacak kadar küçük gidiyor — "etiketi
            //      bazen algılıyor bazen algılamıyor" şikâyetinin sebebi bu.
            // `ideal` desteklenmiyorsa HATA VERMEZ, tarayıcı en yakınını seçer.
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
        });
        if (stopped || hiddenRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // ANA arka kameraya geç. Cihaz etiketleri ancak izin verildikten SONRA
        // okunabildiği için bu ikinci adım: ilk akış izni alır, sonra doğru
        // lensi seçip yeniden bağlanırız. `facingMode` tek başına ultra-geniş
        // lensi verebiliyor (sabit odaklı → etiket yakın çekimde net çıkmıyor).
        let wanted: string | null = null;
        try {
          const list = await navigator.mediaDevices.enumerateDevices?.();
          const current = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
          const pick = list ? pickBackCameraDeviceId(list) : null;
          if (pick && current && pick !== current) wanted = pick;
        } catch {
          /* enumerateDevices yok/başarısız — mevcut akışla devam edilir */
        }

        if (wanted && !stopped && !hiddenRef.current) {
          // Mobilde iki kamerayı aynı anda açmak reddedilebiliyor: önce eskiyi
          // bırak. Yeni lens açılamazsa ilk kısıtlarla GERİ DÖN — aksi hâlde
          // ölü bir akışla devam ederdik.
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: wanted }, ...RES },
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" }, ...RES },
            });
          }
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
  }, [active, attempt]);

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

  return { videoRef, ready, error, retry };
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
