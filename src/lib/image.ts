export interface CompressedImage {
  base64: string;
  mimeType: string;
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
          opts.quality,
        );
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
