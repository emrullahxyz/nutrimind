import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { guessDeviceClass, isStandalone, parsePx, SAFE_AREA_PROBE_PADDING } from "./safeArea";
import type { ViewportFacts } from "./safeArea";

// ============================================================================
// ÖLÇÜLMÜŞ BUG (iPhone, standalone): tam ekran sheet'lerin başlığı status bar'ın
// altına giriyordu — geri/kapat düğmeleri hem "çok yukarda" görünüyor hem
// TIKLANMIYORDU (dokunmayı sistem alıyor). Kök neden bir CSS sınıfı değil,
// OLMAYAN bir CSS sınıfıydı: `Modal.tsx` `pad-safe-top` kullanıyordu ve bu sınıf
// hiçbir yerde tanımlı değildi — sınıf listesinde durduğu için kod OKUNURKEN
// doğru görünüyordu, tip denetimi ve testler sessizdi.
//
// L22'nin kuralı: "bu hata sınıfını yakalayan şey dikkat değil, otomatik kapıdır."
// Aşağıdaki `gate` bloğu tam olarak o kapı: JSX'te kullanılan her `pad-safe*`
// sınıfının index.css'te tanımlı olmasını ZORUNLU kılar. Bu test yazılı olsaydı
// hata ürüne hiç çıkmazdı.
// ============================================================================

// Vitest proje kökünden çalışır; dosya tarayan kapı testi bu yüzden cwd'ye dayanır.
const root = process.cwd();
const cssPath = join(root, "src", "index.css");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

const css = readFileSync(cssPath, "utf8");
const sourceFiles = walk(join(root, "src")).filter((p) => !/\.test\.tsx?$/.test(p));

