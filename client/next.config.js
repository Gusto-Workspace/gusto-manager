const { i18n } = require("./next-i18next.config");
const defaultRuntimeCaching = require("next-pwa/cache");
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname === "/api" || url.pathname.startsWith("/api/"),
      method: "GET",
      handler: "NetworkOnly",
      options: { fetchOptions: { cache: "no-store" } },
    },
    ...defaultRuntimeCaching.filter(({ options }) => options?.cacheName !== "apis"),
  ],
});

module.exports = withPWA({
  reactStrictMode: false,
  pageExtensions: ["api.js", "page.js"],
  i18n,
  async headers() {
    // Revalidate installation metadata; next-pwa also revisions public assets.
    return [
      "/manifest.webmanifest",
      "/icons/android/gusto-:size.png",
      "/icons/ios/gusto-:size.png",
    ].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      ],
    }));
  },
});
