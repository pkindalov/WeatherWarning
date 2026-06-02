/* ============================================================
   sw.js — service worker
   - Lets alerts display via registration.showNotification (more
     reliable on mobile, and they survive a tab losing focus).
   - Click handling focuses the app.
   - The push handler below is where a SERVER would deliver alerts
     when the app is fully closed (Web Push / VAPID). A static app
     can't do that on its own — it needs a backend to push.
   ============================================================ */

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

/* ---- Closed-app push would arrive here, sent from your server ----
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Storm alert", {
      body: data.body || "A dangerous cell is approaching your saved location.",
      requireInteraction: true,
      tag: "ww-push",
    })
  );
});
------------------------------------------------------------------- */
