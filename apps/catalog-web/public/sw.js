const CACHE_NAME = 'underground-heat-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add('/')));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(cacheNames
        .filter((cacheName) => cacheName.startsWith('underground-heat-shell-') && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Never proxy API or asset requests through the offline cache. In particular,
  // session restoration depends on /auth/me receiving the real network response
  // immediately after a page refresh.
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/')));
});
