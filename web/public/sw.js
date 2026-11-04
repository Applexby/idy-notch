/* IDY · service worker: notificaciones push + caché básica del shell */
const CACHE = "idy-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero para navegación; caché como respaldo sin conexión
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/guia")) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (req.mode === "navigate" || req.url.includes("/assets/"))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "/" : req, copy));
      }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "/" : req))
  );
});

self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { title: "IDY", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(p.title || "IDY", {
    body: p.body || "",
    tag: p.tag,
    renotify: true,
    requireInteraction: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: p.url || "/", ...(p.data || {}) },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
