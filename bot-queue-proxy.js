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

  function ehLeituraDiretaDoBot(url, method) {
    if (method !== 'GET' || url.hostname !== BOT_HOST) return false;
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return path === '/status' || path === '/queue';
  }

  function headersLeituraDireta(input, init) {
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

  window.fetch = function fetchAchouLevou(input, init = {}) {
    let url;
    try {
      url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }

    const method = String(init.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();

    if (!ehLeituraDiretaDoBot(url, method)) {
      return nativeFetch(input, init);
    }

    // /status e /queue não exigem autenticação no servidor. Remover Authorization
    // evita o preflight CORS que impedia a leitura direta no aplicativo instalado.
    return nativeFetch(url.toString(), {
      ...init,
      method: 'GET',
      headers: headersLeituraDireta(input, init),
      credentials: 'omit',
      cache: 'no-store'
    });
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

    // Somente o envio passa pelo Render. Status e fila permanecem na VM do WhatsApp.
    window.AchouLevouBotQueue.sendMessages = enviarPelaPonte;
    window.AchouLevouBotQueue.readBridgeUrl = '';
    console.log('Status e fila lidos diretamente da VM sem preflight; envio mantido pela ponte segura.');
  }

  instalar();
})();