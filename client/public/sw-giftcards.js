self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {}

  const title = payload.title || "Nouvelle notification";
  const options = {
    body: payload.message || "",
    data: { link: payload.link || "/dashboard/webapp/gift-cards", ...payload },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawLink =
    event.notification?.data?.link || "/dashboard/webapp/gift-cards";
  const targetUrl = new URL(rawLink, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("navigate" in client) {
            return client
              .navigate(targetUrl)
              .then((navigatedClient) => navigatedClient?.focus?.());
          }
          if ("focus" in client) return client.focus();
        }
        return clients.openWindow(targetUrl);
      }),
  );
});
