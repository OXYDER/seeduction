// Service worker minimal : cache l'app-shell pour permettre l'installation
// (PWA) et un repli hors-ligne, sans jamais mettre en cache l'API ni les
// routes d'announce du tracker (le site doit toujours refléter l'état réel).
const CACHE_NAME = 'seeduction-shell-v3';
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
  const isApiOrTracker = url.pathname.startsWith('/api/') || url.pathname.startsWith('/tracker/') || url.pathname.startsWith('/socket.io/');
  // /assets/ : fichiers à empreinte déjà gardés par le navigateur (cache HTTP, 1 an) ; les repasser par le service worker ne ferait que les ralentir.
  if (event.request.method !== 'GET' || isApiOrTracker || url.pathname.startsWith('/assets/') || url.origin !== self.location.origin) return;

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

// ---------------------------------------------------------------------------
// Notifications push : le serveur envoie { title, body, url, tag }. Si le site est déjà ouvert et visible, la notification est déjà dans la cloche :
// on n'affiche rien (pas de doublon). Un clic ouvre la page visée (jamais une adresse extérieure) dans la fenêtre déjà ouverte, ou une nouvelle.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Seeduction', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(String(data.title || 'Seeduction').slice(0, 100), {
      body: String(data.body || '').slice(0, 200),
      icon: '/logo-icon.png', badge: '/logo-icon.png',
      tag: String(data.tag || 'seeduction'), renotify: true,
      data: { url: typeof data.url === 'string' && /^\/(?!\/)/.test(data.url) ? data.url : '/notifications' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); if ('navigate' in w) { try { await w.navigate(url); } catch { /* page déjà fermée */ } } return; }
    }
    await self.clients.openWindow(url);
  })());
});

// Le navigateur a renouvelé l'abonnement (clé expirée) : la page se réabonne à sa prochaine ouverture.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((wins) => wins.forEach((w) => w.postMessage({ type: 'push-resubscribe' }))));
});
