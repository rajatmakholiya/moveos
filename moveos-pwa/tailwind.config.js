/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          50: 'var(--teal-50)',
          100: 'var(--teal-100)',
          400: 'var(--teal-400)',
          600: 'var(--teal-600)',
          700: 'var(--teal-700)',
          800: 'var(--teal-800)',
          900: 'var(--teal-900)',
        },
        stone: {
          50: 'var(--stone-50)',
          100: 'var(--stone-100)',
          300: 'var(--stone-300)',
          500: 'var(--stone-500)',
          700: 'var(--stone-700)',
          800: 'var(--stone-800)',
          900: 'var(--stone-900)',
        },
        amber: {
          50: 'var(--amber-50)',
          400: 'var(--amber-400)',
          700: 'var(--amber-700)',
        },
        red: {
          50: 'var(--red-50)',
          600: 'var(--red-600)',
        },
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['2rem', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }],
        title: ['1.375rem', { lineHeight: '1.25', fontWeight: '600' }],
        heading: ['1.125rem', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['0.9375rem', { lineHeight: '1.6' }],
        small: ['0.8125rem', { lineHeight: '1.5' }],
        micro: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 2px 12px rgba(0,0,0,0.07)',
      },
    },
  },
  plugins: [],
};

module.exports = config;
