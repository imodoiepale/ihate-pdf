/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ilp: {
          red: '#e5322d',
          'red-hover': '#c91f1a',
          dark: '#33333b',
          muted: '#6c6c75',
          line: '#ececef',
          sand: '#f3f0ec',
          card: '#ffffff'
        }
      },
      fontFamily: {
        sans: ['"Noto Sans"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      boxShadow: {
        drop: '0 8px 30px rgba(51, 51, 59, 0.08)',
        bar: '0 -4px 18px rgba(51, 51, 59, 0.06)'
      }
    }
  },
  plugins: []
}
