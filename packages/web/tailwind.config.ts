import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "media",
  theme: {
    colors: {
      // MTA official line colors
      mta: {
        "1": "#EE352E",
        "2": "#EE352E",
        "3": "#EE352E",
        "4": "#00933C",
        "5": "#00933C",
        "6": "#00933C",
        "7": "#B933AD",
        a: "#0039A6",
        c: "#0039A6",
        e: "#0039A6",
        b: "#FF6319",
        d: "#FF6319",
        f: "#FF6319",
        m: "#FF6319",
        g: "#6CBE45",
        j: "#996633",
        z: "#996633",
        l: "#A7A9AC",
        n: "#FCCC0A",
        q: "#FCCC0A",
        r: "#FCCC0A",
        w: "#FCCC0A",
        s: "#808183",
        sir: "#1D2F6F",
        // Theme colors
        primary: "#0039A6",
        // Alert severity colors
        severe: "#EE352E",
        warning: "#FCCC0A",
        info: "#808183",
      },
      // UI colors - Light mode defaults (WCAG AA compliant)
      background: "#FFFFFF",
      surface: "#F5F5F5",
      "text-primary": "#1A1A1A",
      // WCAG AA: 4.5:1 contrast on white (#555555 → #444444)
      "text-secondary": "#444444",
      // Alert colors
      severe: "#EE352E",
      warning: "#FCCC0A",
      info: "#808183",
      // Semantic
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",
      black: "#000000",
    },
    fontFamily: {
      sans: [
        "system-ui",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ],
    },
    fontSize: {
      "11": ["0.6875rem", { lineHeight: "1" }],
      "13": ["0.8125rem", { lineHeight: "1.3" }],
      "15": ["0.9375rem", { lineHeight: "1.4" }],
      base: ["1rem", { lineHeight: "1.4" }],
      lg: ["1.125rem", { lineHeight: "1.4" }],
      xl: ["1.25rem", { lineHeight: "1.2" }],
      "2xl": ["1.5rem", { lineHeight: "1" }],
      "3xl": ["1.875rem", { lineHeight: "1.1" }],
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
      extrabold: "800",
    },
    spacing: {
      px: "1px",
      "0": "0",
      "0.5": "2px",
      "1": "4px",
      "2": "8px",
      "3": "12px",
      "4": "16px",
      "5": "20px",
      "6": "24px",
      "7": "28px",
      "8": "32px",
      "10": "40px",
      "12": "48px",
      "14": "56px",
      "16": "64px",
      "20": "80px",
      "24": "96px",
    },
    borderRadius: {
      none: "0",
      sm: "4px",
      DEFAULT: "8px",
      md: "12px",
      lg: "16px",
      xl: "24px",
      "2xl": "32px",
      full: "9999px",
    },
    boxShadow: {
      sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    },
    extend: {
      colors: {
        // Dark mode overrides - used with dark: prefix
        dark: {
          background: "#121212",
          surface: "#1E1E1E",
          "text-primary": "#E8E8E8",
          "text-secondary": "#999999",
        },
      },
      spacing: {
        // Safe area insets for notched phones
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
      minHeight: {
        touch: "44px", // Minimum touch target
      },
      minWidth: {
        touch: "44px",
      },
    },
  },
} satisfies Config;
