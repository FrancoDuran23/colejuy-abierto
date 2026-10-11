const CACHE_VERSION = 'colejuy-v3';
const DATA_CACHE = `${CACHE_VERSION}-data`;
const APP_CACHE = `${CACHE_VERSION}-app`;
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/maplibre-gl-worker.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Next.js may reuse development chunk URLs after a code change. Network-first
  // prevents an older client bundle from hydrating newer server-rendered HTML.
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Live fleet positions are NEVER cached: a saved position would freeze the buses on the map.
  if (url.pathname === '/api/fleet' || url.pathname.startsWith('/api/fleet/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static API endpoints: network-first with data cache fallback.
  if (url.pathname.startsWith('/api/lines') || url.pathname.startsWith('/api/stops') || url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return Response.json({ unavailable: 'offline', buses: [] }, { status: 503 });
        }),
    );
    return;
  }

  // Navigation requests: network-first with cached root fallback, then offline HTML.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_CACHE).then((cache) => cache.put('/', clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/');
          if (cached) return cached;
          return new Response(
            '<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#f3f0e8"><title>ColeJUY sin conexión</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f3f0e8;color:#1c1b18;font-family:system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box;text-align:center}.card{max-width:400px;background:#ffffff;padding:32px 24px;border-radius:24px;box-shadow:0 4px 16px rgba(28,27,24,0.08)}h1{font-size:22px;margin:0 0 12px;font-weight:700}p{font-size:15px;color:#5c584e;line-height:1.5;margin:0}</style></head><body><main class="card"><h1>Estás sin conexión</h1><p>Abrí ColeJUY con conexión a internet para cargar los recorridos y ver los colectivos en vivo.</p></main></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }),
    );
    return;
  }

  // Stable public assets: cache-first with network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (
          response.ok &&
          (request.destination === 'script' ||
            request.destination === 'style' ||
            request.destination === 'image' ||
            request.destination === 'font' ||
            url.pathname.endsWith('.mjs'))
        ) {
          const clone = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      return existing ? existing.focus() : self.clients.openWindow(event.notification.data?.url || '/');
    }),
  );
});
