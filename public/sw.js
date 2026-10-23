// GeoPulse : service worker minimal, requis pour l'installation de l'application.
// Les pages et les données passent toujours par le réseau (aucune donnée de société n'est mise en cache).
// Seule une page de secours s'affiche quand l'appareil n'a plus de connexion.
const CACHE = 'geopulse-v1';
const HORS_LIGNE = '/hors-ligne.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([HORS_LIGNE, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(HORS_LIGNE)));
});
