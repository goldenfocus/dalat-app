import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Optimize for production builds
  ...(process.env.NODE_ENV === 'production' && {
    safelist: [
      // Keep essential utility classes
      'dark',
      'light',
      'antialiased',
    ],
  }),
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Dã quỳ yellow — reserved for the single primary action on a screen
        sun: {
          DEFAULT: "hsl(var(--sun))",
          foreground: "hsl(var(--sun-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Dalat extended palette for badges, highlights, category colors
        dalat: {
          coffee: {
            DEFAULT: "hsl(var(--dalat-coffee))",
            light: "hsl(var(--dalat-coffee-light))",
          },
          pine: {
            DEFAULT: "hsl(var(--dalat-pine))",
            light: "hsl(var(--dalat-pine-light))",
          },
          hydrangea: {
            DEFAULT: "hsl(var(--dalat-hydrangea))",
            light: "hsl(var(--dalat-hydrangea-light))",
          },
          gold: {
            DEFAULT: "hsl(var(--dalat-gold))",
            light: "hsl(var(--dalat-gold-light))",
          },
          mist: {
            DEFAULT: "hsl(var(--dalat-mist))",
            light: "hsl(var(--dalat-mist-light))",
          },
        },
      },
      // Each radius reads an optional --fog-* override and otherwise keeps its
      // current value, so the Fog Hour preview (html.fog) can square every
      // corner without changing a pixel anywhere else.
      // rounded-pill = a text chip or filter: a full pill today, a timetable
      // cell under Fog Hour. Avatars, dots and spinners stay on rounded-full.
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--fog-radius, calc(var(--radius) - 2px))",
        sm: "var(--fog-radius-sm, calc(var(--radius) - 4px))",
        DEFAULT: "var(--fog-radius, 0.25rem)",
        xl: "var(--fog-radius-xl, 0.75rem)",
        "2xl": "var(--fog-radius-2xl, 1rem)",
        "3xl": "var(--fog-radius-3xl, 1.5rem)",
        pill: "var(--fog-radius, 9999px)",
      },
      keyframes: {
        ripple: {
          "0%": { width: "0px", height: "0px", opacity: "0.4" },
          "100%": { width: "500px", height: "500px", opacity: "0" },
        },
        "press-in": {
          "0%": { transform: "scale(1)" },
          "100%": { transform: "scale(0.97)" },
        },
        "press-out": {
          "0%": { transform: "scale(0.97)" },
          "100%": { transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "1" },
          "70%, 100%": { transform: "scale(1.3)", opacity: "0" },
        },
        "bounce-gentle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        // Hero section animations for Dalat vibes
        "hero-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
        "hero-fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        ripple: "ripple 0.6s ease-out forwards",
        "press-in": "press-in 0.1s ease-out forwards",
        "press-out": "press-out 0.2s ease-out forwards",
        shimmer: "shimmer 2s infinite linear",
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
        "bounce-gentle": "bounce-gentle 2s ease-in-out infinite",
        // Hero section animations
        "hero-breathe": "hero-breathe 20s ease-in-out infinite",
        "hero-fade-up": "hero-fade-up 0.6s ease-out forwards",
        marquee: "marquee 20s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
