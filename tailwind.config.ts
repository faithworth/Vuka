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
        purple: 'var(--purple)',
        'purple-light': 'var(--purple-light)',
        gold: 'var(--gold)',
        green: 'var(--green)',
      },
      backgroundImage: {
        'gradient-glow': 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
};

export default config;
