/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ilp: {
          red: '#e42722',
          'red-hover': '#c91c18',
          dark: '#1c1c24',
          muted: '#6a6a74',
          line: '#ececef',
          sand: '#f4f1ec',
          card: '#ffffff',
          wash: '#fff7f6'
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Noto Sans', 'Roboto', 'Helvetica', 'Arial', 'sans-serif']
      },
      boxShadow: {
        drop: '0 12px 40px rgba(28, 28, 36, 0.08)',
        bar: '0 -8px 24px rgba(28, 28, 36, 0.06)',
        card: '0 1px 2px rgba(28, 28, 36, 0.04), 0 8px 24px rgba(28, 28, 36, 0.04)'
      },
      letterSpacing: {
        tightest: '-0.03em'
      }
    }
  },
  plugins: []
}
