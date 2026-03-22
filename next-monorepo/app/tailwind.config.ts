import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        eve: {
          bg: "#020304",
          panel: "rgba(8, 11, 16, 0.9)",
          "panel-border": "rgba(171, 190, 217, 0.22)",
          text: "#e7edf8",
          muted: "rgba(231, 237, 248, 0.62)",
          cold: "#9db6d8",
          danger: "#db7768",
          warn: "#d3b075",
          safe: "#9fd1b2",
          info: "#bdd4f1",
          gold: "#e4b480",
          glow: "rgba(122, 176, 227, 0.68)",
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "glow-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px rgba(243, 197, 142, 0.35) inset, 0 0 14px rgba(243, 197, 142, 0.16)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1px rgba(243, 197, 142, 0.5) inset, 0 0 24px rgba(243, 197, 142, 0.32)",
          },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.85)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "data-decrypt": {
          "0%": { opacity: "0", filter: "blur(4px)" },
          "50%": { opacity: "0.6", filter: "blur(1px)" },
          "100%": { opacity: "1", filter: "blur(0)" },
        },
      },
      animation: {
        scanline: "scanline 8s linear infinite",
        "glow-pulse": "glow-pulse 2.2s ease-in-out infinite",
        "slide-in": "slide-in 0.3s ease-out both",
        "pulse-dot": "pulse-dot 1.5s ease-in-out infinite",
        flicker: "flicker 3s ease-in-out infinite",
        "data-decrypt": "data-decrypt 0.6s ease-out both",
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".bg-eve-space": {
          background: `radial-gradient(1200px 580px at 92% -10%, rgba(82, 109, 152, 0.18), transparent 70%),
            radial-gradient(900px 460px at 8% 15%, rgba(137, 82, 70, 0.13), transparent 72%),
            linear-gradient(180deg, #020304, #040609 70%)`,
        },
        ".bg-eve-noise": {
          backgroundImage:
            "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 2px, transparent 7px)",
        },
        ".bg-eve-stars": {
          backgroundImage: `radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.4), transparent),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.2), transparent),
            radial-gradient(1px 1px at 70% 80%, rgba(255,255,255,0.35), transparent),
            radial-gradient(1px 1px at 90% 40%, rgba(255,255,255,0.25), transparent),
            radial-gradient(1px 1px at 15% 90%, rgba(255,255,255,0.3), transparent),
            radial-gradient(1px 1px at 85% 15%, rgba(255,255,255,0.2), transparent)`,
        },
      });
    }),
  ],
};

export default config;
