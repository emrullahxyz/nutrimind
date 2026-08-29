import { useEffect, useRef, useState } from "react";
import {
  User,
  Sliders,
  Target,
  Scale,
  Pill,
  FileText,
  LayoutGrid,
  Download,
  HelpCircle,
  Mail,
  ShieldCheck,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Check,
  LogOut,
  KeyRound,
  ListPlus,
  Trash2,
  Globe,
} from "lucide-react";
import { Modal } from "./Modal";
import { GoalsForm } from "./GoalsForm";
import { ExportModal } from "./ExportModal";
import { ReportView } from "./ReportView";
import { SupplementSettings } from "./SupplementSettings";
import { useData } from "../lib/data";
import { todayISO } from "../lib/format";
import { parseWeightConfig, withWeightEntry } from "../lib/weight";
import { useSubViewRegistration } from "../hooks/useSubViewRegistration";
import { useAuth } from "../lib/auth";
import { addAllowlistEmail, changePassword, deleteAccount, exportAccount, fetchAllowlist, removeAllowlistEmail } from "../lib/authApi";
import { emailProblem, passwordProblem } from "../lib/authRules";
import { ErrorText, FormActions, Label, TextField, fieldCls } from "./FormBits";
import { useTheme } from "../lib/theme";
import { useTranslation } from "react-i18next";
import { setLang, SUPPORTED_LANGS, type Lang } from "../i18n/i18n";
import { useToast } from "./Toast";
import { haptic } from "../lib/haptics";

type SubView =
  | null
  | "goals"
  | "supplements"
  | "data"
  | "report"
  | "profile"
  | "preferences"
  | "weight"
  | "widgets"
  | "feedback"
  | "privacy"
  | "password"
  | "allowlist"
  | "language";

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  onClick: () => void;
  isDanger?: boolean;
}

