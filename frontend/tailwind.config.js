/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/**/*.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'kexp-black': '#000000',
        'kexp-white': '#ffffff',
        'kexp-gray': '#333333',
        'kexp-light-gray': '#666666'
      },
      fontFamily: {
        'sans': ['Arial', 'Helvetica', 'sans-serif']
      }
    },
  },
  plugins: [],
}