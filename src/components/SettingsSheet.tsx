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
  Sparkles,
  Check,
  LogOut,
  KeyRound,
  ListPlus,
  Trash2,
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
import { addAllowlistEmail, changePassword, fetchAllowlist, removeAllowlistEmail } from "../lib/authApi";
import { emailProblem, passwordProblem } from "../lib/authRules";
import { ErrorText, FormActions, Label, TextField, fieldCls } from "./FormBits";
import { useTheme } from "../lib/theme";
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
  | "allowlist";

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
}: {
  onClose: () => void;
  embedded?: boolean;
  resetKey?: number;
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
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const dataCtx = useData();
const { user, authDisabled, capabilities, logout } = useAuth();
  const { theme, setTheme } = useTheme();

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
      setCacheStatus("Önbellek ve Service Worker temizlendi!");
    } catch {
      setCacheStatus("Önbellek temizlenirken hata oluştu.");
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
                    {userAge ? `${userAge} yaşında` : "Nutrimind Üyesi"} • {userWeight} kg
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/80 transition group-hover:bg-white/10">
                <span>Düzenle</span>
                <ChevronRight className="h-3.5 w-3.5 text-white/40" />
              </div>
            </div>

            {/* 2. PROMO / SPOTLIGHT BANNER */}
            <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/20 via-purple-500/10 to-transparent p-3.5 shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
                  <Sparkles className="h-5 w-5 text-black" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-white">
                      Nutrimind Pro Hafıza
                    </span>
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[9px] font-black text-accent border border-accent/30">
                      AKTİF
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/70">
                    Tüm öğünleriniz ve besin alias'larınız SQLite yerel hafızasında anında senkronize olur.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. GRUPLANDIRILMIŞ KARTLAR (CAL AI STİLİ) */}

            {/* HESAP & KİŞİSEL */}
            <SectionGroup title="Hesap & Profil">
              <MenuItem
                icon={User}
                iconBg="bg-blue-500/15"
                iconColor="text-blue-400"
                title="Profil Bilgileri"
                subtitle="İsim, yaş, boy ve kilo verileri"
                onClick={() => openSubView("profile")}
              />
              <MenuItem
                icon={Sliders}
                iconBg="bg-purple-500/15"
                iconColor="text-purple-400"
                title="Uygulama Tercihleri"
                subtitle="Koyu tema, makro görünümü"
                onClick={() => openSubView("preferences")}
              />
              {!authDisabled && (
                <MenuItem
                  icon={KeyRound}
                  iconBg="bg-amber-500/15"
                  iconColor="text-amber-400"
                  title="Parola Değiştir"
                  subtitle="Hesap parolanı güncelle"
                  onClick={() => openSubView("password")}
                />
              )}
              {!authDisabled && capabilities.isAdmin && (
                <MenuItem
                  icon={ListPlus}
                  iconBg="bg-teal-500/15"
                  iconColor="text-teal-400"
                  title="İzinli E-postalar"
                  subtitle="Yeni kayıt olabilecek kişiler"
                  onClick={() => openSubView("allowlist")}
                />
              )}
            </SectionGroup>

            {/* HEDEFLER & TAKİP */}
            <SectionGroup title="Hedefler & Takip">
              <MenuItem
                icon={Target}
                iconBg="bg-accent/20"
                iconColor="text-accent"
                title="Beslenme Hedeflerini Düzenle"
                subtitle="Günlük Kcal, Protein, Karbonhidrat, Yağ & Lif"
                onClick={() => openSubView("goals")}
              />
              <MenuItem
                icon={Pill}
                iconBg="bg-amber-500/15"
                iconColor="text-amber-400"
                title="Takviye & Supplement Takibi"
                subtitle="Protein tozu, kreatin, vitamin vb."
                onClick={() => openSubView("supplements")}
              />
              <MenuItem
                icon={Scale}
                iconBg="bg-rose-500/15"
                iconColor="text-rose-400"
                title="Kilo & Vücut Geçmişi"
                subtitle="Mevcut kilo ve hedef grafikler"
                onClick={() => openSubView("weight")}
              />
            </SectionGroup>

            {/* WIDGET'LAR & RAPORLAR */}
            <SectionGroup title="Raporlar & Widget'lar">
              <MenuItem
                icon={FileText}
                iconBg="bg-teal-500/15"
                iconColor="text-teal-400"
                title="Özet PDF Raporu Oluştur"
                subtitle="Haftalık / aylık beslenme dökümü"
                onClick={() => openSubView("report")}
              />
              <MenuItem
                icon={LayoutGrid}
                iconBg="bg-violet-500/15"
                iconColor="text-violet-400"
                title="Ana Ekran Widget Rehberi"
                subtitle="Hızlı öğün ekleme widget'ları"
                onClick={() => openSubView("widgets")}
              />
            </SectionGroup>

            {/* VERİ & YASAL */}
            <SectionGroup title="Veri & Destek">
              <MenuItem
                icon={Download}
                iconBg="bg-cyan-500/15"
                iconColor="text-cyan-400"
                title="Veri Yedekleme & İçe/Dışa Aktar"
                subtitle="JSON yedekleme, CSV veri aktarımı"
                onClick={() => openSubView("data")}
              />
              <MenuItem
                icon={HelpCircle}
                iconBg="bg-yellow-500/15"
                iconColor="text-yellow-400"
                title="Özellik İste & Geri Bildirim"
                subtitle="Geliştiriciye talep gönder"
                onClick={() => openSubView("feedback")}
              />
              <MenuItem
                icon={Mail}
                iconBg="bg-pink-500/15"
                iconColor="text-pink-400"
                title="Destek & İletişim"
                subtitle="support@emrullah.xyz"
                onClick={() => window.open("mailto:support@emrullah.xyz")}
              />
              <MenuItem
                icon={ShieldCheck}
                iconBg="bg-emerald-500/15"
                iconColor="text-emerald-400"
                title="Gizlilik & Veri Güvenliği"
                subtitle="SQLite yerel şifreli saklama"
                onClick={() => openSubView("privacy")}
              />
            </SectionGroup>

            {/* HESAP İŞLEMLERİ */}
            <SectionGroup title="Hesap İşlemleri">
              <MenuItem
                icon={RefreshCw}
                iconBg="bg-blue-500/15"
                iconColor="text-blue-400"
                title="Önbelleği & Uygulamayı Yenile"
                subtitle="PWA service worker önbelleğini temizler"
                onClick={handleClearCache}
              />
              {!authDisabled && (
                <MenuItem
                  icon={LogOut}
                  iconBg="bg-rose-500/15"
                  iconColor="text-rose-400"
                  title="Çıkış Yap"
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
                NUTRIMIND VERSION 1.0.0 (PWA)
              </div>
              <div className="text-[10px] text-white/20 mt-0.5">
                Emrullah Bayram • Oracle Cloud SQLite Backend
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
                <span>Geri</span>
              </button>
              <h3 className="text-sm font-bold text-white/90">
                {subView === "goals" && "Beslenme Hedefleri"}
                {subView === "supplements" && "Takviye & Supplementler"}
                {subView === "data" && "Veri Yedekleme & İçe/Dışa Aktar"}
                {subView === "report" && "Özet PDF Raporu"}
                {subView === "profile" && "Profil Bilgileri"}
                {subView === "preferences" && "Uygulama Tercihleri"}
                {subView === "weight" && "Kilo & Vücut Takibi"}
                {subView === "widgets" && "Ana Ekran Widget Rehberi"}
                {subView === "feedback" && "Özellik İste & Geri Bildirim"}
                {subView === "privacy" && "Gizlilik & Veri Güvenliği"}
                {subView === "password" && "Parola Değiştir"}
                {subView === "allowlist" && "İzinli E-postalar"}
              </h3>
            </div>

        {/* 1. HEDEFLER */}
        {subView === "goals" && <GoalsForm onClose={goBack} embedded />}

        {/* 2. TAKVİYELER */}
        {subView === "supplements" && <SupplementSettings />}

        {/* 3. VERİ YEDEKLEME & YÜKLEME */}
        {subView === "data" && (
          <ExportModal
            data={dataCtx}
            refresh={dataCtx.refresh}
            onClose={onClose}
            embedded
          />
        )}

        {/* 4. ÖZET PDF RAPORU */}
        {subView === "report" && <ReportView data={dataCtx} />}

        {/* 5. PROFİL BİLGİLERİ DÜZENLEME */}
        {subView === "profile" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-card border border-line bg-calCard p-4">
              <div>
                <label className="text-xs font-bold text-white/70 block mb-1">
                  Ad Soyad
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
                    Yaş
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
                    Kilo (kg)
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
                    Boy (cm)
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
                <span>Profili Kaydet</span>
              </button>

              {savedProfileMsg && (
                <div className="text-center text-xs font-bold text-emerald-400">
                  ✓ Profil bilgileri güncellendi!
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. KİLO & VÜCUT TAKİBİ */}
        {subView === "weight" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/70">Mevcut Kilo</span>
              <span className="text-base font-extrabold text-white">{userWeight} kg</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/70">Hedef Kilo</span>
              <span className="text-base font-extrabold text-accent">75 kg</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mt-1">
              <div className="h-full bg-accent w-3/4 rounded-full" />
            </div>
          </div>
        )}

        {/* 8. WIDGET REHBERİ */}
        {subView === "widgets" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="text-sm font-extrabold text-white">PWA Hızlı Erişim Widget'ı</div>
            <p className="text-xs text-white/70 leading-relaxed">
              Android cihazınızda Nutrimind PWA uygulamasını açıp ana ekrana eklediğinizde, telefon uygulamasını tek tıkla açıp hızlıca yemek taraması veya öğün eklemesi yapabilirsiniz.
            </p>
          </div>
        )}

        {/* 9. DESTEK & BİLDİRİM */}
        {subView === "feedback" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="text-sm font-extrabold text-white">Geri Bildirim & Özellik Talebi</div>
            <p className="text-xs text-white/70">
              Yeni bir besin hafızası veya uygulama özelliği talep etmek için doğrudan e-posta gönderebilirsiniz.
            </p>
            <a
              href="mailto:support@emrullah.xyz?subject=Nutrimind%20Onerisi"
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/20"
            >
              <Mail className="h-4 w-4" />
              <span>Geliştiriciye E-Posta Gönder</span>
            </a>
          </div>
        )}

        {/* 10. GİZLİLİK & GÜVENLİK */}
        {subView === "privacy" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4 text-xs text-white/70 leading-relaxed">
            <div className="text-sm font-extrabold text-white mb-1">Gizlilik ve Veri Saklama</div>
            Nutrimind verileriniz doğrudan kendi Oracle Cloud sunucunuz üzerindeki şifreli SQLite veritabanında saklanır. 3. parti hiçbir izleyici veya reklam ağı kullanılmaz.
          </div>
        )}

        {/* 11. UYGULAMA TERCİHLERİ */}
        {subView === "preferences" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-row p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-white">Görünüm</span>
              <p className="text-[11px] leading-relaxed text-ink-tertiary">Tema bu cihazda saklanır.</p>
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
                  <span className="text-xs font-bold text-white">Koyu İnci</span>
                  <span className="text-[10px] leading-relaxed text-ink-tertiary">Mat kadife görünüm</span>
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
                  <span className="text-xs font-bold text-white">Gece Camı</span>
                  <span className="text-[10px] leading-relaxed text-ink-tertiary">Cam yüzeyler ve ışık küreleri</span>
                  <span className="flex gap-1.5 pt-0.5" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-protein)" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-carb)" }} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--svg-fat)" }} />
                  </span>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-xs font-bold text-white">Otomatik Lif / Mikro Takibi</span>
              <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-[10px] font-bold text-accent">
                Aktif
              </span>
            </div>
          </div>
        )}

        {/* 12. PAROLA DEĞİŞTİR */}
        {subView === "password" && <PasswordForm goBack={goBack} />}

        {/* 13. İZİNLİ E-POSTALAR */}
        {subView === "allowlist" && <AllowlistForm />}
          </div>
        )}
      </div>
  );

  if (embedded) {
    return mainBody;
  }

  return (
    <Modal title={subView ? "Ayarlar" : "Ayarlar & Profil"} onClose={onClose} fullScreen contentRef={scrollRef}>
      {mainBody}
    </Modal>
  );
}

