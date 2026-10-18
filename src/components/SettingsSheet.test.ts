// ============================================================================
// Egzersiz Kütüphanesi dönüş davranışı — "+ Egzersiz ekle" yolundan girildiğinde
// Geri/Bitti Ayarlar'da KALMAZ, egzersiz kaydetme modalına döner; Ayarlar
// menüsünden girildiğinde normal geri (Ayarlar'a döner). Karar App.tsx'te prop
// verilip verilmemesiyle (`settingsTarget === "exercise"`) kurulur ve
// SettingsSheet'in popstate handler'ında uygulanır.
//
// jsdom yok → kaynak taraması (repo deseni, bkz. ExerciseModal.test.ts).
// ============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SETTINGS_SRC = readFileSync(
  join(process.cwd(), "src", "components", "SettingsSheet.tsx"),
  "utf8",
);
const APP_SRC = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");

describe("egzersiz kütüphanesi dönüş davranışı", () => {
  it("App yalnız '+ Egzersiz ekle' yolundan (settingsTarget === 'exercise') prop bağlar", () => {
    // Ayarlar menüsünden girildiğinde prop VERİLMEZ → normal geri. Koşullu
    // bağlama olmazsa menü yolu da egzersiz modalına dönerdi (yanlış).
    expect(APP_SRC).toMatch(
      /onExitExerciseLibrary=\{settingsTarget === "exercise" \? closeExerciseLibrary : undefined\}/,
    );
  });

  it("SettingsSheet exercise + prop verilmişken popstate'te erken döner (Ayarlar'a inmez)", () => {
    // `subViewRef` pop ÖNCESİ değeri taşır — "exercise" ise ve çıkış callback'i
    // verilmişse `setSubView` çağrılmadan geri döner (egzersiz modalına dönüş).
    expect(SETTINGS_SRC).toMatch(
      /subViewRef\.current === "exercise" && exitLibraryRef\.current/,
    );
    // Stale closure önlemi: `[]` bağımlılıklı efekt güncel değeri ref'ten okur.
    expect(SETTINGS_SRC).toContain("exitLibraryRef");
    expect(SETTINGS_SRC).toContain("subViewRef");
  });

  it("'Bitti' düğmesi yalnız egzersiz yolunda görünür + goBack ile aynı yolu kullanır", () => {
    // Düğme Geri ile AYNI `goBack` (history.back) yolundan çıkar → geçmişte
    // sarkan girdi kalmaz (zombi-modal sınıfına girmez).
    expect(SETTINGS_SRC).toMatch(/subView === "exercise" && onExitExerciseLibrary/);
    expect(SETTINGS_SRC).toContain('t("common.done")');
  });
});
