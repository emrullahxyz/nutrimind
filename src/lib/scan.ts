// ============================================================================
// Nutrimind — ScanSheet'in saf mantığı (Faz S3): tetikleyici önerisi + öntanımlı miktar.
//
// İkisi de bilinçli olarak SAF fonksiyon: React'e, kameraya, ağa dokunmuyor —
// yalnızca bir OFF ürününden ("Skyr - jogurt typu islandzkiego z truskawkami")
// forma dolacak makul bir ilk değer türetiyor. Kullanıcı ikisini de değiştirebilir.
// ============================================================================
import { parseNum } from "./nutrition";
import { OFF_SERVING_G } from "./off";
import type { OffFood } from "./off";

/** Uzun raf adının "asıl" kısmını ayıran ilk sınır: " - ", virgül, noktalı
 *  virgül, iki nokta, parantez/eğik çizgi, tire (em/en dash). Boşluksuz "-"
 *  BİLEREK ayraç SAYILMAZ (örn. birleşik kelimeleri bölmesin). */
const SEGMENT_DELIM = /\s+-\s+|[,;:()/]|[–—]/;

/** Kelimenin baş/son ucundaki harf/rakam olmayan karakterleri (noktalama,
 *  tırnak, %) temizler; ortadaki tireyi ("light-fit" gibi) dokunulmadan bırakır. */
function cleanWord(w: string): string {
  return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Ürün adından KISA, DÜZENLENEBİLİR bir tetikleyici önerisi türetir: ilk
 * anlamlı 1-2 kelime, küçük harfe çevrilmiş.
 *
 * Faz 4'te AliasForm'un OFF akışı tetikleyiciyi BİLEREK boş bırakıyordu —
 * "Skyr - jogurt typu islandzkiego z truskawkami" gibi tam raf adını
 * tetikleyici yapmak anlamsız olurdu. Ama boş bırakmak Kaydet'i sessizce
 * kilitliyordu (kullanıcı sebebini göremiyordu). Çözüm: doldurmamak değil,
 * ilk sınıra kadarki KISA kısmı öner — "Skyr - jogurt typu..." -> "skyr".
 * Sınır yoksa (örn. "Skyr Naturalny") ilk iki kelime alınır.
 *
 * Anlamlı kelime YOKSA (yalnızca noktalama/rakam) boş metin döner — form
 * bunu "tetikleyici gerekli" uyarısıyla açıkça göstermeli, sessizce değil.
 */
export function seedTrigger(name: string): string {
  const firstSegment = (name.split(SEGMENT_DELIM)[0] ?? "").trim();
  const words = firstSegment
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return "";
  return words.slice(0, 2).join(" ").toLowerCase();
}

/** "150 g", "1 portion (150 g)" gibi bir metinden ilk gram ipucunu okur.
 *  YALNIZCA öntanımlı miktarı doldurmak için — off.ts'in dediği gibi bu alan
 *  "porsiyon ipucu, hesaba GİRMEZ"; burada da hesaba girmiyor, sadece formun
 *  ilk değerini belirliyor ve kullanıcı istediği gibi değiştirebiliyor. */
function parseGramHint(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (!match) return null;
  const n = parseNum(match[1]);
  return n > 0 ? n : null;
}

/** Onay ekranındaki öntanımlı miktar: ambalaj miktarı ("150 g") ya da porsiyon
 *  metninden ("1 portion (150 g)") bir ipucu varsa o, yoksa OFF'un referans
 *  değeri olan 100 g. */
export function defaultScanGrams(food: Pick<OffFood, "quantity" | "servingSize">): number {
  return parseGramHint(food.quantity) ?? parseGramHint(food.servingSize) ?? OFF_SERVING_G;
}
