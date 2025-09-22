/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { mc: ['"Minecraftia"', 'sans-serif'] },
      colors: {
        glass: 'rgba(255,255,255,0.08)',
        base: '#0e0f12',
        panel: 'rgba(255,255,255,0.06)',
        stroke: 'rgba(255,255,255,0.18)'
      },
      boxShadow: { glass: '0 20px 80px rgba(0,0,0,0.45), inset 0 1px rgba(255,255,255,0.06)' },
      backdropBlur: { xs: '2px' }
    }
  },
  plugins: []
}
