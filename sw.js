const CACHE_VERSION = 'achou-levou-v78-leitura-direta-sem-preflight';
const API_ERRADA = 'https://bot-afiliados-1fvi.onrender.com';
const API_CORRETA = 'https://bot-afiliados-1fwi.onrender.com';
const SHOPEE_PRODUCT_PATH = '/shopee/produto';
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

self.addEventListener('install', () => {
    console.log('Achou Levou interface v78 instalada.');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Achou Levou interface v78 ativada. Limpando caches antigos.');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
            .then(clients => Promise.all(clients.map(client => {
                client.postMessage({ type: 'ACHOU_LEVOU_UPDATED', version: '78' });
                return client.navigate(client.url).catch(() => null);
            })))
    );
});

async function consultarShopee(url, originalSignal) {
    if (originalSignal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');

    return fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: originalSignal
    });
}

async function avisarTentativa(tentativa, total) {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({
        type: 'SHOPEE_RETRY',
        tentativa,
        total
    }));
}

function respostaDeOscilacao(ultimoErro) {
    const mensagemAmigavel = 'A conexão com a busca da Shopee falhou novamente. O link continua no campo. Aguarde alguns segundos e toque em Puxar produto novamente.';

    return new Response(JSON.stringify({
        ok: false,
        error: mensagemAmigavel,
        detalhe: mensagemAmigavel,
        causaTecnica: String(ultimoErro?.message || 'Falha temporária de conexão com a ponte da Shopee.')
    }), {
        status: 503,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
    });
}

async function consultarShopeeComRecuperacao(request, originalUrl) {
    const delays = [0, 3000];
    const MAX_ELAPSED_FOR_RETRY_MS = 20000;
    let ultimoErro = null;

    for (let index = 0; index < delays.length; index += 1) {
        const tentativa = index + 1;

        if (delays[index] > 0) {
            await avisarTentativa(tentativa, delays.length).catch(() => {});
            await sleep(delays[index]);
        }

        if (request.signal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');

        const tentativaUrl = new URL(originalUrl.toString());
        tentativaUrl.searchParams.set('_tentativa', String(tentativa));
        tentativaUrl.searchParams.set('_agora', String(Date.now()));
        const startedAt = Date.now();

        try {
            const response = await consultarShopee(tentativaUrl.toString(), request.signal);
            const elapsedMs = Date.now() - startedAt;

            if (!RETRYABLE_STATUS.has(response.status)) return response;

            if (tentativa === delays.length || elapsedMs > MAX_ELAPSED_FOR_RETRY_MS) {
                return response;
            }

            ultimoErro = new Error(`A ponte respondeu com HTTP ${response.status}.`);
            await response.body?.cancel?.().catch(() => {});
        } catch (error) {
            if (error?.name === 'AbortError' || request.signal?.aborted) throw error;

            const elapsedMs = Date.now() - startedAt;
            ultimoErro = error;
            console.warn(`[SHOPEE] Tentativa ${tentativa}/${delays.length} falhou após ${elapsedMs}ms:`, error?.message || error);

            if (tentativa === delays.length || elapsedMs > MAX_ELAPSED_FOR_RETRY_MS) {
                return respostaDeOscilacao(ultimoErro);
            }
        }
    }

    return respostaDeOscilacao(ultimoErro);
}

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
        requestUrl.searchParams.set('v', '78');
        event.respondWith(fetch(requestUrl.toString(), { cache: 'no-store' }));
        return;
    }

    const directPath = requestUrl.pathname.replace(/\/+$/, '') || '/';
    const isShopeeProductRead = event.request.method === 'GET' &&
        requestUrl.origin === API_CORRETA &&
        directPath === SHOPEE_PRODUCT_PATH;

    if (isShopeeProductRead) {
        event.respondWith(consultarShopeeComRecuperacao(event.request, requestUrl));
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

    // Status e fila do WhatsApp passam direto para bot.achoulevoubot.uk.
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request)));
});