import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// ÖLÇÜLMÜŞ BUG (glass tema): açılır yüzeyler okunmuyordu. `[data-theme="glass"]`
// bloğunda `--popover` beyaz RGB üçlüsü + 0.06 alfa ile tanımlıydı; yani cam
// menü neredeyse tamamen saydamdı ve arkasındaki yoğun form satırları menünün
// İÇİNDEN okunuyordu (AliasPicker dropdown'ı, TrendChart tooltip'i).
//
// Tuzak: Tailwind sınıfındaki alfa son eki (`bg-popover/98`) burada İŞE
// YARAMAZ. `tailwind.config.js`'teki `withAlpha` yardımcısı, `<alpha-value>`'yu
// companion `-a` değişkeniyle ÇARPAR:
//   rgb(var(--popover) / calc(var(--popover-a, 1) * <alpha-value>))
// Glass'ta `--popover-a` = 0.06 olduğundan `bg-popover/98` => 0.06 × 0.98 =
// 0.059 verir. Yani opaklığı yalnızca `--popover` ÜÇLÜSÜNÜ veya `--popover-a`
// değerini değiştirmek yükseltir.
//
// Aşağıdaki kapı tam olarak bunu kilitler: glass bloğundaki `--popover` KOYU
// (koyu panel) ve `--popover-a` yarı-saydamdan okunur opaklığa çıkmış olmalı.
// Beyaz-üçlü + düşük-alfa regresyonu bu testle ürüne çıkamaz.
// ============================================================================

// Vitest proje kökünden çalışır; dosyayı tarayan kapı testi bu yüzden cwd'ye dayanır.
const root = process.cwd();
const css = readFileSync(join(root, "src", "index.css"), "utf8");

/** `[data-theme="glass"] { ... }` bloğunu (ilk kapanış brace'ine kadar) çıkarır. */
function glassBlock(source: string): string {
  const m = source.match(/\[data-theme="glass"\]\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('index.css içinde [data-theme="glass"] bloğu bulunamadı');
  return m[1];
}

describe("glass yüzey kapısı (popover okunurluğu)", () => {
  const block = glassBlock(css);

  it("glass `--popover` üçlüsü koyu (beyaz 255 255 255 reddedilir)", () => {
    const m = block.match(/--popover:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/);
    expect(m, "glass bloğunda `--popover` üçlüsü bulunamadı").not.toBeNull();
    const [r, g, b] = [Number(m![1]), Number(m![2]), Number(m![3])];
    // r+g+b < 200: beyaz (765) saydam-cam regresyonu burada PATLAR.
    expect(
      r + g + b,
      `glass --popover koyu olmalı; ${r} ${g} ${b} çok açık (beyaz-üçlü cam menüyü okunmaz yapar)`,
    ).toBeLessThan(200);
  });

  it("glass `--popover-a` okunur opaklıkta (>= 0.5)", () => {
    const m = block.match(/--popover-a:\s*([\d.]+)\s*;/);
    expect(m, "glass bloğunda `--popover-a` bulunamadı").not.toBeNull();
    expect(
      Number(m![1]),
      "glass --popover-a yarı-saydamdan okunur opaklığa çıkmalı (yoksa menü arkasını gösterir)",
    ).toBeGreaterThanOrEqual(0.5);
  });
});
