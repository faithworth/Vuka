import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        border: 'var(--border)',
        sky: 'var(--sky)',
        'sky-dark': 'var(--sky-dark)',
        gold: 'var(--gold)',
        red: 'var(--red)',
        'red-dark': 'var(--red-dark)',
        green: 'var(--green)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        // Legacy aliases — keep so existing Tailwind classes still compile
        purple: 'var(--sky)',
        'purple-light': 'var(--sky)',
      },
      backgroundImage: {
        'gradient-glow': 'radial-gradient(ellipse at 50% 0%, rgba(56,182,232,0.12) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
};

export default config;
