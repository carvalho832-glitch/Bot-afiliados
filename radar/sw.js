const CACHE = 'radar-ia-pwa-v5-navigation';
const ASSETS = [
  './',
  'index.html',
  'styles.css?v=5',
  'app.js?v=5',
  'phase24b.js?v=3',
  'phase24-navigation-v5.js?v=1',
  'manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: false });
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./');
        throw new Error('Recurso indisponível no cache do Radar IA.');
      })
  );
});
