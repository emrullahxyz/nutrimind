// ============================================================================
// Nutrimind — DEV-ONLY: sahte kamera cihazları (iOS senaryoları).
//
// NEDEN: "ön kamera açıldı, arkaya geçemedik" arızasının iki aday mekanizması
// (ideal `facingMode`'un yok sayılması · `getSettings().deviceId` gelmemesi)
// GERÇEK iPhone olmadan ÜRETİLEMİYOR. Üretilemeyen arıza düzeltilemez de —
// bu yüzden iOS davranışını taklit eden bir senaryo katmanı var: arıza önce
// burada KIRMIZI olur, düzeltmeyle YEŞİLE döner, aynı senaryo birim testte de
// saf mantık olarak koşar (bkz. camera.test.ts + camera.ts'teki resolveCameraPick).
//
// `?emulate=island&camera=ios-first-front` ile açılır. Üretimde bu modülün
// yan etkisi yoktur (`import.meta.env.DEV` kapısı iosEmulate.ts'te).
// ============================================================================

export type CameraScenarioId = "off" | "ios-first-front" | "ios-no-deviceid" | "android-good";

interface FakeDevice {
  id: string;
  label: string;
  facing: "environment" | "user";
}

interface Scenario {
  /** İlk `getUserMedia` çağrısında yön kısıtı YOK SAYILIR (iOS'ta bildirilen). */
  ignoreFacingOnFirstCall: boolean;
  /** `track.getSettings()` içinde `deviceId` hiç gelmez. Etiket/ID'lerin izinden
   *  ÖNCE boş dönmesi her senaryoda ortak (gerçek davranış), ayrı bayrak değil. */
  omitSettingsDeviceId: boolean;
  devices: FakeDevice[];
}

const IOS_DEVICES: FakeDevice[] = [
  { id: "ios-front", label: "Front Camera", facing: "user" },
  { id: "ios-back", label: "Back Camera", facing: "environment" },
  { id: "ios-back-dual", label: "Back Dual Wide Camera", facing: "environment" },
  { id: "ios-back-ultra", label: "Back Ultra Wide Camera", facing: "environment" },
];

const ANDROID_DEVICES: FakeDevice[] = [
  { id: "cam2-0", label: "camera2 0, facing back", facing: "environment" },
  { id: "cam2-1", label: "camera2 1, facing front", facing: "user" },
  { id: "cam2-2", label: "camera2 2, facing back", facing: "environment" },
];

export const SCENARIOS: Record<Exclude<CameraScenarioId, "off">, Scenario> = {
  // Bildirilen arıza: ilk çağrı ön kamerayı verir, settings'te deviceId yoktur.
  "ios-first-front": {
    ignoreFacingOnFirstCall: true,
    omitSettingsDeviceId: true,
    devices: IOS_DEVICES,
  },
  // Aynı arızanın ikinci yarısı tek başına: yalnızca deviceId gelmez.
  "ios-no-deviceid": {
    ignoreFacingOnFirstCall: false,
    omitSettingsDeviceId: true,
    devices: IOS_DEVICES,
  },
  // Doğru davranan cihaz referansı (düzeltme bunu BOZMAMALI).
  "android-good": {
    ignoreFacingOnFirstCall: false,
    omitSettingsDeviceId: false,
    devices: ANDROID_DEVICES,
  },
};

export function parseCameraScenarioParam(search: string): CameraScenarioId | null {
  const raw = /[?&]camera=([^&]+)/.exec(search ?? "")?.[1];
  if (!raw) return null;
  const value = decodeURIComponent(raw).trim().toLowerCase();
  return value in SCENARIOS || value === "off" ? (value as CameraScenarioId) : null;
}

/** Taklit açık ama `camera=` verilmemişse: bildirilen arıza senaryosu. */
export function cameraScenarioFor(mode: string | null | undefined, search: string): CameraScenarioId {
  const explicit = parseCameraScenarioParam(search);
  if (explicit) return explicit;
  return mode && mode !== "off" ? "ios-first-front" : "off";
}

// --- Uygulama ----------------------------------------------------------------

interface Originals {
  getUserMedia?: MediaDevices["getUserMedia"];
  enumerateDevices?: MediaDevices["enumerateDevices"];
  getSupportedConstraints?: MediaDevices["getSupportedConstraints"];
}

interface FakeState {
  scenario: Scenario;
  granted: boolean;
  calls: number;
  timers: Set<number>;
  originals: Originals;
}

let state: FakeState | null = null;

function draw(canvas: HTMLCanvasElement, label: string, tick: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const isFront = /front/i.test(label);
  ctx.fillStyle = isFront ? "#2b1d2a" : "#101a16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  ctx.font = "40px monospace";
  ctx.fillStyle = "#9aa0a6";
  ctx.fillText(`fake stream · ${tick}`, canvas.width / 2, canvas.height / 2 + 70);
}

/** Gerçek bir MediaStream (canvas) üretir ve iOS'un eksik bıraktığı alanları
 *  taklit eder. Gerçek tarayıcı API'si kullanılır — böylece `<video>` yolu,
 *  `play()`, `videoWidth` ve `applyConstraints` gerçekten çalışır. */
