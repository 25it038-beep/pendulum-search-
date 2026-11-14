import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.resolve(__dirname, 'index.html'),
    path.resolve(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#090a0c',
          900: '#111316',
          850: '#171a1e',
          800: '#1c2026',
          750: '#20242a',
          700: '#282d35',
          600: '#383f4a'
        },
        gold: {
          50: '#FCF9EE',
          100: '#F7F2D7',
          200: '#f0dcae',
          300: '#e2c78c',
          400: '#d2b477', // Champagne Gold primary
          500: '#c09a4b',
          600: '#a47e2f',
          700: '#7f5e19',
          800: '#5f4416',
          900: '#412d10'
        }
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        serif: ['Cinzel', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'gold-glow': '0 0 28px -6px rgba(210, 180, 119, 0.28)',
        'gold-glow-lg': '0 0 42px -6px rgba(210, 180, 119, 0.4)',
        'obsidian-elevated': '0 18px 55px rgba(0, 0, 0, 0.48)'
      }
    },
  },
  plugins: [],
}
