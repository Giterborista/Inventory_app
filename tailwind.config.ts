import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        slate: "rgb(var(--muted-rgb) / <alpha-value>)",
        mist: "rgb(var(--line-rgb) / <alpha-value>)",
        lab: "rgb(var(--control-rgb) / <alpha-value>)",
        alert: "rgb(var(--alert-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-rgb) / 0.12)",
        sea: "rgb(var(--muted-rgb) / <alpha-value>)",
        "scale-1": "rgb(var(--accent-rgb) / <alpha-value>)",
        "scale-2": "rgb(var(--accent-rgb) / <alpha-value>)",
        "scale-3": "rgb(var(--line-rgb) / <alpha-value>)",
        "scale-4": "rgb(var(--panel-rgb) / <alpha-value>)",
        "scale-5": "rgb(var(--bg-rgb) / <alpha-value>)",
        helper: "rgb(var(--helper-rgb) / <alpha-value>)",
        "helper-soft": "rgb(var(--helper-soft-rgb) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
