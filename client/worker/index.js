/* global caches, self */

// Efface les anciennes réponses privées avant d’utiliser les routes NetworkOnly.
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.allSettled(["apis", "cross-origin"].map(async (name) => {
    if (!(await caches.has(name))) return;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const { pathname } = new URL(request.url);
      if (/^\/api\/(?:(?:employees|accountants)\/me(?:\/|$)|restaurants\/[^/]+\/(?:employees|callsense|time-clock)(?:\/|$)|time-clock(?:\/|$)|(?:owner\/restaurants|events)\/[^/]+\/?$)/.test(pathname)) {
        await cache.delete(request);
      }
    }
  })));
});
