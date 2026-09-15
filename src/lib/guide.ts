// ============================================================================
// Nutrimind — ilk kullanım rehberi (coach-mark turu) KARARLARI.
//
// Bu dosya BİLEREK saf: DOM yok, React yok, `window` yok. Rehberin "gösterilsin
// mi" ve "daha önce bitirildi mi" sorularının tamamı burada karara bağlanır ki
// (1) tarayıcı olmadan test edilebilsin, (2) App.tsx yalnızca DOM/yan etki
// kablosunu taşısın. Aynı ayrım `anchor.ts`, `backStack.ts` ve `overlayLock.ts`
// için de geçerli — projenin yerleşik deseni bu.
//
// NEDEN HESAP BAZLI: rehber durumu `config.guide` anahtarında saklanır; config
// satırları sunucuda `user_id` ile kapsamlanıyor (`server/index.js`), yani aynı
// hesaba başka bir cihazdan girildiğinde rehber TEKRAR ÇIKMAZ. localStorage'a
// yazılsaydı paylaşılan bir cihazda ikinci kullanıcıya da "görülmüş" görünürdü.
//
// NEDEN SÜRÜMLÜ: rehber içeriği zamanla değişecek. `version` alanı olmasaydı
// yeni bir tur eklemek için kullanıcıdan elle bir şey silmesini istemek
// gerekirdi; `isGuideDone` eski sürümü "bitmemiş" saydığı için yeni tur yalnızca
// `GUIDE_VERSION` yükseltilerek yayımlanır.
// ============================================================================

/** `/api/config/:key` anahtarı. `CONFIG_KEY_PATTERN` ile uyumlu olmalı
 *  (`^[a-z][a-z0-9_]{0,31}$`) — aksi hâlde backend 400 döner. */
export const GUIDE_CONFIG_KEY = "guide";

/** Güncel tur sürümü. Tur içeriği anlamlı biçimde değişirse +1. */
export const GUIDE_VERSION = 1;

export type GuideStatus = "completed" | "skipped";

export interface GuideState {
  version: number;
  status: GuideStatus;
  /** ISO zaman damgası; yalnızca teşhis/geriye dönük okuma için. */
  at: string;
}

/** Ham config değerini güvenle `GuideState`'e çevirir.
 *
 *  `null` döner = "rehber hiç bitirilmedi". Bozuk/eksik satır da `null` sayılır:
 *  bir sürüm alanının yanlış yazılması kullanıcıyı rehberden mahrum bırakmamalı
 *  — en fazla bir kez daha gösterilir, veri kaybı olmaz. */
export function parseGuideState(raw: unknown): GuideState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const version = typeof o.version === "number" && Number.isFinite(o.version) ? o.version : null;
  const status = o.status === "completed" || o.status === "skipped" ? o.status : null;
  if (version === null || status === null) return null;
  return { version, status, at: typeof o.at === "string" ? o.at : "" };
}

/** Kayıtlı durum GÜNCEL sürümü (ya da daha yenisini) kapsıyor mu?
 *
 *  "Daha yenisini" de kapsar: sunucudan daha eski bir istemciye düşen bir satır
 *  (ör. geri alınmış bir sürüm) kullanıcıyı eski tura geri sürüklemesin. */
export function isGuideDone(state: GuideState | null, version: number = GUIDE_VERSION): boolean {
  return state !== null && state.version >= version;
}

/** `updateConfig`'e yazılacak gövde. Config değeri düz nesne olmak ZORUNDA
 *  (backend `isPlainObject` ile kapıyor). */
export function guideDonePayload(status: GuideStatus, at: string): Record<string, unknown> {
  return { version: GUIDE_VERSION, status, at };
}

export interface GuideEligibility {
  /** `config.guide` (bkz. `parseGuideState`). */
  state: GuideState | null;
  /** Profil/TDEE sihirbazı tamamlandı ya da atlandı mı. */
  hasCompletedOnboarding: boolean;
  /** Hesaptaki kayıtlı gün sayısı — rehber YENİ hesap için. */
  dayCount: number;
  /** Profil sihirbazı şu an ekranda mı (üst üste binmesin). */
  wizardOpen: boolean;
  /** Sürüm popup'ı şu an ekranda mı.
   *
   *  Ölçülen bug: yeni kullanıcı kurulum sihirbazını kapattığında popup 7 ms
   *  içinde açılıyor, tur ise profili yazan istek dönünce 33 ms sonra ÜSTÜNE
   *  biniyordu — ikisi aynı anda, "Hızlı Tur" popup'ı okuyan kullanıcının
   *  karşısında. Bu kapı ikisinin aynı karede açılmasını yapısal olarak
   *  engeller (sıra: kurulum → tur → popup). */
  changelogOpen: boolean;
  /** Kullanıcı bu oturumda rehberi kapattı/bitirdi mi. */
  dismissedThisSession: boolean;
  /** Ayarlar > "Rehberi tekrar göster": gün verisi olsa bile aç. */
  forceOpen: boolean;
  version?: number;
}

