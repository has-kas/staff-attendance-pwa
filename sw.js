const CACHE = 'staff-attendance-pwa-v2-9-1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // Always fetch config.js fresh so changes to the Apps Script URL
  // cannot be trapped by an old service-worker cache.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .catch(() => new Response(
          "const GAS_WEB_APP_URL = '';",
          { headers: { 'Content-Type': 'application/javascript' } }
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return resp;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
