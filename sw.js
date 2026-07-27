const CACHE_VERSION = 'achou-levou-v70-ponte-leitura-bot';
const API_ERRADA = 'https://bot-afiliados-1fvi.onrender.com';
const API_CORRETA = 'https://bot-afiliados-1fwi.onrender.com';
const BOT_DIRETO = 'https://bot.achoulevoubot.uk';

self.addEventListener('install', () => {
    console.log('Achou Levou interface v70 instalada.');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Achou Levou interface v70 ativada. Limpando caches antigos.');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
            .then(clients => Promise.all(clients.map(client => {
                client.postMessage({ type: 'ACHOU_LEVOU_UPDATED', version: '70' });
                return client.navigate(client.url).catch(() => null);
            })))
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    const url = requestUrl.toString();

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

    if (url.includes('bot-queue-proxy.js')) {
        requestUrl.searchParams.set('v', '70');
        event.respondWith(fetch(requestUrl.toString(), { cache: 'no-store' }));
        return;
    }

    const directPath = requestUrl.pathname.replace(/\/+$/, '') || '/';
    const isBotRead = event.request.method === 'GET' &&
        requestUrl.origin === BOT_DIRETO &&
        (directPath === '/status' || directPath === '/queue');

    if (isBotRead) {
        const pontePath = directPath === '/status' ? '/bot/status' : '/bot/queue';
        const ponteUrl = new URL(`${API_CORRETA}${pontePath}`);
        requestUrl.searchParams.forEach((value, key) => ponteUrl.searchParams.set(key, value));
        ponteUrl.searchParams.set('_sw', Date.now().toString());

        event.respondWith(fetch(ponteUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store'
        }));
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
