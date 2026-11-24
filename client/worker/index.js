/* global caches, self */
const appOrigin = self.location.origin;
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "/", appOrigin).origin;

// Workbox's legacy cross-origin and static asset routes could cache Gusto API responses.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.map(async (name) => {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const { origin, pathname } = new URL(request.url);
      if ((origin === appOrigin || origin === apiOrigin) && (pathname === "/api" || pathname.startsWith("/api/"))) {
        await cache.delete(request);
      }
    }
  }))));
});
