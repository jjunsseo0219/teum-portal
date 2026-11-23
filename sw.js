const CACHE_NAME = 'teum-shell-v9';
const SHELL_ASSETS = [
  './',
  './index.html',
  './pledge.html',
  './style.css',
  './widgets.js',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache /api/ calls or config/data files offline-first
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.endsWith('/data.js') ||
    url.pathname.endsWith('/data.json') ||
    url.pathname.endsWith('/config.json') ||
    url.pathname.endsWith('/sources.json')
  ) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for shell assets so updates apply immediately while keeping offline support
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