/** Yorumlar taranmaz: geçmiş bir hatayı ANLATAN yorum, hatanın kendisi değildir
 *  (`pad-safe-top` neden öldüğünü yazan bir notu yasaklamak kapıyı yanlış
 *  yere koymak olurdu). check-i18n.mjs de aynı gerekçeyle yorumları siler. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("safe-area kapısı (CSS sınıfı ↔ kullanım)", () => {
  const defined = new Set<string>();
  for (const m of css.matchAll(/\.(pad-safe[\w-]*)\s*[,{]/g)) defined.add(m[1]);

  it("index.css inset değişkenlerini tanımlar (tek kaynak)", () => {
    expect(css).toContain("--sat: env(safe-area-inset-top");
    expect(css).toContain("--sab: env(safe-area-inset-bottom");
  });

  it("kullanılan her pad-safe* sınıfı index.css'te TANIMLI", () => {
    const used = new Map<string, string[]>();
    for (const file of sourceFiles) {
      if (!file.endsWith(".tsx")) continue;
      const text = stripComments(readFileSync(file, "utf8"));
      for (const m of text.matchAll(/\bpad-safe[\w-]*/g)) {
        const list = used.get(m[0]) ?? [];
        if (!list.includes(file)) list.push(file);
        used.set(m[0], list);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const [cls, files] of used) {
      expect(
        defined.has(cls),
        `"${cls}" JSX'te kullanılıyor ama index.css'te tanımlı değil — sınıf sessizce ` +
          `hiçbir şey yapmaz (kullanıldığı yerler: ${files.map((f) => f.slice(root.length + 1)).join(", ")})`,
      ).toBe(true);
    }
  });

  it("ölü isim `pad-safe-top` bir daha geçmez (bir kez ürüne çıktı)", () => {
    // CSS'te de yalnızca KURAL aranır: `pad-safe-top`un neden öldüğünü anlatan
    // yorum bu dosyada duruyor ve durmalı.
    expect(stripComments(css)).not.toContain("pad-safe-top");
    for (const file of sourceFiles) {
      if (!file.endsWith(".tsx")) continue;
      expect(stripComments(readFileSync(file, "utf8"))).not.toContain("pad-safe-top");
    }
  });

  it("bileşenler ham env(safe-area-inset-*) yazmaz — değişken/sınıf kullanır", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (!file.endsWith(".tsx")) continue;
      if (/env\(safe-area-inset-/.test(readFileSync(file, "utf8"))) {
        offenders.push(file.slice(root.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("viewport'a sabitlenen (fixed inset-0 + h-[100dvh]) her yüzey alt safe-area taşır", () => {
    const missing: string[] = [];
    for (const file of sourceFiles) {
      if (!file.endsWith(".tsx")) continue;
      const text = stripComments(readFileSync(file, "utf8"));
      // `min-h-[100dvh]` SAYILMAZ: kök kabuğun içinde kalan, kaydırılabilen
      // ekranlar (AuthScreen, Skeleton) inset'i kökün dolgusundan alır.
      const isViewportPinned = /fixed inset-0/.test(text) && /(?:^|[\s"'`])h-\[100dvh\]/.test(text);
      if (!isViewportPinned) continue;
      // Alt sınıf: `pad-safe-b*` ya da taban `pad-safe` (kendisi alt boşluktur).
      const hasBottom = text.includes("pad-safe-b") || /pad-safe["\s`]/.test(text);
      if (!hasBottom) missing.push(file.slice(root.length + 1));
    }
    expect(missing).toEqual([]);
  });

  it("üst boşluk sınıfları inset + satır dolgusunu birlikte verir", () => {
    expect(css).toContain("padding-top: calc(var(--sat) + 0.875rem)");
    expect(css).toContain("padding-top: calc(var(--sat) + 0.75rem)");
  });

  it("prob, insetin kendisini kullanır (kopyası değil)", () => {
    expect(SAFE_AREA_PROBE_PADDING).toBe("var(--sat) var(--sar) var(--sab) var(--sal)");
  });
});

describe("parsePx", () => {
  it("px değerini sayıya çevirir", () => {
    expect(parsePx("59px")).toBe(59);
    expect(parsePx("34.5px")).toBe(34.5);
    expect(parsePx("0px")).toBe(0);
  });

  it("ayrıştırılamayan değerde 0 döner (CSS dışı girdi ölçümü bozmasın)", () => {
    expect(parsePx("")).toBe(0);
    expect(parsePx("auto")).toBe(0);
    expect(parsePx(undefined as unknown as string)).toBe(0);
  });
});

describe("isStandalone", () => {
  const win = (opts: { display?: boolean; standalone?: boolean }) =>
    ({
      matchMedia: () => ({ matches: opts.display === true }),
      navigator: { standalone: opts.standalone },
    }) as unknown as Window;

  it("display-mode: standalone eşleşmesini tanır", () => {
    expect(isStandalone(win({ display: true }))).toBe(true);
  });

  it("iOS'un navigator.standalone bayrağını tanır", () => {
    expect(isStandalone(win({ standalone: true }))).toBe(true);
  });

  it("ikisi de yoksa tarayıcı modu", () => {
    expect(isStandalone(win({}))).toBe(false);
  });
});

describe("guessDeviceClass", () => {
  const facts = (width: number, height: number): ViewportFacts => ({
    width,
    height,
    dpr: 3,
    screenWidth: width,
    screenHeight: height,
    visualHeight: height,
    standalone: true,
    emulate: null,
  });

  it("büyük ekran iPhone'u (arkadaşın cihaz sınıfı) tanır", () => {
    const c = guessDeviceClass(facts(430, 932), { top: 59, right: 0, bottom: 34, left: 0 });
    expect(c.family).toContain("iPhone 14 Pro Max");
    expect(c.insetTop).toBe(59);
    expect(c.size).toBe("430x932");
  });

  it("yatay ölçüde de doğru aileyi bulur (normalize eder)", () => {
    const c = guessDeviceClass(facts(932, 430), { top: 59, right: 0, bottom: 21, left: 59 });
    expect(c.family).toContain("iPhone 14 Pro Max");
  });

  it("uydurmaz: tanınmayan telefon ölçüsü 'unknown phone class' der", () => {
    const c = guessDeviceClass(facts(700, 1000), { top: 0, right: 0, bottom: 0, left: 0 });
    expect(c.family).toBe("unknown phone class");
  });

  it("tablet ölçüsünü ayrı sınıflar", () => {
    const c = guessDeviceClass(facts(1024, 1366), { top: 24, right: 0, bottom: 20, left: 0 });
    expect(c.family).toBe("tablet / desktop class");
  });
});
