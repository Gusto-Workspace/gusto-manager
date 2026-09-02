self.addEventListener("pushsubscriptionchange", (event) => {
  async function hashEndpoint(endpoint) {
    if (!endpoint || !self.crypto?.subtle) return null;
    try {
      const bytes = new TextEncoder().encode(String(endpoint));
      const digest = await self.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 12);
    } catch {
      return null;
    }
  }

  event.waitUntil(
    Promise.all([
      hashEndpoint(event.oldSubscription?.endpoint),
      hashEndpoint(event.newSubscription?.endpoint),
    ]).then(([oldEndpointHash, newEndpointHash]) => {
      console.info(
        "[webpush-worker-subscription-change]",
        JSON.stringify({
          changedAt: new Date().toISOString(),
          module: "reservations",
          worker: self.location.href,
          registrationScope: self.registration.scope,
          oldEndpointHash,
          newEndpointHash,
        }),
      );
    }),
  );
});

self.addEventListener("notificationclose", (event) => {
  console.info(
    "[webpush-worker-notification-close]",
    JSON.stringify({
      closedAt: new Date().toISOString(),
      module: "reservations",
      worker: self.location.href,
      notificationId:
        event.notification?.data?.data?.notificationId || null,
      tag: event.notification?.tag || null,
    }),
  );
});

self.addEventListener("install", (event) => {
  console.info(
    "[webpush-worker-lifecycle]",
    JSON.stringify({
      occurredAt: new Date().toISOString(),
      event: "install",
      module: "reservations",
      worker: self.location.href,
      registrationScope: self.registration.scope,
    }),
  );
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      console.info(
        "[webpush-worker-lifecycle]",
        JSON.stringify({
          occurredAt: new Date().toISOString(),
          event: "activate",
          module: "reservations",
          worker: self.location.href,
          registrationScope: self.registration.scope,
        }),
      );
    }),
  );
});

self.addEventListener("push", (event) => {
  async function getNotificationSnapshot() {
    try {
      const notifications = await self.registration.getNotifications();
      return {
        count: notifications.length,
        tags: notifications.map((notification) => notification?.tag || null),
      };
    } catch (error) {
      return {
        count: null,
        tags: [],
        errorName: error?.name || "Error",
        errorMessage: error?.message || "Notification inventory failed",
      };
    }
  }

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
    icon: "/icons/android/reservations-192.png",
    badge: "/img/logo-blanc.png",
    data: {
      link: payload.link || "/dashboard/webapp/reservations",
      ...payload,
    },
  };

  const badgeCount =
    payload?.data?.badgeCount ?? payload?.badgeCount ?? payload?.badge ?? null;
  const notificationId = payload?.data?.notificationId || null;
  const tag = options.tag || null;

  console.info(
    "[webpush-worker-push] PUSH EVENT RECEIVED",
    JSON.stringify({
      receivedAt: new Date().toISOString(),
      module: "reservations",
      worker: self.location.href,
      registrationScope: self.registration.scope,
      notificationId,
      tag,
    }),
  );

  event.waitUntil(
    (async () => {
      const before = await getNotificationSnapshot();
      console.info(
        "[webpush-worker-notification]",
        JSON.stringify({
          observedAt: new Date().toISOString(),
          phase: "before_show",
          module: "reservations",
          worker: self.location.href,
          notificationId,
          tag,
          existingNotificationCount: before.count,
          existingNotificationTags: before.tags,
          inventoryErrorName: before.errorName || null,
          inventoryErrorMessage: before.errorMessage || null,
        }),
      );

      const [badgeResult, showResult] = await Promise.allSettled([
        syncAppBadge(badgeCount),
        self.registration.showNotification(title, options),
      ]);
      const after = await getNotificationSnapshot();

      console.info(
        "[webpush-worker-notification]",
        JSON.stringify({
          observedAt: new Date().toISOString(),
          phase: "after_show",
          module: "reservations",
          worker: self.location.href,
          notificationId,
          tag,
          showResult: showResult.status,
          showErrorName:
            showResult.status === "rejected"
              ? showResult.reason?.name || "Error"
              : null,
          showErrorMessage:
            showResult.status === "rejected"
              ? showResult.reason?.message || "Notification display failed"
              : null,
          badgeResult: badgeResult.status,
          existingNotificationCount: after.count,
          existingNotificationTags: after.tags,
          inventoryErrorName: after.errorName || null,
          inventoryErrorMessage: after.errorMessage || null,
        }),
      );
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  console.info(
    "[webpush-worker-notification-click]",
    JSON.stringify({
      clickedAt: new Date().toISOString(),
      module: "reservations",
      worker: self.location.href,
      notificationId:
        event.notification?.data?.data?.notificationId || null,
      tag: event.notification?.tag || null,
    }),
  );
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
