importScripts("/push-worker-runtime.js?v=2026-10-26-isolation-1");
self.installGustoPushWorker({
  module: "reservations",
  basePath: "/dashboard/webapp/reservations",
  icon: "/icons/android/reservations-192.png",
  badge: "/icons/android/reservations-notification-badge.png",
  defaultTitle: "Nouvelle notification",
});
