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
      green: "#4EAD7A",
      darkBlue: "#131E36",
      violet: "#634FD2",
    },
    screens: {
      ultraWild: "1472px",
      desktop: "1224px",
      tablet: "1024px",
    },
    extend: {},
  },
  plugins: [require("@tailwindcss/typography")],
};
