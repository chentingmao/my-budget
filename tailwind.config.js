/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'selector', // 👈 新增這一行，啟用手動切換
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}