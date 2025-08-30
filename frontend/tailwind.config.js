/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'kexp-orange': {
          DEFAULT: '#ff6600',
          50: '#fff4e6',
          100: '#ffe0b3',
          200: '#ffcc80',
          300: '#ffb74d',
          400: '#ffa726',
          500: '#ff6600',
          600: '#e65c00',
          700: '#cc5200',
          800: '#b34700',
          900: '#993d00',
        },
        'kexp-black': '#000000',
        'kexp-gray': {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        }
      },
      fontFamily: {
        'mono': ['Courier New', 'monospace'],
      },
      animation: {
        'pulse-orange': 'pulse-orange 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-orange': {
          '0%, 100%': { 
            boxShadow: '0 0 0 0 rgba(255, 102, 0, 0.4)' 
          },
          '50%': { 
            boxShadow: '0 0 0 10px rgba(255, 102, 0, 0)' 
          },
        }
      }
    },
  },
  plugins: [],
}