// ============================================================================
// MacroBar'ın KARAR mantığı (`barState`) — render değil, semantik testi.
//
// İki ayrı sözleşme korunuyor:
//   • `target` besinlerin (protein, lif…) davranışı Faz 2'de ZERRE değişmedi.
//   • `limit` besinlerinde (şeker, doymuş yağ, sodyum) "✓ Tamamlandı" HİÇBİR
//     değerde görünmez — sodyum limitine ulaşmak bir başarı değildir.
// ============================================================================
import { describe, expect, it } from "vitest";
import { barState } from "./MacroBar";
import { nutrientOf } from "../lib/nutrients";

const PROTEIN = nutrientOf("protein"); // direction: target
const SODIUM = nutrientOf("sodium"); // direction: limit, mg
const FIBER = nutrientOf("fiber");

describe("barState — target besin (mevcut davranış korunuyor)", () => {
  it("%80 altında kendi rengi ve 'kaldı' metni", () => {
    const s = barState(PROTEIN, 100, 145);
    expect(s.tone).toBe("own");
    expect(s.status).toBe("45,0g kaldı");
    expect(s.isOver).toBe(false);
    expect(s.isMet).toBe(false);
  });
  it("%80-100 arası HÂLÂ kendi rengi (warn yalnızca limit besinlerde)", () => {
    expect(barState(PROTEIN, 130, 145).tone).toBe("own");
    expect(barState(PROTEIN, 144, 145).tone).toBe("own");
  });
  it("%100'de '✓ Tamamlandı'", () => {
    const s = barState(PROTEIN, 145, 145);
    expect(s.isMet).toBe(true);
    expect(s.status).toBe("✓ Tamamlandı");
    expect(s.tone).toBe("own"); // metin accent'e döner, bar kendi renginde kalır
    expect(s.pct).toBe(100);
  });
  it("%100 üstünde danger ve 'aşıldı'", () => {
    const s = barState(PROTEIN, 150, 145);
    expect(s.tone).toBe("danger");
    expect(s.isOver).toBe(true);
    expect(s.status).toBe("+5,0g aşıldı!");
    expect(s.pct).toBe(100); // bar %100'de kırpılır, taşma renkle anlatılır
  });
  it("0,05 epsilon'u korunuyor: 145,04 aşım DEĞİL, tamamlandı", () => {
    const s = barState(PROTEIN, 145.04, 145);
    expect(s.isOver).toBe(false);
    expect(s.isMet).toBe(true);
    expect(barState(PROTEIN, 145.06, 145).isOver).toBe(true);
  });
  it("lif gibi hedefi 0 olan target besinde bar boş kalır (mevcut davranış)", () => {
    const s = barState(FIBER, 12, 0);
    expect(s.hasTarget).toBe(false);
    expect(s.pct).toBe(0);
    expect(s.isOver).toBe(false);
    expect(s.tone).toBe("own");
  });
});

describe("barState — limit besin (Faz 2)", () => {
  it("%80 altında kendi (sessiz) rengi ve 'kullanılabilir' metni", () => {
    const s = barState(SODIUM, 700, 2000); // %35
    expect(s.tone).toBe("own");
    expect(s.status).toBe("1.300mg kullanılabilir");
  });
  it("tam %80'de warn'a döner", () => {
    expect(barState(SODIUM, 1599, 2000).tone).toBe("own"); // %79,95
    expect(barState(SODIUM, 1600, 2000).tone).toBe("warn"); // %80,0
    expect(barState(SODIUM, 1900, 2000).tone).toBe("warn"); // %95
  });
  it("%100'de 'limitte' — ASLA '✓ Tamamlandı'", () => {
    const s = barState(SODIUM, 2000, 2000);
    expect(s.isMet).toBe(true);
    expect(s.status).toBe("limitte");
    expect(s.status).not.toContain("✓");
    expect(s.tone).toBe("warn"); // limitte durmak "başarı yeşili" değildir
  });
  it("%100 üstünde danger ve 'limit aşıldı'", () => {
    const s = barState(SODIUM, 2400, 2000);
    expect(s.tone).toBe("danger");
    expect(s.isOver).toBe(true);
    expect(s.status).toBe("+400mg limit aşıldı!");
  });
  it("hiçbir değerde ✓ görünmez", () => {
    for (let v = 0; v <= 4000; v += 25) {
      expect(barState(SODIUM, v, 2000).status).not.toContain("✓");
      expect(barState(SODIUM, v, 2000).status).not.toContain("Tamamlandı");
    }
  });
  it("limit girilmemişse hüküm yok: bar da metin de yok, danger de yok", () => {
    const s = barState(SODIUM, 1400, 0);
    expect(s.hasTarget).toBe(false);
    expect(s.pct).toBe(0);
    expect(s.isOver).toBe(false);
    expect(s.tone).toBe("own");
    expect(s.status).toBe(""); // "0 mg kullanılabilir" konmamış limite hüküm olurdu
  });
  it("epsilon limit tarafında da geçerli", () => {
    expect(barState(SODIUM, 2000.04, 2000).isOver).toBe(false);
    expect(barState(SODIUM, 2000.06, 2000).isOver).toBe(true);
  });
});
