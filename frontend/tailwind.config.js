/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#171326',
        muted: '#746f86',
        brand: '#7548f5',
        brandSoft: '#eee9ff',
        danger: '#eb4667',
        success: '#18a957',
        warning: '#f59e0b',
      },
      boxShadow: {
        card: '0 18px 60px rgba(54, 38, 104, 0.08)',
        glow: '0 14px 40px rgba(117, 72, 245, 0.28)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
