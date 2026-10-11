// Present so the site can be installed. It does not store responses.
// /api/fleet in particular stays a live request: a saved position would freeze the buses.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome only offers installation when a fetch handler is registered.
// Nothing is cached: a saved position would freeze the buses.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let path = "";
  try {
    path = new URL(event.request.url).pathname;
  } catch {
    return;
  }
  if (path === "/api/fleet" || path.startsWith("/api/fleet/")) {
    event.respondWith(fetch(event.request));
  }
});
