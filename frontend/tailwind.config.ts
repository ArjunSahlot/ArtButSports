import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050505",
        panel: "#0d0d10",
        line: "#25252b",
        glow: "#37ffb4",
        roseglow: "#ff4778"
      }
    }
  },
  plugins: []
};

export default config;

