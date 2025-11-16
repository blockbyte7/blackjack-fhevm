import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Poker-specific theme colors
        felt: {
          primary: "hsl(var(--felt-primary))",
          secondary: "hsl(var(--felt-secondary))",
          border: "hsl(var(--felt-border))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold-accent))",
          muted: "hsl(var(--gold-muted))",
        },
        chip: {
          red: "hsl(var(--chip-red))",
          blue: "hsl(var(--chip-blue))",
          green: "hsl(var(--chip-green))",
          black: "hsl(var(--chip-black))",
          white: "hsl(var(--chip-white))",
        },
        suit: {
          red: "hsl(var(--suit-red))",
          black: "hsl(var(--suit-black))",
        },
        wood: {
          DEFAULT: "hsl(var(--wood))",
          dark: "hsl(var(--wood-dark))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        // Poker-specific animations
        "card-flip": {
          "0%": { transform: "rotateY(0deg) scale(1)" },
          "50%": { transform: "rotateY(90deg) scale(0.9)" },
          "100%": { transform: "rotateY(0deg) scale(1)" }
        },
        "card-deal": {
          "0%": { transform: "translate(200px, -100px) rotate(20deg) scale(0.8)", opacity: "0" },
          "100%": { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: "1" }
        },
        "chip-fly": {
          "0%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-20px) scale(1.1)" },
          "100%": { transform: "translateY(0) scale(1)" }
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 5px hsl(var(--gold-accent) / 0.5)" },
          "50%": { boxShadow: "0 0 20px hsl(var(--gold-accent) / 0.8)" }
        },
        "dealer-button": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "card-flip": "card-flip 0.6s ease-in-out",
        "card-deal": "card-deal 0.8s ease-out",
        "chip-fly": "chip-fly 0.5s ease-in-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "dealer-button": "dealer-button 1s ease-in-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
