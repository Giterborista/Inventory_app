import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#132021",
        slate: "#4b6165",
        mist: "#e5eeef",
        lab: "#f6fbfb",
        alert: "#7e1d16",
        accent: "#0d5d59",
      },
    },
  },
  plugins: [],
};

export default config;
