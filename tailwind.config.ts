/**
 * 🎨 Tailwind CSS Configuration for IdeaBox
 *
 * Configures Tailwind with CSS variables for theming, animations
 * for component transitions, and custom utilities.
 *
 * The color system uses CSS variables defined in globals.css,
 * enabling easy light/dark mode switching and future theming.
 */

import type { Config } from 'tailwindcss';

const config: Config = {
  // Enable dark mode via class (allows manual toggling)
  darkMode: ['class'],

  // Files to scan for class usage
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  theme: {
    // Container configuration
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },

    extend: {
      // ═══════════════════════════════════════════════════════════════════════
      // COLOR SYSTEM
      // ═══════════════════════════════════════════════════════════════════════
      // Uses CSS variables for easy theming and dark mode support.
      // Variables are defined in src/app/globals.css
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // Primary colors (actions, links, focus)
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },

        // Secondary colors (less prominent elements)
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },

        // Destructive colors (errors, delete actions)
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },

        // Muted colors (subtle backgrounds, disabled states)
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },

        // Accent colors (highlights, hover states)
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },

        // Popover colors (dropdowns, tooltips)
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        // Card colors (content containers)
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },

      // ═══════════════════════════════════════════════════════════════════════
      // BORDER RADIUS
      // ═══════════════════════════════════════════════════════════════════════
      // Consistent border radius using CSS variable
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      // ═══════════════════════════════════════════════════════════════════════
      // ANIMATIONS
      // ═══════════════════════════════════════════════════════════════════════
      // Keyframes for component animations (dialogs, dropdowns, etc.)
      keyframes: {
        // Accordion animations
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },

      // Animation utility classes
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },

  // Tailwind plugins
  plugins: [
    // Add tailwindcss-animate for enter/exit animations
    require('tailwindcss-animate'),
  ],
};

export default config;
