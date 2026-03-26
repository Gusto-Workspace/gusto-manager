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
  } catch (e) {}

  const title = payload.title || "Nouvelle notification";
  const options = {
    body: payload.message || "",
    data: {
      link: payload.link || "/dashboard/webapp/reservations",
      ...payload,
    },
  };

  const badgeCount =
    payload?.data?.badgeCount ?? payload?.badgeCount ?? payload?.badge ?? null;

  event.waitUntil(
    Promise.allSettled([
      syncAppBadge(badgeCount),
      self.registration.showNotification(title, options),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawLink =
    event.notification?.data?.link || "/dashboard/webapp/reservations";
  const targetUrl = new URL(rawLink, self.location.origin).href;
  const message = {
    type: "notification:navigate",
    targetUrl,
    module: event.notification?.data?.module || "reservations",
    notificationId: event.notification?.data?.data?.notificationId || null,
  };

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const sameOriginClients = clientList.filter((client) => {
          try {
            return new URL(client.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });

        const targetClient =
          sameOriginClients.find((client) => {
            try {
              return new URL(client.url).pathname.startsWith(
                "/dashboard/webapp/reservations",
              );
            } catch {
              return false;
            }
          }) || sameOriginClients[0];

        if (targetClient) {
          try {
            targetClient.postMessage(message);
          } catch {}

          if ("navigate" in targetClient) {
            return targetClient
              .navigate(targetUrl)
              .catch(() => targetClient)
              .then((navigatedClient) => {
                try {
                  navigatedClient?.postMessage?.(message);
                } catch {}

                return navigatedClient?.focus?.();
              });
          }

          if ("focus" in targetClient) return targetClient.focus();
        }

        return clients.openWindow(targetUrl);
      }),
  );
});