/**
 * Rehber açılmalı mı?
 *
 * Sıra ÖNEMLİ ve her satırın bir ölçülmüş karşılığı var:
 *   1. Oturum içi kapanış her şeyi bastırır — aksi hâlde `updateConfig` sonrası
 *      yenileme gelmeden önce rehber yeniden açılıp kullanıcıyı kilitlerdi.
 *   2. Sihirbaz açıkken gösterilmez (ikisi aynı anda tam ekran olamaz).
 *   2b. Sürüm popup'ı açıkken de gösterilmez — aynı gerekçe. Ayarlar > "Ne Var
 *      Yeni?" tur sırası beklerken elle açılabildiği için bu kapı gerekli.
 *   3. `forceOpen` BİLEREK yukarıda: Ayarlar'dan çağrılan yol veri koşulunu da
 *      "zaten görüldü" koşulunu da aşmalıdır — kullanıcı açıkça istedi.
 *   4. Profil kurulumu bitmemişse rehber erken olur; önce sihirbaz var.
 *   5. Gün verisi olan hesap "yeni kullanıcı" DEĞİL. Bu koşul olmasaydı, uzun
 *      süredir kullanan birine — rehber durumu boş görünse bile — onboarding
 *      turu çıkardı (bkz. App.tsx'teki sihirbaz tetiğinin aynı gerekçesi).
 */
export function shouldShowGuide(p: GuideEligibility): boolean {
  if (p.dismissedThisSession) return false;
  if (p.wizardOpen) return false;
  if (p.changelogOpen) return false;
  if (p.forceOpen) return true;
  if (!p.hasCompletedOnboarding) return false;
  if (p.dayCount > 0) return false;
  return !isGuideDone(p.state, p.version ?? GUIDE_VERSION);
}

export type GuideStepId = "summary" | "addMeal" | "memory" | "quick" | "progress" | "settings";

export interface GuideStep {
  id: GuideStepId;
  /** `[data-guide-target="…"]` değeri. Sınıf/DOM sırası DEĞİL: bir düzen
   *  değişikliği rehberi sessizce bozmasın diye kararlı bir işaret. */
  target: string;
  titleKey: string;
  bodyKey: string;
  /** Hedef sabit konumluysa (alt gezinme çubuğu) sayfayı kaydırmaya gerek yok —
   *  `scrollIntoView` bu öğelerde anlamsız, hatta zararlı olabilir. */
  fixed?: boolean;
}

/**
 * Turun adımları. ALTI adım BİLİNÇLİ: sırayla "ne görüyorum" → "ilk değeri
 * nasıl üretirim" → "bu uygulamanın farkı nedir" → "hızlı yollar" → "sonucu
 * nerede okurum" → "her şeyi nereden yönetirim". Kullanıcı ilk gerçek öğününü
 * kaydetmeden önce ihtiyaç duyacağı her kapı bir kez gösterilir; rehber
 * uygulamayı ZORLA gezdirmez (pasif coach-mark).
 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "summary",
    target: "day-summary",
    titleKey: "guide.stepSummaryTitle",
    bodyKey: "guide.stepSummaryBody",
  },
  {
    id: "addMeal",
    target: "add-meal",
    titleKey: "guide.stepAddMealTitle",
    bodyKey: "guide.stepAddMealBody",
  },
  {
    id: "memory",
    target: "aliases-tab",
    titleKey: "guide.stepMemoryTitle",
    bodyKey: "guide.stepMemoryBody",
    fixed: true,
  },
  {
    id: "quick",
    target: "fab",
    titleKey: "guide.stepQuickTitle",
    bodyKey: "guide.stepQuickBody",
    fixed: true,
  },
  {
    id: "progress",
    target: "history-tab",
    titleKey: "guide.stepProgressTitle",
    bodyKey: "guide.stepProgressBody",
    fixed: true,
  },
  {
    id: "settings",
    target: "settings-tab",
    titleKey: "guide.stepSettingsTitle",
    bodyKey: "guide.stepSettingsBody",
    fixed: true,
  },
];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;
