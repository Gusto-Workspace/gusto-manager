/* global caches, self */

// Retire les documents RH qui pouvaient être mis en cache par les anciennes versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.allSettled(["apis", "cross-origin"].map(async (name) => {
    if (!(await caches.has(name))) return;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const { pathname } = new URL(request.url);
      if (/^\/api\/restaurants\/[^/]+\/employees\/[^/]+\/documents(?:\/|$)/.test(pathname)) {
        await cache.delete(request);
      }
    }
  })));
});
