'use strict';

const crypto = require('crypto');
const whatsapp = require('whatsapp-web.js');

const Client = whatsapp?.Client;
const originalSendMessage = Client?.prototype?.sendMessage;

if (typeof originalSendMessage !== 'function') {
  console.error('[ENVIO-SEGURO] Não foi possível instalar a proteção de envio.');
} else if (!Client.prototype.__achouLevouSafeSendInstalled) {
  const inFlight = new Map();
  const recentSuccess = new Map();
  const SUCCESS_TTL_MS = Math.max(30000, Number(process.env.SEND_DEDUP_TTL_MS || 120000));
  let restartScheduled = false;

  function errorText(error) {
    return String(error?.stack || error?.message || error || 'Erro desconhecido');
  }

  function isBrokenContext(error) {
    const text = String(error?.message || error || '').toLowerCase();
    return [
      'detached frame',
      'execution context was destroyed',
      'target closed',
      'session closed',
      'protocol error',
      'most likely because of a navigation'
    ].some(token => text.includes(token));
  }

  function fingerprint(chatId, content) {
    const normalized = typeof content === 'string' ? content : JSON.stringify(content);
    return crypto
      .createHash('sha256')
      .update(`${String(chatId)}\n${normalized}`)
      .digest('hex');
  }

  function cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of recentSuccess) {
      if (now - timestamp > SUCCESS_TTL_MS) recentSuccess.delete(key);
    }
  }

  Client.prototype.sendMessage = function safeSendMessage(chatId, content, options) {
    cleanup();
    const key = fingerprint(chatId, content);

    if (recentSuccess.has(key)) {
      console.warn(`[ENVIO-SEGURO] Repetição bloqueada para ${chatId}. A mesma mensagem já foi enviada recentemente.`);
      return Promise.resolve({
        id: { _serialized: `deduplicated-${key.slice(0, 16)}` },
        ack: 1,
        fromMe: true,
        __achouLevouDeduplicated: true
      });
    }

    if (inFlight.has(key)) {
      console.warn(`[ENVIO-SEGURO] Clique/envio duplicado em andamento bloqueado para ${chatId}.`);
      return inFlight.get(key);
    }

    const operation = Promise.resolve()
      .then(() => originalSendMessage.call(this, chatId, content, options))
      .then(result => {
        recentSuccess.set(key, Date.now());
        return result;
      })
      .catch(error => {
        if (isBrokenContext(error) && !restartScheduled) {
          restartScheduled = true;
          console.error('[ENVIO-SEGURO] Contexto do WhatsApp corrompido. O processo será reiniciado sem repetir o envio:', errorText(error));
          setTimeout(() => process.exit(1), 150).unref();
        }
        throw error;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, operation);
    return operation;
  };

  Object.defineProperty(Client.prototype, '__achouLevouSafeSendInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  console.log(`[ENVIO-SEGURO] Proteção ativa. Janela contra duplicidade: ${Math.round(SUCCESS_TTL_MS / 1000)} s.`);
}
