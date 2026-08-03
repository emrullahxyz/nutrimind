/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cal AI Soft Velvet Dark design tokens (Screenshot Replica)
        app: "#171622",
        calCard: "#22202E",
        calBorder: "rgba(255,255,255,0.06)",
        line: "rgba(255,255,255,0.06)",
        "elevated-2": "#22202E",
        ink: {
          primary: "#FFFFFF",
          secondary: "#A5A2B8", // Soft lavender-gray muted label text
          tertiary: "#7A7791",
          faint: "#56546B",
        },
        protein: "#E57373", // Soft pastel dusty rose
        carb: "#FFB74D", // Soft pastel amber gold
        fat: "#64B5F6", // Soft pastel ice blue
        fab: "#FFFFFF",
        streak: { bg: "#282537", text: "#FFFFFF" },
        memory: "#B388FF",
        "memory-deep": "#7C4DFF",
        "memory-ink": "#1E1B4B",
        micro: "#A5A2B8",
        accent: "#FFB74D",
        "accent-ink": "#1A1926",
        warn: "#FFB74D",
        danger: "#E57373",
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
