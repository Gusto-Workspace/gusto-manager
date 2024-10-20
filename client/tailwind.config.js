/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./pages/**/*.{js,ts,jsx,tsx}"],
  theme: {
    colors: {
      white: "#FFFFFF",
      lightGrey: "#F3f2f8",
      black: "#000000",
      red: "#FF7664",
      blue: "#4583FF",
      green: "#D5F346",
      darkBlue: "#131E36",
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
