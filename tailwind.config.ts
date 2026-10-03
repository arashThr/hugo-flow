import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "media",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "background": "rgb(var(--c-background) / <alpha-value>)",
        "on-background": "rgb(var(--c-on-background) / <alpha-value>)",
        "surface": "rgb(var(--c-surface) / <alpha-value>)",
        "surface-dim": "rgb(var(--c-surface-dim) / <alpha-value>)",
        "surface-bright": "rgb(var(--c-surface-bright) / <alpha-value>)",
        "surface-container-lowest": "rgb(var(--c-surface-container-lowest) / <alpha-value>)",
        "surface-container-low": "rgb(var(--c-surface-container-low) / <alpha-value>)",
        "surface-container": "rgb(var(--c-surface-container) / <alpha-value>)",
        "surface-container-high": "rgb(var(--c-surface-container-high) / <alpha-value>)",
        "surface-container-highest": "rgb(var(--c-surface-container-highest) / <alpha-value>)",
        "surface-variant": "rgb(var(--c-surface-variant) / <alpha-value>)",
        "on-surface": "rgb(var(--c-on-surface) / <alpha-value>)",
        "on-surface-variant": "rgb(var(--c-on-surface-variant) / <alpha-value>)",
        "outline": "rgb(var(--c-outline) / <alpha-value>)",
        "outline-variant": "rgb(var(--c-outline-variant) / <alpha-value>)",
        "primary": "rgb(var(--c-primary) / <alpha-value>)",
        "on-primary": "rgb(var(--c-on-primary) / <alpha-value>)",
        "primary-container": "rgb(var(--c-primary-container) / <alpha-value>)",
        "on-primary-container": "rgb(var(--c-on-primary-container) / <alpha-value>)",
        "secondary": "rgb(var(--c-secondary) / <alpha-value>)",
        "tertiary": "rgb(var(--c-tertiary) / <alpha-value>)",
        "tertiary-container": "rgb(var(--c-tertiary-container) / <alpha-value>)",
        "on-tertiary-container": "rgb(var(--c-on-tertiary-container) / <alpha-value>)",
        "error": "rgb(var(--c-error) / <alpha-value>)",
        "error-container": "rgb(var(--c-error-container) / <alpha-value>)",
        "on-error-container": "rgb(var(--c-on-error-container) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      spacing: {
        md: "16px",
        xs: "4px",
        lg: "24px",
        base: "4px",
        "editor-width": "800px",
        sm: "8px",
        xl: "48px",
        "container-max": "1200px",
      },
      fontFamily: {
        "body-md": ["var(--font-inter)", "sans-serif"],
        "headline-md": ["var(--font-manrope)", "sans-serif"],
        "body-lg": ["var(--font-inter)", "sans-serif"],
        "headline-xl": ["var(--font-manrope)", "sans-serif"],
        "label-caps": ["var(--font-inter)", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-literata)", "ui-serif", "Georgia", "serif"],
        display: ["var(--font-manrope)", "var(--font-inter)", "sans-serif"],
      },
      fontSize: {
        "body-md": ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-md": ["24px", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.7", fontWeight: "400" }],
        "headline-xl": ["36px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        "label-caps": ["12px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "600" }],
        mono: ["14px", { lineHeight: "1.5", fontWeight: "400" }],
      },
    },
  },
  plugins: [
    forms({ strategy: "class" }),
    containerQueries,
    typography,
  ],
};

export default config;
