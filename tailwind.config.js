/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ROP brand palette — deep navy + warm gold, distinct from Slack's aubergine.
        brand: {
          50: '#eef2fb',
          100: '#d6def4',
          200: '#adbde9',
          300: '#7f95d9',
          400: '#5570c4',
          500: '#3a53a8',
          600: '#2c3f85',
          700: '#243469',
          800: '#1f2a44',
          900: '#161d33',
          950: '#0f1420',
        },
        gold: {
          50: '#fdf8ed',
          100: '#f8ecc9',
          200: '#f0d78e',
          300: '#e8bf55',
          400: '#e0a92f',
          500: '#c78a1f',
          600: '#a66a19',
          700: '#854e1a',
          800: '#6f3f1b',
          900: '#5f351a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseAlert: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.5)' },
          '50%': { boxShadow: '0 0 0 8px rgba(220,38,38,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'pulse-alert': 'pulseAlert 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
