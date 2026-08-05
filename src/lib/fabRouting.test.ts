import { describe, expect, it } from "vitest";
import { fabTarget } from "./fabRouting";

// ============================================================================
// Bug: FAB > "Egzersiz Kaydet" her zaman todayISO()'ya yazıyordu, "Bugün"
// sekmesinde WeekStrip'ten dünkü güne gidilmişken bile — kayıt sessizce yanlış
// güne düşüyordu. fabTarget, handleAddMeal/handleScan'de zaten var olan
// (ve doğru olan) "daily sekmesi mi?" ayrımını tek bir yerde toplar; App.tsx
// artık üçü de (Ekle/Tara/Egzersiz) bu fonksiyonu kullanır.
// ============================================================================
describe("fabTarget", () => {
  it("Bugün sekmesindeyken DayView'un yerel (WeekStrip'e bağlı) tetikleyicisine yönlendirir", () => {
    expect(fabTarget("daily")).toBe("daily-local");
  });

  it("diğer her sekmede (WeekStrip bağlamı yok) global/bugün modaline yönlendirir", () => {
    expect(fabTarget("history")).toBe("global-today");
    expect(fabTarget("aliases")).toBe("global-today");
    expect(fabTarget("settings")).toBe("global-today");
  });
});
