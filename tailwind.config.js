/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#14213D', 900: '#0E172B', 800: '#14213D', 700: '#26355A', 600: '#3B4A70', 500: '#5B6787', 400: '#8590AC', 300: '#B4BCD0', 200: '#D7DCE7', 100: '#E9ECF3', 50: '#F3F5F9' },
        paper: { DEFAULT: '#F4F6F9', sheet: '#FFFFFF', edge: '#E3E7EE' },
        pencil: { DEFAULT: '#C8323C', soft: '#FBE9EA', deep: '#9E1F28' },
        tick: { DEFAULT: '#23795A', soft: '#E3F2EB', deep: '#175A42' },
        hilite: { DEFAULT: '#F7E463', soft: '#FDF7C9', deep: '#C9AE0F' },
        amber: { DEFAULT: '#B87A12', soft: '#FBF0DA' },
        slateblue: { DEFAULT: '#3D63C9', soft: '#E6ECFA' },
      },
      fontFamily: {
        display: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        sheet: '0 1px 0 rgba(20,33,61,0.04), 0 8px 24px -12px rgba(20,33,61,0.18)',
        pop: '0 24px 64px -24px rgba(14,23,43,0.45), 0 2px 6px rgba(14,23,43,0.08)',
        rail: 'inset -1px 0 0 rgba(255,255,255,0.06)',
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'] },
    },
  },
  plugins: [],
}
