(function () {
  const PROXY_URL = 'https://bot-afiliados-1fwi.onrender.com/bot/queue/add';

  function limparMensagens(messages) {
    return (Array.isArray(messages) ? messages : [])
      .map(message => String(message || '').trim())
      .filter(Boolean);
  }

  async function enviarPelaPonte(messages) {
    const cleanMessages = limparMensagens(messages);
    if (!cleanMessages.length) throw new Error('Nenhuma mensagem para enviar.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(PROXY_URL, {
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
    console.log('Envio da fila configurado pela ponte segura do Render.');
  }

  instalar();
})();