function MenuItem({
  icon: Icon,
  iconBg = "bg-white/10",
  iconColor = "text-white",
  title,
  subtitle,
  badge,
  onClick,
  isDanger,
}: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] active:bg-white/[0.08]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${iconBg} ${iconColor} transition-transform group-hover:scale-105`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="truncate">
          <div
            className={`text-xs sm:text-sm font-semibold truncate ${
              isDanger ? "text-red-400" : "text-white"
            }`}
          >
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] text-white/50 truncate mt-0.5">{subtitle}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-none">
        {badge && (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/80">
            {badge}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
      </div>
    </button>
  );
}

function SectionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="px-1 text-[11px] font-bold tracking-wider text-white/40 uppercase">
        {title}
      </h4>
      <div className="glass-card divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-row">
        {children}
      </div>
    </div>
  );
}

export function SettingsSheet({
  onClose,
  embedded = false,
  resetKey = 0,
  initialSubView = null,
}: {
  onClose: () => void;
  embedded?: boolean;
  resetKey?: number;
  initialSubView?: SubView;
}) {
  const [subView, setSubView] = useState<SubView>(null);

  // App.tsx'in global geri-tuşu dinleyicisinin bu alt-görünümden YENİ
  // çıkıldığını anlayıp sahte "çıkmak için bir kez daha bas" toast'ını
  // bastırabilmesi için — bkz. hooks/useSubViewRegistration.ts.
  useSubViewRegistration(subView !== null);

  useEffect(() => {
    if (resetKey > 0) {
      setSubView(null);
    }
  }, [resetKey]);

  // When opened with a target sub-view, set it and push history for back-button
  useEffect(() => {
    if (initialSubView) {
      window.history.pushState({ tab: "settings", subView: initialSubView }, "");
      setSubView(initialSubView);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const { showToast } = useToast();
  const dataCtx = useData();
  const { user, authDisabled, capabilities, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || "en") as Lang;

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number>(0);

  // Geri dönüldüğünde kaydırma yüksekliğini (scrollTop) hassas şekilde geri yükle
  useEffect(() => {
    if (subView === null && scrollRef.current && savedScrollTopRef.current > 0) {
      const targetScroll = savedScrollTopRef.current;
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = targetScroll;
        }
      });
    }
  }, [subView]);

  // Android Donanım Geri Butonu & Geri Kaydırma (Swipe Back) Entegrasyonu
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state?.isModal) return;

      if (state && state.tab === "settings") {
        setSubView(state.subView || null);
      } else if (!state || state.tab !== "settings") {
        setSubView(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const openSubView = (target: SubView) => {
    if (scrollRef.current) {
      savedScrollTopRef.current = scrollRef.current.scrollTop;
    }
    window.history.pushState({ tab: "settings", subView: target }, "");
    setSubView(target);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  };

  const goBack = () => {
    window.history.back();
  };

  // Profil Bilgileri State
  const [userName, setUserName] = useState(() => localStorage.getItem("nutrimind_username") || "Emrullah Bayram");
  const [userAge, setUserAge] = useState(() => localStorage.getItem("nutrimind_userage") || "29");
  const [userWeight, setUserWeight] = useState(() => localStorage.getItem("nutrimind_userweight") || "78");
  const [userHeight, setUserHeight] = useState(() => localStorage.getItem("nutrimind_userheight") || "178");
  const [savedProfileMsg, setSavedProfileMsg] = useState(false);

  const handleSaveProfile = () => {
    localStorage.setItem("nutrimind_username", userName);
    localStorage.setItem("nutrimind_userage", userAge);
    localStorage.setItem("nutrimind_userweight", userWeight);
    localStorage.setItem("nutrimind_userheight", userHeight);

    const weightNum = parseFloat(userWeight);
    if (!isNaN(weightNum) && weightNum > 0) {
      // Kilo takibiyle AYNI anahtar/biçim (`weight` / `{entries}`) — WeightCard'ın
      // kullandığı yapı. Ayrı bir `weight_${tarih}` anahtarına yazmak (eski
      // davranış) kilo kartı/trendinin hiç görmediği yetim bir kayıt üretiyordu.
      const currentEntries = parseWeightConfig(dataCtx.config).entries;
      void dataCtx.updateConfig("weight", {
        entries: withWeightEntry(currentEntries, todayISO(), weightNum),
      });
    }

    setSavedProfileMsg(true);
    setTimeout(() => setSavedProfileMsg(false), 2000);
  };

  const handleClearCache = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }
      setCacheStatus(t("settings.cacheCleared"));
    } catch {
      setCacheStatus(t("settings.cacheError"));
    } finally {
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    }
  };

  const mainBody = (
    <div ref={scrollRef} className="flex flex-col gap-5">
        {/* ==================== CAL AI ANA PROFİL & AYARLAR LAYOUT ==================== */}
        <div className={subView === null ? "flex flex-col gap-5" : "hidden"}>
          <>
            {/* 1. ÜST KULLANICI PROFİL KARTI */}
            <div
              onClick={() => openSubView("profile")}
              className="group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-grad-top via-grad-mid to-grad-bot p-4 shadow-lg transition hover:border-white/25 hover:from-grad-hover"
            >
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-13 w-13 flex-none items-center justify-center rounded-2xl bg-gradient-to-tr from-accent via-purple-500 to-sky-400 text-lg font-extrabold text-white shadow-md">
                  {userName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "EB"}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-grad-bot">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                </div>
                <div>
                  <div className="text-base font-extrabold text-white group-hover:text-accent transition-colors">
                    {userName}
                  </div>
                  <div className="text-xs text-white/50">
                    {userAge ? t("settings.yearsOld", { age: userAge }) : t("settings.defaultMember")} • {userWeight} kg
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/80 transition group-hover:bg-white/10">
                <span>{t("settings.editProfile")}</span>
                <ChevronRight className="h-3.5 w-3.5 text-white/40" />
              </div>
            </div>

            {/* 3. GRUPLANDIRILMIŞ KARTLAR (CAL AI STİLİ) */}

            {/* HESAP & KİŞİSEL */}
            <SectionGroup title={t("settings.sectionAccount")}>
              <MenuItem
                icon={User}
                iconBg="bg-blue-500/15"
                iconColor="text-blue-400"
                title={t("settings.profileTitle")}
                subtitle={t("settings.profileSubtitle")}
                onClick={() => openSubView("profile")}
              />
              <MenuItem
                icon={Sliders}
                iconBg="bg-purple-500/15"
                iconColor="text-purple-400"
                title={t("settings.preferencesTitle")}
                subtitle={t("settings.preferencesSubtitle")}
                onClick={() => openSubView("preferences")}
              />
              <MenuItem
                icon={Globe}
                iconBg="bg-cyan-500/15"
                iconColor="text-cyan-400"
                title={t("settings.language")}
                subtitle={currentLang.toUpperCase()}
                onClick={() => openSubView("language")}
              />
              {!authDisabled && user && (
                <MenuItem
                  icon={Download}
                  iconBg="bg-emerald-500/15"
                  iconColor="text-emerald-400"
                  title={t("settings.dataTitle")}
                  subtitle={t("settings.dataSubtitle")}
                  onClick={() => openSubView("data")}
                />
              )}
              {!authDisabled && (
                <MenuItem
                  icon={KeyRound}
                  iconBg="bg-amber-500/15"
                  iconColor="text-amber-400"
                  title={t("settings.passwordTitle")}
                  subtitle={t("settings.passwordSubtitle")}
                  onClick={() => openSubView("password")}
                />
              )}
              {!authDisabled && capabilities.isAdmin && (
                <MenuItem
                  icon={ListPlus}
                  iconBg="bg-teal-500/15"
                  iconColor="text-teal-400"
                  title={t("settings.allowlistTitle")}
                  subtitle={t("settings.allowlistSubtitle")}
                  onClick={() => openSubView("allowlist")}
                />
              )}
            </SectionGroup>

            {/* HEDEFLER & TAKİP */}
            <SectionGroup title={t("settings.sectionGoals")}>
              <MenuItem
                icon={Target}
                iconBg="bg-accent/20"
                iconColor="text-accent"
                title={t("settings.goalsTitle")}
                subtitle={t("settings.goalsSubtitle")}
                onClick={() => openSubView("goals")}
              />
              <MenuItem
                icon={Pill}
                iconBg="bg-amber-500/15"
                iconColor="text-amber-400"
                title={t("settings.supplementsTitle")}
                subtitle={t("settings.supplementsSubtitle")}
                onClick={() => openSubView("supplements")}
              />
              <MenuItem
                icon={Scale}
                iconBg="bg-rose-500/15"
                iconColor="text-rose-400"
                title={t("settings.weightTitle")}
                subtitle={t("settings.weightSubtitle")}
                onClick={() => openSubView("weight")}
              />
            </SectionGroup>

            {/* WIDGET'LAR & RAPORLAR */}
            <SectionGroup title={t("settings.sectionReports")}>
              <MenuItem
                icon={FileText}
                iconBg="bg-teal-500/15"
                iconColor="text-teal-400"
                title={t("settings.reportTitle")}
                subtitle={t("settings.reportSubtitle")}
                onClick={() => openSubView("report")}
              />
              <MenuItem
                icon={LayoutGrid}
                iconBg="bg-violet-500/15"
                iconColor="text-violet-400"
                title={t("settings.widgetsTitle")}
                subtitle={t("settings.widgetsSubtitle")}
                onClick={() => openSubView("widgets")}
              />
            </SectionGroup>

            {/* DESTEK & YASAL */}
            <SectionGroup title={t("settings.sectionData")}>
              <MenuItem
                icon={HelpCircle}
                iconBg="bg-yellow-500/15"
                iconColor="text-yellow-400"
                title={t("settings.feedbackTitle")}
                subtitle={t("settings.feedbackSubtitle")}
                onClick={() => openSubView("feedback")}
              />
              <MenuItem
                icon={Mail}
                iconBg="bg-pink-500/15"
                iconColor="text-pink-400"
                title={t("settings.supportTitle")}
                subtitle={t("settings.supportEmail")}
                onClick={() => window.open("mailto:support@emrullah.xyz")}
              />
              <MenuItem
                icon={ShieldCheck}
                iconBg="bg-emerald-500/15"
                iconColor="text-emerald-400"
                title={t("settings.privacyTitle")}
                subtitle={t("settings.privacySubtitle")}
                onClick={() => openSubView("privacy")}
              />
            </SectionGroup>

            {/* HESAP İŞLEMLERİ */}
            <SectionGroup title={t("settings.accountActions")}>
              <MenuItem
                icon={RefreshCw}
                iconBg="bg-blue-500/15"
                iconColor="text-blue-400"
                title={t("settings.cacheTitle")}
                subtitle={t("settings.cacheSubtitle")}
                onClick={handleClearCache}
              />
              {!authDisabled && (
                <MenuItem
                  icon={LogOut}
                  iconBg="bg-rose-500/15"
                  iconColor="text-rose-400"
                  title={t("settings.logout")}
                  subtitle={user?.email}
                  onClick={() => void logout()}
                  isDanger
                />
              )}
            </SectionGroup>

            {cacheStatus && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-bold text-emerald-400">
                {cacheStatus}
              </div>
            )}

            {/* FOOTER VERSİYON BİLGİSİ */}
            <div className="mt-2 text-center pb-2">
              <div className="text-[11px] font-bold text-white/30 tracking-widest uppercase">
                {t("settings.footerVersion")}
              </div>
              <div className="text-[10px] text-white/20 mt-0.5">
                {t("settings.footerCredit")}
              </div>
            </div>
          </>
        </div>

        {/* ==================== SUB-VIEW BİLEŞENLERİ ==================== */}
        {subView !== null && (
          <div className="glass-push flex flex-col gap-4">
            {/* Alt Ekran Başlığı & Geri Butonu */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t("common.back")}</span>
              </button>
              <h3 className="text-sm font-bold text-white/90">
                {subView === "goals" && t("settings.subviewGoals")}
                {subView === "supplements" && t("settings.subviewSupplements")}
                {subView === "data" && t("settings.subviewData")}
                {subView === "report" && t("settings.subviewReport")}
                {subView === "profile" && t("settings.subviewProfile")}
                {subView === "preferences" && t("settings.subviewPreferences")}
                {subView === "weight" && t("settings.subviewWeight")}
                {subView === "widgets" && t("settings.subviewWidgets")}
                {subView === "feedback" && t("settings.subviewFeedback")}
                {subView === "privacy" && t("settings.subviewPrivacy")}
                {subView === "password" && t("settings.subviewPassword")}
                {subView === "allowlist" && t("settings.subviewAllowlist")}
                {subView === "language" && t("settings.language")}
              </h3>
            </div>

        {/* 1. HEDEFLER */}
        {subView === "goals" && <GoalsForm onClose={goBack} embedded />}

        {/* 2. TAKVİYELER */}
        {subView === "supplements" && <SupplementSettings />}

        {/* 3. VERİ YEDEKLEME & YÜKLEME + HESAP VERİLERİ (KVKK/GDPR) */}
        {subView === "data" && (
          <div className="flex flex-col gap-4">
            <ExportModal
              data={dataCtx}
              refresh={dataCtx.refresh}
              onClose={onClose}
              embedded
            />

            {!authDisabled && user && (
              <div className="flex flex-col gap-1.5">
                <h4 className="px-1 text-[11px] font-bold tracking-wider text-white/40 uppercase">
                  {t("settings.dataExport")}
                </h4>
                <div className="glass-card divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-row">
                  <MenuItem
                    icon={Download}
                    iconBg="bg-emerald-500/15"
                    iconColor="text-emerald-400"
                    title={exportBusy ? t("settings.exportButtonBusy") : t("settings.exportButton")}
                    subtitle={t("settings.exportSubtitle")}
                    onClick={async () => {
                      if (exportBusy) return;
                      setExportBusy(true);
                      haptic("light");
                      try {
                        await exportAccount();
                        showToast(t("settings.exportSuccess"), "success");
                      } catch (e) {
                        showToast(t("settings.exportError", { message: (e as Error).message }), "error");
                      } finally {
                        setExportBusy(false);
                      }
                    }}
                  />
                  <MenuItem
                    icon={Trash2}
                    iconBg="bg-rose-500/15"
                    iconColor="text-rose-400"
                    title={t("settings.deleteAccount")}
                    subtitle={t("settings.deleteSubtitle")}
                    onClick={() => {
                      haptic("medium");
                      setDeletePassword("");
                      setDeleteConfirm("");
                      setDeleteStep(1);
                    }}
                    isDanger
                  />
                </div>
              </div>
            )}

            {deleteStep > 0 && (
              <Modal
                onClose={() => {
                  if (!deleteBusy) {
                    setDeleteStep(0);
                    setDeletePassword("");
                    setDeleteConfirm("");
                  }
                }}
                title={t("settings.deleteTitle")}
              >
                {deleteStep === 1 && (
                  <div className="space-y-3">
                    <p className="text-sm text-white/80">
                      {t("settings.deleteStep1")}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteStep(0)}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/80"
                      >
                        {t("settings.deleteCancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteStep(2)}
                        className="flex-1 rounded-xl bg-rose-500/20 py-2.5 text-sm font-semibold text-rose-300"
                      >
                        {t("settings.deleteContinue")}
                      </button>
                    </div>
                  </div>
                )}
                {deleteStep === 2 && (
                  <div className="space-y-3">
                    <p className="text-sm text-white/80">
                      {t("settings.deleteStep2", { confirm: t("settings.deleteConfirmValue") })}
                    </p>
                    <TextField
                      type="password"
                      label={t("settings.deletePasswordLabel")}
                      placeholder={t("settings.deletePasswordPlaceholder")}
                      value={deletePassword}
                      onChange={setDeletePassword}
                      autoComplete="current-password"
                    />
                    <div>
                      <Label>{t("settings.deleteConfirmLabel")}</Label>
                      <input
                        type="text"
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder={t("settings.deleteConfirmPlaceholder", { confirm: t("settings.deleteConfirmValue") })}
                        className={fieldCls}
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setDeleteStep(1)}
                        disabled={deleteBusy}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/80 disabled:opacity-50"
                      >
                        {t("settings.deleteBack")}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (deleteConfirm !== t("settings.deleteConfirmValue") || deleteBusy) return;
                          setDeleteBusy(true);
                          try {
                            await deleteAccount({
                              confirm: t("settings.deleteServerConfirm"),
                              ...(deletePassword ? { password: deletePassword } : {}),
                            });
                            showToast(t("settings.deleteSuccess"), "success");
                            setDeleteStep(0);
                            await logout();
                            window.location.reload();
                          } catch (e) {
                            showToast(t("settings.deleteError", { message: (e as Error).message }), "error");
                          } finally {
                            setDeleteBusy(false);
                          }
                        }}
                        disabled={deleteConfirm !== t("settings.deleteConfirmValue") || deleteBusy}
                        className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                      >
                        {deleteBusy ? t("settings.deleteSubmitting") : t("settings.deleteSubmit")}
                      </button>
                    </div>
                  </div>
                )}
              </Modal>
            )}
          </div>
        )}

        {/* 4. ÖZET PDF RAPORU */}
        {subView === "report" && <ReportView data={dataCtx} />}

        {/* 5. PROFİL BİLGİLERİ DÜZENLEME */}
        {subView === "profile" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-card border border-line bg-calCard p-4">
              <div>
                <label className="text-xs font-bold text-white/70 block mb-1">
                  {t("settings.fieldFullName")}
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-xs font-bold text-white/70 block mb-1">
                    {t("settings.fieldAge")}
                  </label>
                  <input
                    type="number"
                    value={userAge}
                    onChange={(e) => setUserAge(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white focus:border-accent focus:outline-none text-center"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/70 block mb-1">
                    {t("settings.fieldWeight")}
                  </label>
                  <input
                    type="number"
                    value={userWeight}
                    onChange={(e) => setUserWeight(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white focus:border-accent focus:outline-none text-center"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/70 block mb-1">
                    {t("settings.fieldHeight")}
                  </label>
                  <input
                    type="number"
                    value={userHeight}
                    onChange={(e) => setUserHeight(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white focus:border-accent focus:outline-none text-center"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-extrabold text-black transition hover:bg-accent/90 active:scale-[0.98]"
              >
                <Check className="h-4 w-4" />
                <span>{t("settings.saveProfile")}</span>
              </button>

              {savedProfileMsg && (
                <div className="text-center text-xs font-bold text-emerald-400">
                  {t("settings.profileSaved")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. KİLO & VÜCUT TAKİBİ */}
        {subView === "weight" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/70">{t("settings.currentWeight")}</span>
              <span className="text-base font-extrabold text-white">{userWeight} kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/70">{t("settings.targetWeight")}</span>
              <span className="text-base font-extrabold text-accent">{t("settings.targetWeightValue")}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mt-1">
              <div className="h-full bg-accent w-3/4 rounded-full" />
            </div>
          </div>
        )}

        {/* 8. WIDGET REHBERİ */}
        {subView === "widgets" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="text-sm font-extrabold text-white">{t("settings.widgetsHeader")}</div>
            <p className="text-xs text-white/70 leading-relaxed">
              {t("settings.widgetsBody")}
            </p>
          </div>
        )}

        {/* 9. DESTEK & BİLDİRİM */}
        {subView === "feedback" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="text-sm font-extrabold text-white">{t("settings.feedbackHeader")}</div>
            <p className="text-xs text-white/70">
              {t("settings.feedbackBody")}
            </p>
            <a
              href="mailto:support@emrullah.xyz?subject=Nutrimind%20Onerisi"
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/20"
            >
              <Mail className="h-4 w-4" />
              <span>{t("settings.feedbackSendEmail")}</span>
            </a>
          </div>
        )}

        {/* 10. GİZLİLİK & GÜVENLİK */}
        {subView === "privacy" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4 text-xs text-white/70 leading-relaxed">
            <div className="text-sm font-extrabold text-white mb-1">{t("settings.privacyHeader")}</div>
            {t("settings.privacyBody")}
          </div>
        )}

        {/* 11. UYGULAMA TERCİHLERİ */}
        {subView === "preferences" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-white">{t("settings.appearance")}</span>
              <p className="text-[11px] leading-relaxed text-ink-tertiary">{t("settings.themeStoredLocally")}</p>
              <div className="mt-0.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTheme("velvet");
                    haptic("light");
                  }}
                  aria-pressed={theme === "velvet"}
                  className={`flex flex-col gap-1.5 rounded-2xl border p-3 text-left transition ${
                    theme === "velvet"
                      ? "border-accent/40 bg-accent/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  }`}
                >
                  <span className="text-xs font-bold text-white">{t("settings.themeVelvet")}</span>
                  <span className="text-[10px] leading-relaxed text-ink-tertiary">{t("settings.themeVelvetDesc")}</span>
                  <span className="flex gap-1.5 pt-0.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-protein)" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-carb)" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-fat)" }} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme("glass");
                    haptic("light");
                  }}
                  aria-pressed={theme === "glass"}
                  className={`flex flex-col gap-1.5 rounded-2xl border p-3 text-left transition ${
                    theme === "glass"
                      ? "border-accent/40 bg-accent/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  }`}
                >
                  <span className="text-xs font-bold text-white">{t("settings.themeGlass")}</span>
                  <span className="text-[10px] leading-relaxed text-ink-tertiary">{t("settings.themeGlassDesc")}</span>
                  <span className="flex gap-1.5 pt-0.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-protein)" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-carb)" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-fat)" }} />
                  </span>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-xs font-bold text-white">{t("settings.fiberTracking")}</span>
              <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-[10px] font-bold text-accent">
                {t("settings.active")}
              </span>
            </div>
          </div>
        )}

        {/* 12. PAROLA DEĞİŞTİR */}
        {subView === "password" && <PasswordForm goBack={goBack} />}

        {/* 13. İZİNLİ E-POSTALAR */}
        {subView === "allowlist" && <AllowlistForm />}

        {/* 14. DİL SEÇİMİ */}
        {subView === "language" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="flex gap-2 px-1 pb-1" role="group" aria-label={t("settings.language")}>
              {SUPPORTED_LANGS.map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setLang(lng)}
                  aria-pressed={currentLang === lng}
                  className={
                    "flex-1 rounded-pill border px-3 py-2 text-sm font-semibold transition " +
                    (currentLang === lng
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : "border-line bg-white/[0.04] text-ink-secondary hover:text-ink-primary")
                  }
                >
                  {lng === "tr" ? t("settings.languageTr") : lng === "en" ? t("settings.languageEn") : t("settings.languagePl")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 15. accountData sub-view removed — merged into "data" */}
          </div>
        )}
      </div>
  );

  if (embedded) {
    return mainBody;
  }

  return (
    <Modal title={subView ? t("settings.title") : t("settings.titleWithProfile")} onClose={onClose} fullScreen contentRef={scrollRef}>
      {mainBody}
    </Modal>
  );
}

