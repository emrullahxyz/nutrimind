// ============================================================================
// Nutrimind — kimlik bağlamı ve kapı (Faz F).
//
// KAPI NEDEN `DataProvider`'IN DIŞINDA:
// `DataProvider` mount olur olmaz KOŞULSUZ `fetchData()` atıyor ve çocuklarını
// render etmeden önce `<AppSkeleton/>` ya da terminal bir hata ekranı
// gösteriyor (data.tsx:90-98, :151-154). Kapı içeride olsaydı, giriş yapmamış
// her ziyaret önce başarısız bir `/api/data` isteği atar ve kullanıcı giriş
// formu yerine "Veri alınamadı" ölü ekranını görürdü.
//
// 401 MİMARİSİ: oturum düştüğünde `AuthProvider` `anon`'a geçiyor; bu da
// `DataProvider`'ı KOMPLE UNMOUNT ediyor ve onun terminal `stale`/`err`
// durumlarını beraberinde atıyor. `data.tsx`'e hiç dokunmamamızın sebebi bu —
// unmount, elle temizlikten daha güvenilir.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as authApi from "./authApi";
import { setUnauthorizedHandler } from "./api";
import { AppSkeleton } from "../components/Skeleton";
import type { AuthCapabilities, AuthUser } from "../types";

type Status = "loading" | "authed" | "anon";

interface AuthValue {
  status: Status;
  user: AuthUser | null;
  capabilities: AuthCapabilities;
  /** Sunucuda kimlik kapalı — uygulama tek kullanıcılı gibi çalışıyor. */
  authDisabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("AuthProvider bulunamadı");
  return v;
}

const NO_CAPS: AuthCapabilities = { signupAllowed: false, googleEnabled: false, isAdmin: false };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [capabilities, setCapabilities] = useState<AuthCapabilities>(NO_CAPS);
  const [authDisabled, setAuthDisabled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tekrar, setTekrar] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setErr(null);
    void (async () => {
      try {
        const me = await authApi.fetchMe();
        if (!aliveRef.current) return;
        setAuthDisabled(me.authDisabled);
        setCapabilities(me.capabilities);
        setUser(me.user);
        // Kimlik kapalıyken kapı GEÇİRGEN: bu faz, sunucu bayrağı açılmadan
        // önce gönderilebiliyor ve hiçbir şey değişmiyor.
        setStatus(me.authDisabled || me.user ? "authed" : "anon");
      } catch (e) {
        if (!aliveRef.current) return;
        // Ağ/sunucu hatası ile "giriş yapılmamış" AYRI şeyler. 401 zaten
        // `fetchMe` içinde hata sayılmıyor; buraya yalnızca gerçek arıza düşer.
        setErr(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [tekrar]);

  // `api.ts`'teki herhangi bir istek 401 alırsa buraya düşer. Kayıt TEK yerden
  // yapılıyor çünkü her okuma/yazma yolu `fetchData`/`mutate`'ten geçiyor.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("anon");
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await authApi.login(email, password);
    setUser(u);
    setStatus("authed");
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const u = await authApi.register(email, password, name);
    setUser(u);
    setStatus("authed");
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus("anon");
  }, []);

  if (err) {
    return (
      <Center>
        <p className="text-sm text-ink-secondary">Sunucuya ulaşılamadı ({err}).</p>
        <button
          type="button"
          onClick={() => setTekrar((n) => n + 1)}
          className="mt-3 rounded-pill bg-accent px-4 py-2 text-sm font-extrabold text-accent-ink"
        >
          Tekrar dene
        </button>
      </Center>
    );
  }
  if (status === "loading") return <AppSkeleton />;

  return (
    <AuthCtx.Provider value={{ status, user, capabilities, authDisabled, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</div>;
}
