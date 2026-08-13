const CACHE_NAME = 'letshunt-v21';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './splash-logo-1024.png?v=4',
  './icon-192-v8.png',
  './icon-512-v8.png',
  './apple-touch-icon-v8.png',
  './hunt-icon-120.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Failed to pre-cache some assets during SW install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Cross-origin requests (map tiles, Open-Meteo weather, RainViewer radar
  // frames) are NETWORK-ONLY: caching them risks serving stale weather/radar
  // responses and bloats the cache with URLs that never change names.
  if (new URL(event.request.url).origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Page navigations are NETWORK-FIRST: the app shell (index.html) must always
  // come from the server so users never get stuck on a stale cached build
  // (e.g. missing the latest feature). Only offline falls back to cache.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./') || Response.error())
        )
    );
    return;
  }

  // Everything else (hashed assets, tiles, API JSON): stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith('http')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
