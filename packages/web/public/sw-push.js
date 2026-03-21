/**
 * Service Worker push event handler.
 *
 * This file is imported into the Workbox-generated service worker via
 * vite.config.ts workbox.importScripts. It adds the 'push' and
 * 'notificationclick' event listeners that Workbox's generateSW does not
 * produce itself.
 *
 * Expected push payload (JSON):
 *   { title, body, tag?, url?, severity?, lines? }
 */

/* global self, clients */

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const title = data.title || "MTA My Way";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    tag: data.tag || "mta-alert",
    data: { url: data.url || "/alerts" },
    // Keep notification visible until user interacts with it for severe alerts
    requireInteraction: data.severity === "severe",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var url = (event.notification.data && event.notification.data.url) || "/alerts";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        // Focus an existing tab showing the app if one is open
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if ("focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