function PasswordForm({ goBack }: { goBack: () => void }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const passProblem = passwordProblem(newPassword);
  const passwordsMatch = newPassword === newPasswordConfirm;

  let validationProblem: string | null = null;
  if (newPassword || newPasswordConfirm) {
    if (passProblem) {
      validationProblem = passProblem;
    } else if (!passwordsMatch) {
      validationProblem = t("settings.passwordMismatch");
    }
  }

  const canSave = !passProblem && passwordsMatch;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setSuccessMsg(t("settings.passwordSuccess"));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-line bg-calCard p-4">
        <div>
          <TextField
            label={t("settings.passwordCurrentLabel")}
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              setSuccessMsg(null);
            }}
            type="password"
            autoComplete="current-password"
          />
          <p className="mt-1 text-[11px] text-white/50">
            {t("settings.passwordGoogleHint")}
          </p>
        </div>

        <div>
          <TextField
            label={t("settings.passwordNewLabel")}
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v);
              setSuccessMsg(null);
            }}
            type="password"
            autoComplete="new-password"
          />
        </div>

        <div>
          <TextField
            label={t("settings.passwordRepeatLabel")}
            value={newPasswordConfirm}
            onChange={(v) => {
              setNewPasswordConfirm(v);
              setSuccessMsg(null);
            }}
            type="password"
            autoComplete="new-password"
          />
        </div>

        {validationProblem && (
          <p className="text-xs text-amber-400">{validationProblem}</p>
        )}

        {err && <ErrorText>{err}</ErrorText>}

        {successMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-bold text-emerald-400">
            {successMsg}
          </div>
        )}

        <div className="mt-2 flex justify-end">
          <FormActions
            onCancel={goBack}
            onSave={() => void handleSave()}
            saving={saving}
            disabled={!canSave}
            saveLabel={t("common.save")}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * "İzinli E-postalar" — yeni kayıt olabilecek kişilerin listesi. Yalnızca sahip
 * (NUTRIMIND_OWNER_EMAIL) görür; liste DOLUYSA kayıt yalnızca listedekilere
 * açıktır, boşsa sunucu bayrağı (ALLOW_SIGNUP) tek başına karar verir.
 * Desen PasswordForm'dan: `saving`/`err`/`successMsg` üçlüsü + aynı kart dili.
 */
