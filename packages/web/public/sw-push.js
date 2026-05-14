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

/**
 * Handle SKIP_WAITING message from the app.
 *
 * When the user clicks "Update now" in ServiceWorkerUpdatePrompt, the app
 * sends this message to tell the waiting service worker to skip the waiting
 * state and become active immediately.
 */
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

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
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
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

/**
 * Background Sync: when connectivity is restored, notify open app windows to
 * retry any queued push subscription changes (subscribe / unsubscribe).
 *
 * The app stores pending operations in localStorage and registers a sync tag
 * via reg.sync.register('push-subscription-sync'). Once the browser wakes the
 * service worker after reconnecting, this handler broadcasts a message so the
 * app can flush the queue.
 */
self.addEventListener("sync", function (event) {
  if (event.tag === "push-subscription-sync") {
    event.waitUntil(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (windowClients) {
          windowClients.forEach(function (client) {
            client.postMessage({ type: "RETRY_PUSH_SUBSCRIPTION" });
          });
        })
    );
  }
});

/**
 * Periodic Background Sync: refresh cached arrivals for the user's favorite
 * stations roughly every 5 minutes, even when the app is not open.
 *
 * Station IDs are written to IndexedDB by the app's usePeriodicSync hook
 * (periodicSync.ts) because service workers cannot access localStorage.
 * Gracefully no-ops if no station IDs have been saved yet.
 */
self.addEventListener("periodicsync", function (event) {
  if (event.tag === "mta-arrivals-refresh") {
    event.waitUntil(refreshFavoriteArrivals());
  }
});

/** Read favorite station IDs from IndexedDB (written by the app). */
function readFavoriteStationIds() {
  return new Promise(function (resolve) {
    try {
      var openReq = indexedDB.open("mta-periodic-sync", 1);
      openReq.onerror = function () {
        resolve([]);
      };
      openReq.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains("sync-config")) {
          db.createObjectStore("sync-config", { keyPath: "id" });
        }
      };
      openReq.onsuccess = function () {
        var db = openReq.result;
        try {
          var tx = db.transaction(["sync-config"], "readonly");
          var store = tx.objectStore("sync-config");
          var getReq = store.get("favorites");
          getReq.onsuccess = function () {
            resolve(getReq.result ? getReq.result.stationIds : []);
          };
          getReq.onerror = function () {
            resolve([]);
          };
        } catch (_e) {
          resolve([]);
        }
      };
    } catch (_e) {
      resolve([]);
    }
  });
}

/** Fetch arrivals for each favorite station and update the runtime cache. */
async function refreshFavoriteArrivals() {
  var stationIds = await readFavoriteStationIds();
  if (!stationIds || stationIds.length === 0) return;

  var cache = await caches.open("arrivals-cache");
  var origin = self.location.origin;

  await Promise.allSettled(
    stationIds.map(async function (stationId) {
      var url = origin + "/api/arrivals/" + stationId;
      try {
        var response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch (_e) {
        // Network unavailable — skip, will retry on next periodicsync fire
      }
    })
  );
}
