import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10243a",
        slate: "#667586",
        mist: "#d8e1ea",
        lab: "#f4f7fa",
        alert: "#b94855",
        accent: "#173b5f",
        sea: "#4f9a91",
      },
    },
  },
  plugins: [],
};

export default config;
