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
import { OffError, cameraScanSupported } from "./off";
import { useBarcodeDetection, useCameraStream } from "./camera";

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
 * Barkod odaklı tarayıcı — `OffSearch`'ün kullandığı akış.
 *
 * ARTIK BİR BİLEŞİM: kamera yaşam döngüsü (`useCameraStream`) ile barkod tarama
 * (`useBarcodeDetection`) `../lib/camera`'ya ayrıldı, çünkü ikisi birbirine
 * kilitliyken `BarcodeDetector`'ı olmayan cihazlarda (iOS Safari) kamera yemek
 * fotoğrafı/etiket okuma için de HİÇ açılamıyordu. Buradaki dışa dönük API
 * bilerek aynı bırakıldı — `OffSearch` değişmedi.
 *
 * `canScan` hâlâ `cameraScanSupported()` (yani BarcodeDetector şartı DAHİL),
 * çünkü bu akışın tek işi barkod okumak: dedektör yoksa düğmeyi göstermek boş
 * umut olurdu. Yemek/etiket çekimi bu kapıyı kullanmaz (`cameraSupported`).
 */
export function useOffScanner({ onDetected, blocked }: UseOffScannerOptions): UseOffScannerResult {
  const [scanning, setScanning] = useState(false);
  // Kamera düğmesi yalnızca gerçekten çalışacaksa görünür. Tek seferlik
  // ölçülüyor: yetenek oturum içinde değişmez.
  const [canScan] = useState(cameraScanSupported);

  const { videoRef, error } = useCameraStream(scanning);

  // En güncel `blocked`'ı ref'te tut: değeri değiştiğinde kamera GEREKSİZ YERE
  // yeniden başlamasın (telefon ışığı sönüp yeniden yanmasın).
  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  useBarcodeDetection({
    videoRef,
    active: scanning,
    onDetected: (value) => {
      setScanning(false); // okundu: akışı kapat
      // KOTA KİLİDİ: banner gösterilirken okunan barkod isteğe dönüşmez —
      // sessizce düşer, kullanıcı zaten geri sayımı görüyor.
      if (blockedRef.current) return;
      onDetected(value);
    },
  });

  // Kamera açılamadıysa "taranıyor" durumunda kalmanın anlamı yok.
  useEffect(() => {
    if (error) setScanning(false);
  }, [error]);

  return { scanning, setScanning, videoRef, canScan, cameraError: error };
}
