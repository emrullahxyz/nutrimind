import { describe, expect, it } from "vitest";
import { PRESS_GATE_RELEASE_MS, armGate, gateReact } from "./pressGate";

describe("armGate / gateReact", () => {
  it("kapı kapalıyken hiçbir olay yutulmaz", () => {
    expect(gateReact(null, { kind: "click", detail: 1 }, 1000)).toEqual({
      gate: null,
      swallow: false,
    });
  });

  it("kapıyı doğuran basışın `click`i yutulur ve kapı kapanır", () => {
    const gate = armGate(7);
    const result = gateReact(gate, { kind: "click", detail: 1 }, 1300);
    expect(result.swallow).toBe(true);
    expect(result.gate).toBeNull();
  });

  it("basılı fazda zaman aşımı YOK: uzun tutmak kapıyı kapatmaz", () => {
    const gate = armGate(7);
    // 10 saniye sonra bile (hiç pointerup gelmediyse) kapı hâlâ açık.
    const result = gateReact(gate, { kind: "click", detail: 1 }, 11000);
    expect(result.swallow).toBe(true);
  });

  it("parmak kalkışı kapıyı KAPATMAZ — `click` ondan sonra gelir", () => {
    const gate = armGate(7);
    const after = gateReact(gate, { kind: "pointerup", pointerId: 7 }, 1200);
    expect(after.swallow).toBe(false);
    expect(after.gate?.released).toBe(true);
    // ve sıradaki tıklama hâlâ yutulur (sızıntının asıl anı)
    expect(gateReact(after.gate, { kind: "click", detail: 1 }, 1210).swallow).toBe(true);
  });

  it("bırakma sonrası `click` hiç gelmezse kapı zaman aşımıyla kapanır", () => {
    const released = gateReact(armGate(7), { kind: "pointerup", pointerId: 7 }, 1000).gate;
    const late = gateReact(released, { kind: "click", detail: 1 }, 1000 + PRESS_GATE_RELEASE_MS + 1);
    expect(late.gate).toBeNull();
    expect(late.swallow).toBe(false);
  });

  it("başka bir parmağın kalkması kapıyı bozmaz", () => {
    const gate = armGate(7);
    const after = gateReact(gate, { kind: "pointerup", pointerId: 9 }, 1200);
    expect(after.gate?.released).not.toBe(true);
    expect(after.swallow).toBe(false);
  });

  it("yeni `pointerdown` kapıyı kapatır: bilinçli dokunuş engellenmez", () => {
    const gate = armGate(7);
    const result = gateReact(gate, { kind: "pointerdown", pointerId: 11 }, 1400);
    expect(result.gate).toBeNull();
    expect(result.swallow).toBe(false);
    // sonraki tıklama artık normal çalışır
    expect(gateReact(result.gate, { kind: "click", detail: 1 }, 1450).swallow).toBe(false);
  });

  it("klavye/yardımcı teknoloji tıklaması (detail 0) yutulmaz, kapı açık kalır", () => {
    const gate = armGate(null);
    const result = gateReact(gate, { kind: "click", detail: 0 }, 1100);
    expect(result.swallow).toBe(false);
    expect(result.gate).not.toBeNull();
  });

  it("`pointercancel` kapıyı ikinci faza alır (tarayıcı basışı iptal etti)", () => {
    const result = gateReact(armGate(3), { kind: "pointercancel", pointerId: 3 }, 1050);
    expect(result.gate?.released).toBe(true);
  });
});
