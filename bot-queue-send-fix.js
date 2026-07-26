(() => {
  const BOT_URL = 'https://bot.achoulevoubot.uk';

  function setStatus(message, state = 'idle') {
    const pill = document.getElementById('bot-status-pill');
    const text = document.getElementById('bot-status-text');

    if (pill) {
      pill.textContent = message;
      pill.dataset.state = state;
    }

    if (text) text.textContent = message;
  }

  function cleanMessages(messages) {
    return Array.isArray(messages)
      ? messages.map(message => String(message || '').trim()).filter(Boolean)
      : [];
  }

  async function sendMessages(messages) {
    const clean = cleanMessages(messages);
    if (!clean.length) throw new Error('Nenhuma mensagem para enviar.');

    setStatus('Enviando', 'loading');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const body = new URLSearchParams();
      body.set('text', clean.join('\n---\n'));

      const response = await fetch(`${BOT_URL}/queue/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'Accept': 'application/json'
        },
        body: body.toString(),
        cache: 'no-store',
        signal: controller.signal
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || `Falha ao adicionar ofertas. HTTP ${response.status}`);
      }

      setStatus('Fila atualizada', 'ok');
      setTimeout(() => window.AchouLevouBotQueue?.checkBotStatus?.(), 1000);
      return json;
    } catch (error) {
      setStatus('Erro no envio', 'error');
      if (error?.name === 'AbortError') {
        throw new Error('O envio demorou mais de 20 segundos. Tente novamente.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function aplicarCorrecao() {
    if (!window.AchouLevouBotQueue) {
      setTimeout(aplicarCorrecao, 100);
      return;
    }

    window.AchouLevouBotQueue.sendMessages = sendMessages;
    console.log('Envio simplificado para a fila do robô ativado.');
  }

  aplicarCorrecao();
})();
