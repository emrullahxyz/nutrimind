/** @type {import('tailwindcss').Config} */

// CSS değişkenine alfa desteği ekleyen yardımcı: bir token adını alıp
// `rgb(var(--X) / calc(var(--X-a, 1) * <alpha-value>))` kalıbına yerleştirir.
// `<alpha-value>` Tailwind'in kendi alfa yer tutucusudur; `bg-app/50` gibi
// kullanımlarda gerçek opaklıkla değiştirilir. `-a` refakatçi değişkeni
// (örn. --cal-card-a) glass temasında yarı saydam dolgular için kullanılır.
function withAlpha(n) {
  return `rgb(var(--${n}) / calc(var(--${n}-a, 1) * <alpha-value>))`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cal AI Soft Velvet Dark design tokens (Screenshot Replica).
        // Değerler artık src/index.css `:root` içindeki CSS değişkenleriyle
        // çözülür; "glass" teması aynı değişkenleri data-theme="glass" ile ezer.
        app: withAlpha("app"),
        calCard: withAlpha("cal-card"),
        calBorder: "var(--cal-border)",
        line: "var(--line)",
        "line-faint": "var(--line-faint)",
        "elevated-2": withAlpha("elevated-2"),
        ink: {
          primary: withAlpha("ink-primary"),
          secondary: withAlpha("ink-secondary"), // Soft lavender-gray muted label text
          tertiary: withAlpha("ink-tertiary"),
          faint: withAlpha("ink-faint"),
        },
        protein: withAlpha("protein"), // Sönük toz pastel gül (muted dusty rose)
        "protein-bright": withAlpha("protein-bright"),
        "protein-ink": withAlpha("protein-ink"),
        carb: withAlpha("carb"), // Sönük toz pastel şampanya altını
        "carb-bright": withAlpha("carb-bright"),
        "carb-ink": withAlpha("carb-ink"),
        fat: withAlpha("fat"), // Sönük toz pastel pudra mavisi
        "fat-bright": withAlpha("fat-bright"),
        "fat-ink": withAlpha("fat-ink"),
        fab: withAlpha("fab"),
        streak: { bg: withAlpha("streak-bg"), text: withAlpha("streak-text") },
        memory: withAlpha("memory"), // Dumanlı lavanta (muted smoky lavender)
        "memory-deep": withAlpha("memory-deep"),
        "memory-ink": withAlpha("memory-ink"),
        micro: withAlpha("micro"),
        accent: withAlpha("accent"),
        "accent-ink": withAlpha("accent-ink"),
        warn: withAlpha("warn"),
        danger: withAlpha("danger"),
        under: withAlpha("under"),
        // Su takibi (v0.30.8) — --water/--water-ink iki tema bloğunda tanımlı.
        water: withAlpha("water"),
        "water-ink": withAlpha("water-ink"),
        // Yeni yüzey/durum token'ları (hepsi withAlpha — glass temasında yarı
        // saydam beyaz dolgulara dönüşebilir):
        bar: withAlpha("bar"),
        row: withAlpha("row"),
        "panel-alt": withAlpha("panel-alt"),
        footer: withAlpha("footer"),
        toast: withAlpha("toast"),
        field: withAlpha("field"),
        popover: withAlpha("popover"),
        "nav-item": withAlpha("nav-item"),
        "nav-item-hover": withAlpha("nav-item-hover"),
        "fab-panel": withAlpha("fab-panel"),
        "macro-chip": withAlpha("macro-chip"),
        well: withAlpha("well"),
        "well-hover": withAlpha("well-hover"),
        "cal-hover": withAlpha("cal-hover"),
        "day-selected": withAlpha("day-selected"),
        "icon-well": withAlpha("icon-well"),
        "grad-top": withAlpha("grad-top"),
        "grad-mid": withAlpha("grad-mid"),
        "grad-bot": withAlpha("grad-bot"),
        "grad-hover": withAlpha("grad-hover"),
        "goal-chip": withAlpha("goal-chip"),
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      screens: {
        fine: { raw: "(pointer: fine)" },
      },
      borderRadius: {
        chip: "12px",
        card: "24px",
        pill: "22px",
        phone: "42px",
      },
      letterSpacing: {
        mono: "0.1em",
      },
      keyframes: {
        pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
      },
      animation: {
        "memory-pulse": "pulse 1s ease-in-out infinite",
      },
      boxShadow: {
        float:
          "0 40px 90px -30px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.06)",
        card: "0 20px 50px -30px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.06)",
        memory: "0 2px 8px rgba(124,92,240,0.4)",
      },
    },
  },
  plugins: [],
};