function AllowlistForm() {
  const { t } = useTranslation();
  const [emails, setEmails] = useState<string[] | null>(null); // null = yükleniyor
  const [yeni, setYeni] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let canli = true;
    fetchAllowlist()
      .then((liste) => {
        if (canli) setEmails(liste);
      })
      .catch((e) => {
        if (canli) setErr(String((e as Error)?.message ?? e));
      });
    return () => {
      canli = false;
    };
  }, []);

  const problem = emailProblem(yeni);
  const canEkle = problem === null && yeni.trim() !== "" && !saving;

  async function ekle() {
    if (!canEkle) return;
    setSaving(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      const eklenen = await addAllowlistEmail(yeni);
      setYeni("");
      // Sunucunun NORMALİZE ettiği hâli listeye yaz (küçük harf, trimsiz).
      setEmails((es) => (es ? [...es.filter((e) => e !== eklenen), eklenen].sort() : es));
      setSuccessMsg(t("settings.allowlistAdded", { email: eklenen }));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function sil(email: string) {
    if (saving) return;
    setSaving(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      await removeAllowlistEmail(email);
      setEmails((es) => (es ? es.filter((e) => e !== email) : es));
      setSuccessMsg(t("settings.allowlistRemoved", { email }));
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card flex flex-col gap-3 rounded-card border border-line bg-calCard p-4">
        <div>
          <Label>{t("settings.allowlistAddLabel")}</Label>
          <div className="mt-1 flex gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={yeni}
              onChange={(e) => {
                setYeni(e.target.value);
                setSuccessMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void ekle();
                }
              }}
              className={`${fieldCls} flex-1`}
              placeholder={t("settings.allowlistEmailPlaceholder")}
            />
            <button
              type="button"
              onClick={() => void ekle()}
              disabled={!canEkle}
              className="flex-none rounded-xl bg-accent px-4 py-2.5 text-xs font-extrabold text-accent-ink transition hover:bg-accent/90 active:scale-95 disabled:opacity-40"
            >
              {saving ? "…" : t("common.add")}
            </button>
          </div>
          {problem && yeni !== "" && <p className="mt-1 text-xs text-amber-400">{problem}</p>}
        </div>

        {err && <ErrorText>{err}</ErrorText>}

        {successMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-bold text-emerald-400">
            {successMsg}
          </div>
        )}
      </div>

      <div className="glass-card flex flex-col gap-2 rounded-card border border-line bg-calCard p-4">
        <h4 className="text-xs font-bold text-white/70">{t("settings.allowlistCurrentList")}</h4>
        {emails === null ? (
          <p className="text-xs text-white/50">{t("common.loading")}</p>
        ) : emails.length === 0 ? (
          <p className="text-xs text-white/50 leading-relaxed">
            {t("settings.allowlistEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            {emails.map((email) => (
              <li key={email} className="flex items-center justify-between gap-3 py-2.5">
                <span className="truncate text-xs font-semibold text-white">{email}</span>
                <button
                  type="button"
                  onClick={() => void sil(email)}
                  disabled={saving}
                  aria-label={t("settings.allowlistRemove", { email })}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-white/40 transition hover:bg-rose-500/15 hover:text-rose-400 active:scale-90 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-white/40">
        {t("settings.allowlistGoogleNote")}
      </p>
    </div>
  );
}
