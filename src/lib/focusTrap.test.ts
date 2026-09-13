import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_FOCUS_STACK,
  __resetDialogFocusForTests,
  dialogFocusTop,
  isTopFocusDialog,
  nextTrapIndex,
  popFocusDialog,
  pushFocusDialog,
  registerDialogFocus,
  topFocusDialog,
  unregisterDialogFocus,
} from "./focusTrap";

// Bu test dosyası, `useDialogFocus`'un DOM'a dokunmayan kararlarını kilitler:
// hangi Tab basışında tuzağın müdahale edeceği ve iç içe diyaloglarda Escape'i
// kimin sahiplendiği. Gerçek odak taşıma/tuzak kurma davranışı hook'un işi
// (tarayıcıda ölçülür — proje testleri saf mantıkla sınırlı, bkz. tsconfig).

describe("nextTrapIndex", () => {
  it("hiç odaklanabilir öğe yoksa müdahale etmez", () => {
    expect(nextTrapIndex({ activeIndex: -1, count: 0, backwards: false })).toBeNull();
    expect(nextTrapIndex({ activeIndex: 0, count: 0, backwards: true })).toBeNull();
  });

  it("odak diyaloğun dışındaysa İÇERİ çeker (yön ileri: ilk öğe)", () => {
    expect(nextTrapIndex({ activeIndex: -1, count: 3, backwards: false })).toBe(0);
  });

  it("odak diyaloğun dışındaysa İÇERİ çeker (yön geri: son öğe)", () => {
    expect(nextTrapIndex({ activeIndex: -1, count: 3, backwards: true })).toBe(2);
  });

  it("ortada Tab'a karışmaz — tarayıcının kendi davranışı doğru", () => {
    expect(nextTrapIndex({ activeIndex: 1, count: 3, backwards: false })).toBeNull();
    expect(nextTrapIndex({ activeIndex: 1, count: 3, backwards: true })).toBeNull();
  });

  it("son öğede Tab başa sarar", () => {
    expect(nextTrapIndex({ activeIndex: 2, count: 3, backwards: false })).toBe(0);
  });

  it("ilk öğede Shift+Tab sona sarar", () => {
    expect(nextTrapIndex({ activeIndex: 0, count: 3, backwards: true })).toBe(2);
  });

  it("tek öğe varsa her iki yönde de kendisine sarar", () => {
    expect(nextTrapIndex({ activeIndex: 0, count: 1, backwards: false })).toBe(0);
    expect(nextTrapIndex({ activeIndex: 0, count: 1, backwards: true })).toBe(0);
  });
});

describe("diyalog yığını (saf)", () => {
  it("iter ve tepeyi bildirir", () => {
    const a = pushFocusDialog(EMPTY_FOCUS_STACK, "a");
    expect(topFocusDialog(a)).toBe("a");
    const ab = pushFocusDialog(a, "b");
    expect(topFocusDialog(ab)).toBe("b");
    expect(isTopFocusDialog(ab, "b")).toBe(true);
    expect(isTopFocusDialog(ab, "a")).toBe(false);
  });

  it("aynı kimliği iki kez itmez (StrictMode çift mount'u sahte kayıt bırakmaz)", () => {
    const a = pushFocusDialog(EMPTY_FOCUS_STACK, "a");
    expect(pushFocusDialog(a, "a")).toHaveLength(1);
  });

  it("tepede OLMAYAN kimliği de düşürür (dış diyalog önce unmount olursa)", () => {
    const stack = pushFocusDialog(pushFocusDialog(EMPTY_FOCUS_STACK, "outer"), "inner");
    const popped = popFocusDialog(stack, "outer");
    expect(popped).toHaveLength(1);
    expect(topFocusDialog(popped)).toBe("inner");
  });

  it("olmayan kimliği düşürmek yığını değiştirmez", () => {
    const stack = pushFocusDialog(EMPTY_FOCUS_STACK, "a");
    expect(popFocusDialog(stack, "yok")).toBe(stack);
  });

  it("boş yığının tepesi yoktur", () => {
    expect(topFocusDialog(EMPTY_FOCUS_STACK)).toBeNull();
    expect(isTopFocusDialog(EMPTY_FOCUS_STACK, "a")).toBe(false);
  });
});

describe("kayıt (modül düzeyi)", () => {
  beforeEach(() => __resetDialogFocusForTests());

  it("Escape sahipliği en son açılan diyaloga geçer, kapanınca bir öncekine döner", () => {
    registerDialogFocus("modal");
    expect(dialogFocusTop()).toBe("modal");
    registerDialogFocus("kart");
    expect(dialogFocusTop()).toBe("kart");
    unregisterDialogFocus("kart");
    expect(dialogFocusTop()).toBe("modal");
    unregisterDialogFocus("modal");
    expect(dialogFocusTop()).toBeNull();
  });
});
