const CACHE_VERSION = 'achou-levou-v2';

self.addEventListener('install', (event) => {
    console.log('Robô Achou Levou v2 instalado com sucesso!');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Robô Achou Levou v2 ativado!');
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys
                .filter(key => key !== CACHE_VERSION)
                .map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', () => {
    return;
});
