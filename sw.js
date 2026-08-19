const CACHE_VERSION = 'achou-levou-v92-local-affiliate';
const API_ERRADA = 'https://bot-afiliados-1fvi.onrender.com';
const API_CORRETA = 'https://bot-afiliados-1fwi.onrender.com';
const SHOPEE_PRODUCT_PATH = '/shopee/produto';
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const LOCAL_AFFILIATE_PROFILES = Object.freeze({
    julio: 'http://127.0.0.1:3000',
    renata: 'http://127.0.0.1:3200'
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

self.addEventListener('install', () => {
    console.log('Achou Levou interface v92 instalada.');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Achou Levou interface v92 ativada. Limpando caches antigos.');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .then(() => self.clients.claim())
            .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
            .then(clients => Promise.all(clients.map(client => {
                client.postMessage({ type: 'ACHOU_LEVOU_UPDATED', version: '92' });
                return client.navigate(client.url).catch(() => null);
            })))
    );
});

function normalizarPerfil(valor = '') {
    const perfil = String(valor || '').trim().toLowerCase();
    return ['renata', 'usuario2', 'user2', '2'].includes(perfil) ? 'renata' : 'julio';
}

async function perfilDoCliente(clientId) {
    if (!clientId) return 'julio';

    try {
        const client = await self.clients.get(clientId);
        if (!client?.url) return 'julio';

        const url = new URL(client.url);
        const solicitado = url.searchParams.get('perfil') ||
            url.searchParams.get('bot') ||
            url.searchParams.get('usuario') ||
            'julio';
        return normalizarPerfil(solicitado);
    } catch {
        return 'julio';
    }
}

async function avisarCliente(clientId, mensagem) {
    if (!clientId) return;
    try {
        const client = await self.clients.get(clientId);
        client?.postMessage?.(mensagem);
    } catch {}
}

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

async function consultarBotAfiliadoLocal(event, originalUrl) {
    const perfil = await perfilDoCliente(event.clientId);
    const baseUrl = LOCAL_AFFILIATE_PROFILES[perfil] || LOCAL_AFFILIATE_PROFILES.julio;
    const localUrl = new URL(originalUrl.pathname + originalUrl.search, baseUrl);
    localUrl.searchParams.set('_perfil_local', perfil);
    localUrl.searchParams.set('_agora', String(Date.now()));

    try {
        const response = await consultarShopee(localUrl.toString(), event.request.signal);
        await avisarCliente(event.clientId, {
            type: 'AFFILIATE_BOT_SOURCE',
            source: 'local',
            profile: perfil,
            baseUrl,
            status: response.status
        });
        console.log(`[BOT AFILIADO] ${perfil} local respondeu HTTP ${response.status} em ${baseUrl}.`);
        return response;
    } catch (error) {
        if (error?.name === 'AbortError' || event.request.signal?.aborted) throw error;

        await avisarCliente(event.clientId, {
            type: 'AFFILIATE_BOT_SOURCE',
            source: 'cloud-fallback',
            profile: perfil,
            baseUrl,
            error: String(error?.message || error)
        });
        console.warn(`[BOT AFILIADO] ${perfil} local indisponível em ${baseUrl}. Usando Render.`, error?.message || error);
        return null;
    }
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

async function consultarShopeeLocalOuNuvem(event, originalUrl) {
    const local = await consultarBotAfiliadoLocal(event, originalUrl);
    if (local) return local;
    return consultarShopeeComRecuperacao(event.request, originalUrl);
}

async function scriptComFilaCompartilhada(request) {
    const response = await fetch(request, { cache: 'no-store' });
    const source = await response.text();
    const loader = `\n;(() => {\n  if (document.getElementById('achou-levou-shared-offers-client')) return;\n  const script = document.createElement('script');\n  script.id = 'achou-levou-shared-offers-client';\n  script.src = './shared-offers-client.js?v=1';\n  script.async = false;\n  document.head.appendChild(script);\n})();\n`;
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    return new Response(source + loader, { status: response.status, statusText: response.statusText, headers });
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

    if (event.request.method === 'GET' && requestUrl.origin === self.location.origin && /\/script\.js$/.test(requestUrl.pathname)) {
        event.respondWith(scriptComFilaCompartilhada(event.request));
        return;
    }

    if (url.includes('openai-client.js')) {
        const replacementUrl = new URL('./openai-client.js', self.location.href);
        replacementUrl.searchParams.set('v', '91');
        event.respondWith(fetch(replacementUrl.toString(), { cache: 'no-store' }));
        return;
    }

    if (url.includes('bot-queue-integration.js')) {
        requestUrl.searchParams.set('v', '88');
        event.respondWith(fetch(requestUrl.toString(), { cache: 'no-store' }));
        return;
    }

    if (url.includes('bot-queue-proxy.js')) {
        requestUrl.searchParams.set('v', '88');
        event.respondWith(fetch(requestUrl.toString(), { cache: 'no-store' }));
        return;
    }

    if (url.includes('shared-offers-client.js')) {
        requestUrl.searchParams.set('v', '1');
        event.respondWith(fetch(requestUrl.toString(), { cache: 'no-store' }));
        return;
    }

    const directPath = requestUrl.pathname.replace(/\/+$/, '') || '/';
    const isShopeeProductRead = event.request.method === 'GET' &&
        requestUrl.origin === API_CORRETA &&
        directPath === SHOPEE_PRODUCT_PATH;

    if (isShopeeProductRead) {
        event.respondWith(consultarShopeeLocalOuNuvem(event, requestUrl));
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
