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
      lightGreen:"#22C55E",
      darkBlue: "#131E36",
      violet: "#634FD2",
      orange: "#FF6B35",
      lightBlack: "#333333"
    },
    screens: {
      ultraWild: "1472px",
      desktop: "1224px",
      tablet: "1024px",
      midTablet: "768px",
      mobile: "480px",
    },
    extend: {},
  },
  plugins: [require("@tailwindcss/typography")],
};
