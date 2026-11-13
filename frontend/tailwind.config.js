/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#070709',
          900: '#0B0B0E',
          850: '#111116',
          800: '#16161D',
          750: '#1D1D26',
          700: '#252532',
          600: '#38384A'
        },
        gold: {
          50: '#FCF9EE',
          100: '#F7F2D7',
          200: '#EFE2AA',
          300: '#E6CA65',
          400: '#D4AF37', // Champagne Gold primary
          500: '#C09A2B',
          600: '#A47E1F',
          700: '#7F5E19',
          800: '#5F4416',
          900: '#412D10'
        }
      },
      fontFamily: {
        serif: ['Cinzel', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'gold-glow': '0 0 25px -5px rgba(212, 175, 55, 0.25)',
        'gold-glow-lg': '0 0 35px -5px rgba(212, 175, 55, 0.4)'
      }
    },
  },
  plugins: [],
}
