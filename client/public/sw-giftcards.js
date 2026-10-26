importScripts("/push-worker-runtime.js?v=2026-10-26-isolation-1");
self.installGustoPushWorker({
  module: "gift_cards",
  basePath: "/dashboard/webapp/gift-cards",
  icon: "/icons/android/gift-cards-192.png",
  badge: "/icons/android/gift-cards-notification-badge.png",
  defaultTitle: "Nouvelle notification",
});
