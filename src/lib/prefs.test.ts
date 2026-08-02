import { describe, expect, it } from "vitest";
import { parseBoolPref, readBoolPref, writeBoolPref, PREF } from "./prefs";

describe("parseBoolPref", () => {
  it("parses '1' ve 'true' olarak true", () => {
    expect(parseBoolPref("1", false)).toBe(true);
    expect(parseBoolPref("true", false)).toBe(true);
  });

  it("parses '0' ve 'false' olarak false", () => {
    expect(parseBoolPref("0", true)).toBe(false);
    expect(parseBoolPref("false", true)).toBe(false);
  });

  it("tanınmayan/null değerde fallback döner", () => {
    expect(parseBoolPref(null, true)).toBe(true);
    expect(parseBoolPref(null, false)).toBe(false);
    expect(parseBoolPref("garbage", true)).toBe(true);
  });
});

describe("readBoolPref / writeBoolPref (node ortamında localStorage yok)", () => {
  it("localStorage yokken readBoolPref fallback döner, throw etmez", () => {
    expect(() => readBoolPref(PREF.supplementsOpen, true)).not.toThrow();
    expect(readBoolPref(PREF.supplementsOpen, true)).toBe(true);
    expect(readBoolPref(PREF.microsOpen, false)).toBe(false);
  });

  it("localStorage yokken writeBoolPref sessizce hiçbir şey yapmaz, throw etmez", () => {
    expect(() => writeBoolPref(PREF.supplementsOpen, true)).not.toThrow();
  });
});
