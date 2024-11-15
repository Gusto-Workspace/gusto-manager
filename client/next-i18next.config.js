const path = require("path");

/** @type {import('next-i18next').UserConfig} */
module.exports = {
  i18n: {
    locales: ["en", "fr"],
    defaultLocale: "fr",
    localeDetection: false,
  },
  localePath: path.resolve("./public/locales"),
};
