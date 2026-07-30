(function () {
  const BRIDGE_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const BOT_HOST = 'bot.achoulevoubot.uk';
  const PROXY_SEND_URL = `${BRIDGE_BASE}/bot/queue/add`;
  const nativeFetch = window.fetch.bind(window);

  function limparMensagens(messages) {
    return (Array.isArray(messages) ? messages : [])
      .map(message => String(message || '').trim())
      .filter(Boolean);
  }

  function rotaLeitura(url, method) {
    if (method !== 'GET' || url.hostname !== BOT_HOST) return null;
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/status') return `${BRIDGE_BASE}/bot/status`;
    if (path === '/queue') return `${BRIDGE_BASE}/bot/queue`;
    return null;
  }

  function headersSemAutorizacao(input, init) {
    let baseHeaders = init?.headers;
    if (!baseHeaders && typeof Request !== 'undefined' && input instanceof Request) {
      baseHeaders = input.headers;
    }

    const headers = new Headers(baseHeaders || {});
    headers.delete('Authorization');
    headers.delete('authorization');
    headers.set('Accept', 'application/json');
    return headers;
  }

  async function fetchComTimeout(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await nativeFetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store'
      });
    } finally {
      clearTimeout(timer);
    }
  }

  window.fetch = function fetchAchouLevou(input, init = {}) {
    let originalUrl;
    try {
      originalUrl = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }

    const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const bridgeRoute = rotaLeitura(originalUrl, method);

    if (!bridgeRoute) return nativeFetch(input, init);

    const bridgeUrl = new URL(bridgeRoute);
    originalUrl.searchParams.forEach((value, key) => bridgeUrl.searchParams.set(key, value));
    bridgeUrl.searchParams.set('_bridge', Date.now().toString());
    const cleanHeaders = headersSemAutorizacao(input, init);

    return (async () => {
      let bridgeResponse = null;

      try {
        bridgeResponse = await fetchComTimeout(bridgeUrl.toString(), {
          method: 'GET',
          headers: cleanHeaders,
          credentials: 'omit'
        }, 9000);

        if (bridgeResponse.ok) return bridgeResponse;
      } catch (error) {
        console.warn('Ponte de leitura indisponível, tentando VM diretamente:', error?.message || error);
      }

      try {
        const directResponse = await fetchComTimeout(originalUrl.toString(), {
          method: 'GET',
          headers: cleanHeaders,
          credentials: 'omit'
        }, 6000);

        if (directResponse.ok || !bridgeResponse) return directResponse;
      } catch (error) {
        console.warn('Leitura direta da VM também falhou:', error?.message || error);
      }

      if (bridgeResponse) return bridgeResponse;
      throw new TypeError('Não foi possível consultar status ou fila do robô.');
    })();
  };

  async function enviarPelaPonte(messages) {
    const cleanMessages = limparMensagens(messages);
    if (!cleanMessages.length) throw new Error('Nenhuma mensagem para enviar.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await nativeFetch(PROXY_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ text: cleanMessages.join('\n---\n') }),
        cache: 'no-store',
        signal: controller.signal
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.detalhe || `Falha ao enviar. HTTP ${response.status}`);
      }

      return json;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('O envio demorou mais de 25 segundos. Tente novamente.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function instalar() {
    if (!window.AchouLevouBotQueue) {
      setTimeout(instalar, 100);
      return;
    }

    window.AchouLevouBotQueue.sendMessages = enviarPelaPonte;
    window.AchouLevouBotQueue.readBridgeUrl = BRIDGE_BASE;
    console.log('Status e fila pela ponte resiliente; envio mantido pela ponte segura.');
  }

  instalar();
})();
