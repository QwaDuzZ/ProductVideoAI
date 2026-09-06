/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#060606",
        panel: "#101013",
        "panel-2": "#17171B",
        edge: "#26262C",
        "edge-hi": "#3C3C44",
        snow: "#FAFAFA",
        fog: "#A3A3AB",
        mist: "#67676F",
        magenta: "#FF2E9A",
        orange: "#FF6B2D",
        yellow: "#FFC53D",
        success: "#3ECF8E",
        danger: "#FF5C5C",
        queue: "#8AB4FF",
      },
      fontFamily: {
        display: ['"Inter"', "sans-serif"],
        body: ['"Inter"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        manifest: ["3rem", { lineHeight: "1.1", fontWeight: "800", letterSpacing: "-0.04em" }],
        "manifest-lg": ["4rem", { lineHeight: "1.1", fontWeight: "800", letterSpacing: "-0.04em" }],
        "manifest-xl": ["6rem", { lineHeight: "1.05", fontWeight: "800", letterSpacing: "-0.04em" }],
      },
      borderRadius: {
        sm: "10px",
        md: "12px",
        lg: "16px",
      },
      borderWidth: {
        DEFAULT: "1px",
      },
      animation: {
        "ocean-drift": "oceanDrift 25s linear infinite",
        "pulse-magenta": "pulseMagenta 2s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        oceanDrift: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulseMagenta: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
