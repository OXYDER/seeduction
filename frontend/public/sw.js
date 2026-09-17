// Service worker minimal : cache l'app-shell pour permettre l'installation
// (PWA) et un repli hors-ligne, sans jamais mettre en cache l'API ni les
// routes d'announce du tracker (le site doit toujours refléter l'état réel).
const CACHE_NAME = 'seeduction-shell-v1';
const SHELL_ASSETS = ['/', '/logo-icon.png', '/logo-full.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApiOrTracker = url.pathname.startsWith('/api/') || url.pathname.startsWith('/tracker/');
  if (event.request.method !== 'GET' || isApiOrTracker) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/'))),
  );
});
