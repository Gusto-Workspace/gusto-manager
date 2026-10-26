importScripts("/push-worker-runtime.js?v=2026-10-26-isolation-1");
self.installGustoPushWorker({
  module: "take_away",
  basePath: "/dashboard/webapp/take-away",
  icon: "/icons/android/take-away-192.png",
  badge: "/icons/android/take-away-notification-badge.png",
  defaultTitle: "Nouvelle commande à emporter",
});