function makeStream(sc: Scenario, device: FakeDevice, tick: number): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  draw(canvas, device.label, tick);
  const stream = canvas.captureStream(10);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { stop: () => void };

  try {
    Object.defineProperty(track, "label", { get: () => device.label, configurable: true });
  } catch {
    /* dondurulmuş obje — etiket taklidi olmadan devam */
  }

  const realStop = track.stop.bind(track);
  Object.defineProperty(track, "stop", {
    configurable: true,
    value: () => {
      if (state) {
        for (const timer of state.timers) window.clearInterval(timer);
        state.timers.clear();
      }
      realStop();
    },
  });

  const settings: MediaTrackSettings = {
    width: canvas.width,
    height: canvas.height,
    frameRate: 10,
    facingMode: device.facing,
  };
  if (!sc.omitSettingsDeviceId) settings.deviceId = device.id;
  Object.defineProperty(track, "getSettings", { configurable: true, value: () => ({ ...settings }) });
  Object.defineProperty(track, "getCapabilities", {
    configurable: true,
    value: () => ({ facingMode: [device.facing], width: { max: canvas.width }, height: { max: canvas.height } }),
  });
  Object.defineProperty(track, "applyConstraints", {
    configurable: true,
    value: async () => {},
  });

  // `canvas.captureStream` statik tuvalde kare üretmeyi garanti etmez: canlı
  // akış olduğunu göstermek için hafif bir yeniden çizim döngüsü kurulur.
  if (state) {
    let n = tick;
    const timer = window.setInterval(() => draw(canvas, device.label, ++n), 250);
    state.timers.add(timer);
  }

  return stream;
}

function pickDevice(sc: Scenario, mode: FakeState, constraints: MediaStreamConstraints): FakeDevice {
  const v = constraints.video;
  const dict = typeof v === "object" && v !== null ? (v as MediaTrackConstraints) : null;
  const all = sc.devices;

  if (dict?.deviceId) {
    const wanted =
      typeof dict.deviceId === "object" && "exact" in dict.deviceId
        ? String(dict.deviceId.exact)
        : String(dict.deviceId);
    const found = all.find((d) => d.id === wanted);
    if (found) return found;
  }

  const wantsBack = dict?.facingMode
    ? /environment|back/i.test(
        typeof dict.facingMode === "object"
          ? String((dict.facingMode as ConstrainDOMStringParameters).ideal ?? "")
          : String(dict.facingMode),
      )
    : true;

  // ARKASI İSTENİYORSA BİLE ilk çağrıda ön kamera: iOS'ta bildirilen davranış.
  if (sc.ignoreFacingOnFirstCall && mode.calls === 0) {
    return all.find((d) => d.facing === "user") ?? all[0];
  }
  if (wantsBack) return all.find((d) => d.facing === "environment") ?? all[0];
  return all.find((d) => d.facing === "user") ?? all[0];
}

/**
 * `navigator.mediaDevices`'i senaryoya göre sarar. Var olan sarmalayıcı önce
 * geri alınır — üst üste kurulum (HMR, hızlı ardışık çağrı) gerçek API'yi
 * kalıcı olarak gölgelememeli.
 */
export function installFakeMediaDevices(mode: string, search?: string): CameraScenarioId {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return "off";
  const id = cameraScenarioFor(mode, search ?? (typeof window === "undefined" ? "" : window.location.search));
  uninstallFakeMediaDevices();
  if (id === "off") return "off";

  const scenario = SCENARIOS[id];
  const md = navigator.mediaDevices;
  const next: FakeState = {
    scenario,
    granted: false,
    calls: 0,
    timers: new Set(),
    originals: {
      getUserMedia: md.getUserMedia?.bind(md) ?? null,
      enumerateDevices: md.enumerateDevices?.bind(md) ?? null,
      getSupportedConstraints: md.getSupportedConstraints?.bind(md) ?? null,
    },
  };
  state = next;

  md.enumerateDevices = async () => {
    const video: MediaDeviceInfo[] = scenario.devices.map((d) => ({
      kind: "videoinput",
      // İzin verilmeden etiket ve ID verilmez — gerçek davranış bu.
      deviceId: next.granted ? d.id : "",
      label: next.granted ? d.label : "",
      groupId: "fake",
      toJSON: () => ({}),
    })) as MediaDeviceInfo[];
    const audio = [
      {
        kind: "audioinput",
        deviceId: next.granted ? "ios-mic" : "",
        label: next.granted ? "iPhone Microphone" : "",
        groupId: "fake",
        toJSON: () => ({}),
      },
    ] as MediaDeviceInfo[];
    return [...audio, ...video];
  };

  md.getSupportedConstraints = () => ({
    ...(next.originals.getSupportedConstraints?.() ?? {}),
    facingMode: true,
    deviceId: true,
    width: true,
    height: true,
    focusMode: true,
  });

  md.getUserMedia = async (constraints: MediaStreamConstraints = {}) => {
    const device = pickDevice(scenario, next, constraints);
    const stream = makeStream(scenario, device, next.calls);
    next.calls += 1;
    next.granted = true;
    return stream;
  };

  return id;
}

export function uninstallFakeMediaDevices(): void {
  const current = state;
  state = null;
  if (!current || typeof navigator === "undefined" || !navigator.mediaDevices) return;
  for (const timer of current.timers) window.clearInterval(timer);
  current.timers.clear();
  const md = navigator.mediaDevices;
  const o = current.originals;
  if (o.getUserMedia) md.getUserMedia = o.getUserMedia;
  if (o.enumerateDevices) md.enumerateDevices = o.enumerateDevices;
  if (o.getSupportedConstraints) md.getSupportedConstraints = o.getSupportedConstraints;
}
