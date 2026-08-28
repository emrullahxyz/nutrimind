import { afterEach, describe, expect, it, vi } from "vitest";
import { isBrowserOffline } from "./netStatus";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isBrowserOffline", () => {
  it("navigator.onLine false ise çevrimdışı der", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isBrowserOffline()).toBe(true);
  });
  it("navigator.onLine true ise çevrimiçi der", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isBrowserOffline()).toBe(false);
  });
  it("onLine tanımsızsa (Node ortamı) çevrimdışı SAYMAZ", () => {
    vi.stubGlobal("navigator", {});
    expect(isBrowserOffline()).toBe(false);
  });
  it("navigator hiç yoksa çevrimdışı saymaz", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isBrowserOffline()).toBe(false);
  });
});