function PasswordForm({ goBack }: { goBack: () => void }) {
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
      validationProblem = "Parolalar eşleşmiyor.";
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
      setSuccessMsg("Parolan güncellendi. Diğer cihazlardaki oturumlar kapatıldı.");
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
            label="Mevcut parola"
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              setSuccessMsg(null);
            }}
            type="password"
            autoComplete="current-password"
          />
          <p className="mt-1 text-[11px] text-white/50">
            Hesabını yalnızca Google ile açtıysan burayı boş bırak.
          </p>
        </div>

        <div>
          <TextField
            label="Yeni parola"
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
            label="Yeni parola (tekrar)"
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
            saveLabel="Kaydet"
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
      setSuccessMsg(`"${eklenen}" listeye eklendi. Bu kişi artık kayıt olabilir.`);
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
      setSuccessMsg(`"${email}" listeden çıkarıldı. Artık kayıt olamaz.`);
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
          <Label>E-posta ekle</Label>
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
              placeholder="ornek@eposta.com"
            />
            <button
              type="button"
              onClick={() => void ekle()}
              disabled={!canEkle}
              className="flex-none rounded-xl bg-accent px-4 py-2.5 text-xs font-extrabold text-accent-ink transition hover:bg-accent/90 active:scale-95 disabled:opacity-40"
            >
              {saving ? "…" : "Ekle"}
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
        <h4 className="text-xs font-bold text-white/70">Listedekiler</h4>
        {emails === null ? (
          <p className="text-xs text-white/50">Yükleniyor…</p>
        ) : emails.length === 0 ? (
          <p className="text-xs text-white/50 leading-relaxed">
            Liste boşken kayıtlar herkese açık kalır. İzin vereceğin kişilerin e-postalarını yukarıdan ekle —
            kaydettiğin anda listede olmayanlar kayıt olamaz.
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
                  aria-label={`${email} listesinden çıkar`}
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
        Not: Google ile kayıt olacak kişileri ayrıca Google Cloud Console'daki "Test users" listesine eklemelisin
        — Google'ın kendi kapısı ayrıdır. Parola ile kayıt olacaklar için yalnızca bu liste yeterli.
      </p>
    </div>
  );
}
