/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf0fb",
          100: "#fce4f7",
          200: "#f9bfeb",
          300: "#f48bda",
          400: "#ed4cc2",
          500: "#e41f9f",
          600: "#c2138b",
          700: "#9c0f71",
        },
      },
    },
  },
  plugins: [],
};