self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  function syncAppBadge(countValue) {
    const count = Number(countValue);
    if (!Number.isFinite(count) || count < 0) return Promise.resolve();

    if (count > 0 && typeof self.navigator?.setAppBadge === "function") {
      return Promise.resolve(self.navigator.setAppBadge(count)).catch(() => {});
    }
    if (count === 0 && typeof self.navigator?.clearAppBadge === "function") {
      return Promise.resolve(self.navigator.clearAppBadge()).catch(() => {});
    }
    return Promise.resolve();
  }

  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {}

  const options = {
    body: payload.message || "",
    icon: "/icons/android/gusto-192.png",
    badge: "/img/logo-blanc.png",
    data: {
      link: payload.link || "/dashboard/webapp/take-away",
      ...payload,
    },
  };
  const badgeCount =
    payload?.data?.badgeCount ?? payload?.badgeCount ?? payload?.badge ?? null;

  event.waitUntil(
    Promise.allSettled([
      syncAppBadge(badgeCount),
      self.registration.showNotification(
        payload.title || "Nouvelle commande à emporter",
        options,
      ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawLink =
    event.notification?.data?.link || "/dashboard/webapp/take-away";
  const targetUrl = new URL(rawLink, self.location.origin).href;
  const message = {
    type: "notification:navigate",
    targetUrl,
    module: "take_away",
    notificationId: event.notification?.data?.data?.notificationId || null,
  };

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const targetClient =
          clientList.find((client) => {
            try {
              return new URL(client.url).pathname.startsWith(
                "/dashboard/webapp/take-away",
              );
            } catch (_error) {
              return false;
            }
          }) || clientList[0];

        if (targetClient) {
          try {
            targetClient.postMessage(message);
          } catch (_error) {}
          if ("navigate" in targetClient) {
            return targetClient
              .navigate(targetUrl)
              .catch(() => targetClient)
              .then((client) => client?.focus?.());
          }
          return targetClient.focus?.();
        }
        return clients.openWindow(targetUrl);
      }),
  );
});
