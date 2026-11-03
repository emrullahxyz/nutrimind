import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraStream } from "./camera";
import { cameraDiag } from "./cameraDiag";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as Array<{ deps: unknown[]; cleanup?: () => void }>,
  pending: [] as Array<() => void>,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (fn: unknown) => fn,
  useRef: (value: unknown) => {
    const index = hooks.cursor++;
    return (hooks.values[index] ??= { current: value });
  },
  useState: (value: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = value;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = hooks.cursor++;
    const previous = hooks.effects[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      hooks.effects[index] = { deps, cleanup: effect() || undefined };
    });
  },
}));

const devices = [
  { kind: "videoinput", deviceId: "front", label: "Front Camera" },
  { kind: "videoinput", deviceId: "back", label: "Back Camera" },
  { kind: "videoinput", deviceId: "ultra", label: "Back Ultra Wide Camera" },
];

function stream(deviceId: string, facingMode: string) {
  const track = {
    stop: vi.fn(),
    getSettings: () => ({ deviceId, facingMode, width: 1280, height: 720 }),
    applyConstraints: async () => {},
  };
  return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
}

let video: { srcObject: MediaStream | null; videoWidth: number; play: () => Promise<void> };
function render(active = true) {
  hooks.cursor = 0;
  const result = useCameraStream(active);
  result.videoRef.current = video as unknown as HTMLVideoElement;
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}

beforeEach(() => {
  hooks.values = [];
  hooks.effects = [];
  hooks.pending = [];
  cameraDiag.clear();
  video = { srcObject: null, videoWidth: 1280, play: async () => {} };
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
});

afterEach(() => {
  hooks.effects.forEach((effect) => effect?.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function media(getUserMedia: ReturnType<typeof vi.fn>, list = devices) {
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia, enumerateDevices: async () => list },
  });
}

async function settle() {
  await vi.runAllTimersAsync();
  return render();
}

describe("useCameraStream acquisition", () => {
  it("uses strict facing after a failed device request and wrong-facing fallback", async () => {
    const front = stream("front", "user");
    const fallback = stream("front", "user");
    const back = stream("back", "environment");
    const acquire = vi.fn()
      .mockResolvedValueOnce(front)
      .mockRejectedValueOnce(new DOMException("busy", "NotReadableError"))
      .mockResolvedValueOnce(fallback)
      .mockResolvedValueOnce(back)
      .mockResolvedValue(back);
    media(acquire);
    render();
    expect((await settle()).ready).toBe(true);
    expect(video.srcObject).toBe(back);
    expect(acquire.mock.calls[3]?.[0].video.facingMode).toEqual({ exact: "environment" });
    expect(fallback.getTracks()[0].stop).toHaveBeenCalled();
    expect(cameraDiag.entries().map((entry) => entry.requested)).toEqual([
      "facingMode.ideal=environment", "deviceId.exact=back",
      "facingMode.ideal=environment", "facingMode.exact=environment",
    ]);
    render(false);
    render(true);
    await settle();
    expect(acquire.mock.calls[4]?.[0].video.deviceId).toEqual({ exact: "back" });
  });

  it("does not attach a measured wrong-facing final stream or retry forever", async () => {
    const front = stream("front", "user");
    const acquire = vi.fn().mockImplementation(async () => stream("front", "user"));
    acquire.mockResolvedValueOnce(front);
    media(acquire, devices.map((device) => ({ ...device, label: "Unknown Camera" })));
    render();
    const result = await settle();
    expect(result.ready).toBe(false);
    expect(result.error).not.toBeNull();
    expect(video.srcObject).toBeNull();
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it("preserves the observed fallback lens rather than caching the unavailable target", async () => {
    const acquire = vi.fn()
      .mockResolvedValueOnce(stream("ultra", "environment"))
      .mockRejectedValueOnce(new DOMException("gone", "OverconstrainedError"))
      .mockResolvedValue(stream("ultra", "environment"));
    media(acquire);
    render();
    await settle();
    const fallbackEntry = cameraDiag.entries().at(-1);
    expect(fallbackEntry?.requested).toBe("facingMode.ideal=environment");
    render(false);
    render(true);
    await settle();
    expect(acquire.mock.calls[3]?.[0].video.deviceId).toBeUndefined();
  });

  it("retains single-webcam fallback even when rear facing is unavailable", async () => {
    const webcam = stream("webcam", "user");
    const acquire = vi.fn()
      .mockResolvedValueOnce(webcam)
      .mockRejectedValueOnce(new DOMException("no rear", "OverconstrainedError"))
      .mockResolvedValue(webcam);
    media(acquire, [{ kind: "videoinput", deviceId: "webcam", label: "Integrated Camera" }]);
    render();
    expect((await settle()).ready).toBe(true);
    expect(video.srcObject).toBe(webcam);
    expect(acquire).toHaveBeenCalledTimes(3);
  });

  it("does not request fallback after a cached acquisition was cancelled", async () => {
    let rejectPending!: (error: Error) => void;
    const acquire = vi.fn()
      .mockResolvedValueOnce(stream("back", "environment"))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPending = reject; }))
      .mockResolvedValue(stream("back", "environment"));
    media(acquire);
    render();
    await settle();
    render(false);
    render(true);
    render(false);
    rejectPending(new Error("device gone"));
    await vi.runAllTimersAsync();
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it("releases the local stream if page hides before focus setup finishes", async () => {
    let finishFocus!: () => void;
    const active = stream("back", "environment");
    active.getVideoTracks()[0].applyConstraints = () => new Promise<void>((resolve) => { finishFocus = resolve; });
    media(vi.fn().mockResolvedValue(active));
    render();
    await vi.runAllTimersAsync();
    Object.assign(document, { hidden: true });
    document.dispatchEvent(new Event("visibilitychange"));
    finishFocus();
    await vi.runAllTimersAsync();
    expect(active.getTracks()[0].stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it("records initial acquisition failures with their actual constraints", async () => {
    media(vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")));
    render();
    expect((await settle()).error).not.toBeNull();
    expect(cameraDiag.entries()[0]).toMatchObject({
      attempt: 1, requested: "facingMode.ideal=environment", result: "failed",
    });
  });
});
