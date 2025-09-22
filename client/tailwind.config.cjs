/** @type {import('tailwindcss').Config} */
module.exports = { content:['./index.html','./src/**/*.{js,jsx}'],
  theme:{ extend:{
    fontFamily:{ mc:['"Minecraftia"','sans-serif'] },
    colors:{ panel:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.18)' },
    boxShadow:{ glass:'0 20px 80px rgba(0,0,0,0.45), inset 0 1px rgba(255,255,255,0.06)' }
  }}, plugins:[] }
