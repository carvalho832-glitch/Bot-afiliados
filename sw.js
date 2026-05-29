const CACHE_VERSION = 'achou-levou-v4';
const API_ERRADA = 'https://bot-afiliados-1fvi.onrender.com';
const API_CORRETA = 'https://bot-afiliados-1fwi.onrender.com';

self.addEventListener('install', (event) => {
    console.log('Robô Achou Levou v4 instalado com correção da API Gemini!');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Robô Achou Levou v4 ativado!');
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys
                .filter(key => key !== CACHE_VERSION)
                .map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    if (url.startsWith(API_ERRADA)) {
        const novaUrl = url.replace(API_ERRADA, API_CORRETA);
        event.respondWith(fetch(novaUrl, {
            method: event.request.method,
            headers: event.request.headers,
            body: event.request.method === 'GET' || event.request.method === 'HEAD' ? undefined : event.request.clone().body,
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store'
        }));
        return;
    }

    return;
});
