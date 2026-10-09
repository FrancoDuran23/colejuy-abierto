// Present so the site can be installed. It does not store responses.
// /api/fleet in particular stays a live request: a saved position would freeze the buses.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const path = new URL(event.request.url).pathname;
  if (path === "/api/fleet" || path.startsWith("/api/fleet/")) {
    event.respondWith(fetch(event.request));
  }
});
