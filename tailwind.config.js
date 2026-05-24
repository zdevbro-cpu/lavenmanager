/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0b0f19',
        'bg-secondary': '#131b2e',
        'bg-card': '#1e293b',
        'text-primary': '#f8fafc',
        'text-secondary': '#94a3b8',
        'accent-indigo': '#6366f1',
        'accent-hover': '#4f46e5',
        'border-color': '#334155',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans KR', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
