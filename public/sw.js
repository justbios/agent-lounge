self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "Relay", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Relay", {
      body: d.body || "",
      tag: d.tag || "relay",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/badge.png",
      data: { url: d.url || "/", session: d.session },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { url = "/", session } = e.notification.data || {};
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin !== self.location.origin) continue;
        if (session) c.postMessage({ relay: "open-chat", session });
        return c.focus();
      }
      return self.clients.openWindow(session ? `${url}?chat=${encodeURIComponent(session)}` : url);
    }),
  );
});
