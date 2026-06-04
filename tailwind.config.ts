import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Vuka Design System colors ─────────────────────────────
      colors: {
        'bg-primary':       '#0A0A0A',
        'bg-secondary':     '#111111',
        'bg-tertiary':      '#1A1A1A',
        'accent-green':     '#A0E87C',
        'accent-green-dim': '#6BB84A',
        'accent-gold':      '#E8C87C',
        'text-primary':     '#F5F5F5',
        'text-secondary':   '#A0A0A0',
        'text-tertiary':    '#6B6B6B',
        'danger':           '#FF4D4D',
        'warning':          '#E8A87C',
        'success':          '#A0E87C',
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong:  'rgba(255,255,255,0.15)',
        },
      },

      // ── Typography ───────────────────────────────────────────
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        sans:    ['DM Sans', 'sans-serif'],
      },

      // ── 8px grid spacing ─────────────────────────────────────
      spacing: {
        '0.5': '4px',
        '1':   '8px',
        '1.5': '12px',
        '2':   '16px',
        '2.5': '20px',
        '3':   '24px',
        '4':   '32px',
        '5':   '40px',
        '6':   '48px',
        '8':   '64px',
        '10':  '80px',
        '12':  '96px',
        '16':  '128px',
      },

      // ── Border radius per design spec ────────────────────────
      borderRadius: {
        sm:  '4px',   // inputs
        md:  '8px',   // cards
        lg:  '16px',  // modals
        xl:  '24px',  // hero elements
        full: '9999px',
      },

      // ── Breakpoints (375 → 768 → 1280 → 1920) ────────────────
      screens: {
        xs:  '375px',
        sm:  '640px',
        md:  '768px',
        lg:  '1024px',
        xl:  '1280px',
        '2xl': '1920px',
      },

      // ── Box shadows ──────────────────────────────────────────
      boxShadow: {
        glow:    '0 0 30px rgba(160,232,124,0.15)',
        'glow-sm': '0 0 15px rgba(160,232,124,0.10)',
        card:    '0 4px 24px rgba(160,232,124,0.06)',
        modal:   '0 24px 64px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};

export default config;
