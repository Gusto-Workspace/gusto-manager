/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./pages/**/*.{js,ts,jsx,tsx}"],
  theme: {
    colors: {
      white: "#FFFFFF",
    },
    screens: {
      ultraWild: "1400px",
      desktop: "1024px",
      tablet: "768px",
    },
    extend: {},
  },
  plugins: [],
};
