import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 与 app/globals.css 的 token 一一对应
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        "text-dim": "var(--text-dim)",
      },
      fontFamily: {
        // 三个角色：展示标题 / 拉丁正文 / 中文
        display: ["var(--font-boska)", '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', "SimHei", "Arial", "Helvetica", "sans-serif"],
        sans: ["var(--font-satoshi)", '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', "SimHei", "Arial", "Helvetica", "sans-serif"],
        cn: ["var(--font-alimama)", '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', "sans-serif"],
      },
      animation: {
        "fade-up": "fadeUp 1s ease-out forwards",
        "fade-in": "fadeIn 1.2s ease-out forwards",
        "arrow-pulse": "arrowPulse 1.8s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        arrowPulse: {
          "0%, 100%": { transform: "translateX(0)" },
          "50%": { transform: "translateX(8px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
