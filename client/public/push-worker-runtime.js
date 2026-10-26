/* Shared by the three push registrations; deliberately not imported by sw.js. */
self.installGustoPushWorker = function ({
  module,
  basePath,
  icon,
  badge,
  defaultTitle,
}) {
  const inModule = (url) =>
    url.origin === self.location.origin &&
    (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`));

  function targetFor(payload) {
    let url;
    try {
      url = new URL(payload.link || basePath, self.location.origin);
    } catch {}
    // Invalid links fall back to their own module, never another app/origin.
    if (!url || !inModule(url)) url = new URL(basePath, self.location.origin);
    const restaurantId = String(
      payload.restaurantId || payload.data?.restaurantId || "",
    );
    if (restaurantId) url.searchParams.set("restaurantId", restaurantId);
    else url.searchParams.delete("restaurantId");
    if (payload.data?.notificationId)
      url.searchParams.set("notificationId", payload.data.notificationId);
    url.searchParams.set("pushModule", module);
    return url;
  }

  function ask(client, message) {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const finish = (value) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(value);
      };
      const timer = setTimeout(
        () => finish(null),
        message.type === "notification:navigate" ? 10000 : 1200,
      );
      channel.port1.onmessage = (event) => finish(event.data);
      try {
        client.postMessage(message, [channel.port2]);
      } catch {
        finish(null);
      }
    });
  }

  self.addEventListener("install", (event) =>
    event.waitUntil(self.skipWaiting()),
  );
  self.addEventListener("activate", (event) =>
    event.waitUntil(self.clients.claim()),
  );
  self.addEventListener("push", (event) => {
    let payload;
    try {
      payload = event.data?.json() || {};
    } catch {
      payload = {};
    }
    // Missing module remains compatible with historical payloads.
    if (payload.module != null && payload.module !== module) return;
    const target = targetFor(payload);
    const countValue =
      payload.data?.badgeCount ?? payload.badgeCount ?? payload.badge;
    const count = countValue == null ? NaN : Number(countValue);
    const badgeWork = Promise.resolve()
      .then(() => {
        if (!Number.isFinite(count) || count < 0) return;
        if (count > 0) return self.navigator?.setAppBadge?.(count);
        return self.navigator?.clearAppBadge?.();
      })
      .catch(() => {});
    event.waitUntil(
      Promise.allSettled([
        badgeWork,
        self.registration.showNotification(payload.title || defaultTitle, {
          body: payload.message || "",
          icon,
          badge,
          data: {
            ...payload,
            module,
            link: target.href,
            restaurantId: target.searchParams.get("restaurantId") || null,
          },
        }),
      ]),
    );
  });

  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const payload = event.notification.data || {};
    if (payload.module != null && payload.module !== module) return;
    const target = targetFor(payload);
    const restaurantId = target.searchParams.get("restaurantId");
    const message = {
      type: "notification:navigate",
      module,
      targetUrl: target.href,
      restaurantId,
      userId: payload.userId || null,
    };
    event.waitUntil(
      (async () => {
        let windows = [];
        try {
          windows = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
        } catch {}
        // Path is only a prefilter. Ask the page for its stable window identity
        // and live restaurant through a private channel before reusing it.
        const candidates = windows.filter((client) => {
          try {
            return inModule(new URL(client.url));
          } catch {
            return false;
          }
        });
        if (restaurantId) {
          const contexts = await Promise.all(
            candidates.map(async (client) => ({
              client,
              context: await ask(client, {
                type: "notification:context",
                module,
              }),
            })),
          );
          for (const { client, context } of contexts) {
            if (
              context?.module !== module ||
              context.restaurantId !== restaurantId ||
              (payload.userId && context.userId !== payload.userId)
            )
              continue;
            // No direct navigate() can bypass the page's final context check.
            const result = await ask(client, message);
            if (!result?.navigated) continue;
            try {
              await client.focus?.();
            } catch {}
            return;
          }
        }
        // Old pages without handshake are not reused. null/rejection never leads
        // to falling back to another window. OS attribution remains browser-owned.
        try {
          await self.clients.openWindow(target.href);
        } catch (error) {
          console.warn("Unable to open notification target", error?.name);
        }
      })(),
    );
  });
};
