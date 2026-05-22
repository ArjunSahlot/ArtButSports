import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#030405",
        surface: "#080a0e",
        panel: "#0b0e13",
        elevated: "#111622",
        line: "#1d2633",
        "line-strong": "#314154",
        fg: "#fbfcff",
        "fg-muted": "#aab4c4",
        "fg-dim": "#687386",
        accent: "#19d7c1",
        "accent-bright": "#2da1ff",
        "accent-deep": "#0f766e",
        neonBlue: "#1697ff",
        neonTeal: "#19d7c1",
        neonOrange: "#ff8a00",
        neonPurple: "#a549ff",
        danger: "#ff4778"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.6)",
        lift: "0 2px 4px rgba(0,0,0,0.5), 0 20px 48px -12px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(25,215,193,0.25), 0 0 32px rgba(45,161,255,0.18), 0 18px 56px -20px rgba(165,73,255,0.35)"
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "translate(-50%,-48%) scale(0.97)" },
          "100%": { opacity: "1", transform: "translate(-50%,-50%) scale(1)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        "drift": {
          "0%,100%": { transform: "translate(0,0)" },
          "50%": { transform: "translate(2%,3%)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.4s ease both",
        "scale-in": "scale-in 0.22s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 1.8s linear infinite",
        "spin-slow": "spin-slow 0.9s linear infinite",
        drift: "drift 24s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
