/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CAL AI design tokens
        app: "#0D0D14",
        calCard: "rgba(255,255,255,0.05)",
        calBorder: "rgba(255,255,255,0.08)",
        surface: "rgba(255,255,255,0.05)",
        "surface-strong": "rgba(255,255,255,0.08)",
        line: "rgba(255,255,255,0.08)",
        elevated: "#0c0d10",
        "elevated-2": "#15161a",
        ink: {
          primary: "#FFFFFF",
          secondary: "#8E8E93",
          tertiary: "#636366",
          faint: "#52525b",
        },
        protein: "#FF6B8A", // pink-red
        carb: "#FFB84D", // orange-gold
        fat: "#5B8DEF", // blue
        fab: "#4DD4E6", // cyan/turquoise
        streak: { bg: "rgba(255,255,255,0.1)", text: "#FFFFFF" },
        memory: "#a78bfa", // mor (lif / hafıza)
        "memory-deep": "#8b6df2", // memory gradyanının koyu ucu
        "memory-ink": "#1e1b4b", // memory zemin üstü koyu metin
        micro: "#94a3b8", // mikro besinlerin ORTAK sessiz tonu
        accent: "#4DD4E6",
        "accent-ink": "#092e38",
        warn: "#FFB84D",
        danger: "#ff8080",
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
        card: "20px",
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
