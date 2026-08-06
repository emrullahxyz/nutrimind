export interface CompressedImage {
  base64: string;
  mimeType: string;
}

/** `camera.ts`'in `Rect`'i ile yapısal olarak uyumlu. Burada ayrıca tanımlı çünkü
 *  bu dosya React'e (dolayısıyla `camera.ts`'e) bağımlı değil ve öyle kalmalı. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ortak son adım: canvas → JPEG → base64 (data: öneki OLMADAN).
 *  Sunucu yalnızca image/jpeg|png|webp kabul ediyor (`server/ai.js`'in
 *  `VALID_IMAGE_MIME`'ı); burada her zaman JPEG üretiyoruz. */
function canvasToBase64(canvas: HTMLCanvasElement, quality: number): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("görsel sıkıştırılamadı"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          resolve({ base64, mimeType: "image/jpeg" });
        };
        reader.onerror = () => reject(new Error("görsel okunamadı"));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/** Bir dosyayı canvas ile ölçekleyip JPEG'e sıkıştırır, base64 (data: öneki
 *  OLMADAN) döner. Tarayıcı-native API'ler (Image/canvas/FileReader) — yeni
 *  bağımlılık YOK. `maxDim`'in üstündeyse en-boy oranı korunarak küçültülür,
 *  altındaysa BÜYÜTÜLMEZ. */
export function compressImageToBase64(
  file: File,
  opts: { maxDim: number; quality: number },
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, opts.maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas context alınamadı"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvasToBase64(canvas, opts.quality).then(resolve, reject);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("görsel yüklenemedi"));
    };
    img.src = objectUrl;
  });
}

/**
 * CANLI kameradan tek kare yakalar. `compressImageToBase64`'ün kardeşi — o bir
 * `File` alıyor, bu `<video>`'nun o anki karesini alıyor.
 *
 * `crop` verilirse kare o bölgeye kırpılır. Asist çerçevesinin asıl işlevi bu:
 * model tüm sahne yerine yalnızca etiketi/tabağı görünce sonuç belirgin biçimde
 * iyileşiyor (çerçeve → video pikseli dönüşümü için `camera.ts`'in `cropRectFor`'u).
 */
export function captureVideoFrame(
  video: HTMLVideoElement,
  opts: { maxDim: number; quality: number; crop?: CropRect },
): Promise<CompressedImage> {
  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  // Akış bağlandığı anda değil, ilk kare çözüldüğünde ölçü gelir.
  if (!srcW || !srcH) {
    return Promise.reject(new Error("Kamera karesi henüz hazır değil — bir saniye bekleyip tekrar dene."));
  }

  const crop = opts.crop ?? { x: 0, y: 0, width: srcW, height: srcH };
  const scale = Math.min(1, opts.maxDim / Math.max(crop.width, crop.height));
  const w = Math.max(1, Math.round(crop.width * scale));
  const h = Math.max(1, Math.round(crop.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas context alınamadı"));

  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
  return canvasToBase64(canvas, opts.quality);
}
