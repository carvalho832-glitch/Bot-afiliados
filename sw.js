const CACHE_VERSION = 'achou-levou-v66-status-independente';
const API_ERRADA = 'https://bot-afiliados-1fvi.onrender.com';
const API_CORRETA = 'https://bot-afiliados-1fwi.onrender.com';

self.addEventListener('install', (event) => {
    console.log('Achou Levou interface v66 instalada.');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Achou Levou interface v66 ativada. Limpando caches antigos.');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    if (url.includes('multi-groups.js')) {
        event.respondWith(new Response(
            "console.log('multi-groups bloqueado pelo service worker.');",
            {
                headers: {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
                }
            }
        ));
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request)));
        return;
    }

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

    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request)));
});