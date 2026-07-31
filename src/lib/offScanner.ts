// ============================================================================
// Nutrimind — OffSearch (Faz 4) ve ScanSheet (Faz S3) arasında PAYLAŞILAN
// kamera yaşam döngüsü + kota (429) geri sayım mantığı.
//
// Bu mantık az önce yalnızca OffSearch.tsx içinde yaşıyordu. ScanSheet aynı
// kamera akışını (BarcodeDetector + getUserMedia + kare tarama + temizlik) ve
// aynı kota davranışını istediği için buraya taşındı — brief'in açık isteği
// "lift/share this logic rather than copy-pasting it".
//
// KOTA KURALI: OffSearch'te arama kutusu ve "Getir" düğmesi 429 kilidinde
// (`blocked`) devre dışı kalıyordu ama KAMERA YOLU kalmıyordu — kilit banner'ı
// gösterilirken bile okunan bir barkod yeni bir isteğe dönüşebiliyordu. Bu
// dosyadaki `useOffScanner`, algılanan barkodu `blocked` iken ARAYANA
// (`onDetected`) hiç iletmeyerek bunu kökten çözer.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  FOOD_BARCODE_FORMATS,
  OffError,
  barcodeDetectorCtor,
  cameraScanSupported,
} from "./off";
import type { BarcodeDetectorLike } from "./off";

/** Kamera karesi tarama aralığı. 400 ms göze anında görünüyor, CPU'yu yormuyor. */
const SCAN_INTERVAL_MS = 400;

// --- Kota (429) geri sayımı --------------------------------------------------

export type OffLookupStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /** 429: `until` epoch ms — o ana kadar hiçbir istek atılmaz. */
  | { kind: "cooldown"; until: number };

export interface UseOffCooldownResult {
  status: OffLookupStatus;
  setStatus: Dispatch<SetStateAction<OffLookupStatus>>;
  /** Kalan geri sayım (saniye) — cooldown değilse 0. */
  cooldownLeft: number;
  /** true iken hiçbir yeni istek atılmamalı (arama, Getir, kamera). */
  blocked: boolean;
  /** Tüm hata yollarının tek çıkışı: 429 geri sayıma, diğerleri düz mesaja. */
  applyError: (e: unknown) => void;
}

/** OffSearch'ten AYNEN taşınan geri sayım mantığı — bkz. o dosyadaki eski yorum. */
export function useOffCooldown(): UseOffCooldownResult {
  const [status, setStatus] = useState<OffLookupStatus>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());

  const cooldownLeft =
    status.kind === "cooldown" ? Math.max(0, Math.ceil((status.until - now) / 1000)) : 0;
  const blocked = cooldownLeft > 0;

  useEffect(() => {
    if (status.kind !== "cooldown") return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [status.kind]);
  useEffect(() => {
    if (status.kind === "cooldown" && cooldownLeft === 0) setStatus({ kind: "idle" });
  }, [status, cooldownLeft]);

  const applyError = useCallback((e: unknown) => {
    if ((e as Error | undefined)?.name === "AbortError") return; // iptal ettik, hata değil
    if (e instanceof OffError && e.status === 429) {
      const seconds = e.retryAfter ?? 30;
      setStatus({ kind: "cooldown", until: Date.now() + seconds * 1000 });
      setNow(Date.now());
      return;
    }
    setStatus({ kind: "error", message: String((e as Error)?.message ?? e) });
  }, []);

  return { status, setStatus, cooldownLeft, blocked, applyError };
}

// --- Kamera -------------------------------------------------------------------

export interface UseOffScannerOptions {
  /** Bir barkod okunduğunda çağrılır. `blocked` true iken HİÇ çağrılmaz. */
  onDetected: (barcode: string) => void;
  /** 429 kilidi: true iken okunan barkod isteğe dönüşmez. */
  blocked: boolean;
}

export interface UseOffScannerResult {
  scanning: boolean;
  setScanning: (v: boolean | ((prev: boolean) => boolean)) => void;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  /** Bu tarayıcıda kamera gerçekten çalışır mı — oturum başına bir kez ölçülür. */
  canScan: boolean;
  /** Kamera açılamadıysa (izin reddi, cihaz yok…) son hata mesajı; yoksa null. */
  cameraError: string | null;
}

/**
 * OffSearch'ün kamera efektinin AYNISI (bkz. eski OffSearch.tsx yorumları):
 * akış `scanning` true olduğu sürece yaşar, efektin temizliği HER çıkışta
 * (kapatma, seçim, bileşenin unmount'ı) parçaları durdurur. Açık kalan kamera
 * gerçek bir hatadır — telefon ışığı yanık kalır.
 */
export function useOffScanner({ onDetected, blocked }: UseOffScannerOptions): UseOffScannerResult {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Kamera düğmesi yalnızca gerçekten çalışacaksa görünür. Tek seferlik
  // ölçülüyor: yetenek oturum içinde değişmez.
  const [canScan] = useState(cameraScanSupported);

  // En güncel `blocked`/`onDetected`'ı ref'te tut: efekt YENİDEN KURULMADAN
  // (yani kamerayı yeniden başlatmadan) en taze değeri okuyabilsin.
  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!scanning) return;
    const Ctor = barcodeDetectorCtor();
    if (!Ctor) {
      setScanning(false);
      return;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;

    const release = () => {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      let detector: BarcodeDetectorLike;
      try {
        // Desteklenmeyen biçim istemek Chrome'da fırlatır — kesişim alınıyor.
        const supported = (await Ctor.getSupportedFormats?.()) ?? null;
        const formats = supported
          ? FOOD_BARCODE_FORMATS.filter((f) => supported.includes(f))
          : [...FOOD_BARCODE_FORMATS];
        detector = new Ctor(formats.length > 0 ? { formats } : undefined);

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          release();
          return;
        }
        video.srcObject = stream;
        await video.play();
      } catch (e) {
        if (stopped) return;
        release();
        setScanning(false);
        setCameraError(`Kamera açılamadı: ${String((e as Error)?.message ?? e)}`);
        return;
      }

      timer = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || stopped) return;
        try {
          const hits = await detector.detect(video);
          const value = hits[0]?.rawValue?.trim();
          if (!value) return;
          release();
          setScanning(false);
          // KOTA KİLİDİ: banner gösterilirken okunan barkod isteğe dönüşmez —
          // sessizce düşer, kullanıcı zaten geri sayımı görüyor.
          if (blockedRef.current) return;
          onDetectedRef.current(value);
        } catch {
          // Tek karenin çözülememesi normal — sonraki kare denenir.
        }
      }, SCAN_INTERVAL_MS);
    })();

    return release;
    // Yalnızca `scanning` değişince yeniden kurulur — `blocked`/`onDetected`
    // ref üzerinden okunuyor ki bu ikisi değiştiğinde kamera GEREKSİZ YERE
    // yeniden başlamasın (telefon ışığı sönüp yeniden yanmasın).
  }, [scanning]);

  return { scanning, setScanning, videoRef, canScan, cameraError };
}
