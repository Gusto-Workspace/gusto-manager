self.addEventListener("push", (event) => {
  function syncAppBadge(countValue) {
    const count = Number(countValue);
    if (!Number.isFinite(count) || count < 0) return Promise.resolve();

    const setBadge =
      typeof self.navigator?.setAppBadge === "function"
        ? self.navigator.setAppBadge.bind(self.navigator)
        : typeof self.registration?.setAppBadge === "function"
          ? self.registration.setAppBadge.bind(self.registration)
          : null;

    const clearBadge =
      typeof self.navigator?.clearAppBadge === "function"
        ? self.navigator.clearAppBadge.bind(self.navigator)
        : typeof self.registration?.clearAppBadge === "function"
          ? self.registration.clearAppBadge.bind(self.registration)
          : null;

    if (count > 0 && setBadge) {
      return Promise.resolve(setBadge(count)).catch(() => {});
    }

    if (count === 0 && clearBadge) {
      return Promise.resolve(clearBadge()).catch(() => {});
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
    Promise.all([
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
