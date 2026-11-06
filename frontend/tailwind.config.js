/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F3EFE7',
        ink: '#1C2B29',
        moss: '#1F6B62',
        mossdeep: '#154E48',
        mist: '#E7F2F0',
        line: '#E3D9CC',
        clay: '#A33B32',
        sand: '#FFFCF7',
        muted: '#5C6B68',
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 43, 41, 0.04), 0 8px 24px rgba(28, 43, 41, 0.04)',
      },
    },
  },
  plugins: [],
};
