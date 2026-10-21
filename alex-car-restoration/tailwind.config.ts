import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#0B0D0F",
        graphite: "#1A1D21",
        silver: "#B8BDC3",
        warm: "#F5F5F2",
        racing: "#A51C30",
        brass: "#B59A6D",
      },
      fontFamily: {
        display: ['"Neue Haas Grotesk Display"', '"Neue Haas Grotesk"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      letterSpacing: { wider2: "0.18em" },
    },
  },
  plugins: [],
};
export default config;
