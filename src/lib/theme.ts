import { createContext, createElement, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PREF, readStringPref, writeStringPref } from "./prefs";

/** Desteklenen tema adları. "velvet" bugünkü varsayılan görünüm; "glass" ikinci,
 *  cam yüzeyli alternatif. Anahtar string'i `PREF.theme` altında saklanır. */
export type Theme = "velvet" | "glass";

/** Ham tercih değerini geçerli bir temaya indirger: yalnızca "glass" tanınır,
 *  diğer her şey (null, boş, bozuk, bilinmeyen) güvenli varsayılan "velvet"e
 *  düşer. Böylece yanlış/gelecekteki bir değer uygulamayı bozamaz. */
export function resolveTheme(raw: string | null): Theme {
  return raw === "glass" ? "glass" : "velvet";
}

/** Tema etkisini DOM'a uygular. `document` yoksa (SSR/test) hiçbir şey yapmaz;
 *  erişim patlarsa sessizce yutulur — bu bir UI tercihi, kritik veri değil. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  try {
    const root = document.documentElement;
    if (theme === "glass") {
      root.setAttribute("data-theme", "glass");
    } else {
      root.removeAttribute("data-theme");
    }
    // Tarayıcı adres çubuğu rengi (theme-color) temayla birlikte güncellenir.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "glass" ? "#05050a" : "#171622");
  } catch {
    // sessizce yut — tema yan etkisi kritik değil, kullanıcı akışını bozmasın
  }
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "velvet",
  setTheme: () => {},
});

/** Uygulamanın temasını tutar ve DOM'a uygular. En dışta sarılı olmalı ki
 *  `AuthScreen` ve portal modalları da temalandırılsın. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    resolveTheme(readStringPref(PREF.theme, "velvet")),
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    writeStringPref(PREF.theme, t);
    setThemeState(t);
  };

  return createElement(ThemeContext.Provider, { value: { theme, setTheme } }, children);
}

/** Geçerli temayı ve değiştiriciyi döner. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  return useContext(ThemeContext);
}
