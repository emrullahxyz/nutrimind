import { describe, expect, it } from "vitest";
import { formatMicroOrDash } from "./format";

// ============================================================================
// Bug: NutritionSheet, girilmemiş (undefined) Doymuş Yağ/Sodyum/Şeker
// değerlerini "0g"/"0mg" olarak gösteriyordu — "Bilinmiyor ≠ sıfır" çekirdek
// kuralını çiğniyordu. formatMicroOrDash bu ayrımı tek bir yerde uygular
// (bkz. MicroCardGrid'in isUndefined deseni, aynı kural).
// ============================================================================
describe("formatMicroOrDash", () => {
  it("girilmemiş (undefined) değer için '—' döner, ASLA '0<birim>' değil", () => {
    expect(formatMicroOrDash(undefined, "g")).toBe("—");
    expect(formatMicroOrDash(undefined, "mg")).toBe("—");
  });

  it("açıkça girilen 0 gerçek bir veridir — '—' değil '0<birim>' gösterir", () => {
    expect(formatMicroOrDash(0, "g")).toBe("0g");
    expect(formatMicroOrDash(0, "mg")).toBe("0mg");
  });

  it("değeri birimiyle birlikte biçimlendirir", () => {
    expect(formatMicroOrDash(12.5, "g")).toBe("12.5g");
    expect(formatMicroOrDash(340, "mg")).toBe("340mg");
  });
});
