// Natrix service worker — only job: show swim reminder notifications.
// (No caching, so it can never serve a stale copy of the app.)

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Natrix", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Natrix";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/meets" },
  };

  // iPhone requires every push to show a notification, so we always do.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/meets";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ("focus" in w) {
          w.focus();
          if ("navigate" in w) w.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
