/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-line': 'var(--ink-line)',
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        text: 'var(--text)',
        'text-strong': 'var(--text-strong)',
        muted: 'var(--muted)',
        'muted-2': 'var(--muted-2)',
        accent: 'var(--accent)',
        'accent-d': 'var(--accent-d)',
        'accent-tint': 'var(--accent-tint)',
        'hat-red': 'var(--hat-red)',
        'hat-yellow': 'var(--hat-yellow)',
        'hat-blue': 'var(--hat-blue)',
        'hat-green': 'var(--hat-green)',
        warn: 'var(--warn)',
        'warn-tint': 'var(--warn-tint)',
        ok: 'var(--ok)',
        'ok-tint': 'var(--ok-tint)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: '6px',
        lg: '14px',
        full: '9999px',
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
