// ============================================================================
// Dil algılama sözleşmesi.
//
// Kullanıcı isteği: "Yeni kullanıcı üye olurken ilk olarak dil seçebilmeli.
// Hatta telefonun dili neyse o default olarak gelmeli." Bu dosya o cümlenin
// ilk yarısını (varsayılan) sabitler: cihaz dili desteklenen üç dilden biriyse
// o dil seçili gelir, aksi hâlde EN'e düşer — asla "rastgele ilk dil" olmaz.
//
// İkinci yarı (kullanıcı değiştirebilir) `LanguagePicker` + `setLang` işi ve
// ayarlar/kayıt ekranından aynı bileşenle çağrılıyor.
// ============================================================================
import { describe, expect, it } from "vitest";
import { DEFAULT_LANG, SUPPORTED_LANGS, pickLang } from "./i18n";

describe("pickLang — cihaz dilinden varsayılan dil", () => {
  it("desteklenen dil ve bölge varyantlarını tanır", () => {
    expect(pickLang("tr")).toBe("tr");
    expect(pickLang("tr-TR")).toBe("tr");
    expect(pickLang("tr_TR")).toBe("tr"); // bazı tarayıcılar alt çizgi verir
    expect(pickLang("en")).toBe("en");
    expect(pickLang("en-US")).toBe("en");
    expect(pickLang("en-GB")).toBe("en");
    expect(pickLang("pl")).toBe("pl");
    expect(pickLang("pl-PL")).toBe("pl");
  });

  it("büyük/küçük harf farkını yok sayar", () => {
    expect(pickLang("TR-tr")).toBe("tr");
    expect(pickLang("EN-us")).toBe("en");
  });

  it("desteklenmeyen dil EN'e düşer (ilk desteklenen dile DEĞİL)", () => {
    expect(pickLang("de-DE")).toBe("en");
    expect(pickLang("ar")).toBe("en");
    expect(pickLang("zh-Hans-CN")).toBe("en");
  });

  it("boş/eksik değerde EN döner", () => {
    expect(pickLang("")).toBe(DEFAULT_LANG);
    expect(pickLang(null)).toBe(DEFAULT_LANG);
    expect(pickLang(undefined)).toBe(DEFAULT_LANG);
  });

  it("EN varsayılan ve üç dil listesi sabittir", () => {
    expect(DEFAULT_LANG).toBe("en");
    expect([...SUPPORTED_LANGS]).toEqual(["en", "tr", "pl"]);
  });
});
