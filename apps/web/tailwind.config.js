/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#F7941D',
          deep: '#E5622A',
          yellow: '#F9B33F',
          ink: '#14161A',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 10px 30px -10px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
