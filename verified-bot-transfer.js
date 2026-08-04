(() => {
  'use strict';

  const VERSION = '1.0.0';
  const OFFERS_KEY = 'ofertas_achou_levou';
  const TRANSFERS_KEY = 'achou_levou_verified_bot_transfers';
  const CARD_SELECTOR = '#lista-salvas .saved-card';
  const BOT_BUTTON_SELECTOR = '#btn-enviar-atual-robo, #btn-enviar-todas-robo, .saved-card .btn-small.primary';

  if (window.AchouLevouVerifiedBotTransfer?.version === VERSION) return;

  const clean = value => String(value || '').replace(/\r\n/g, '\n').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readOffers() {
    const offers = readJson(OFFERS_KEY, []);
    return Array.isArray(offers) ? offers : [];
  }

  function activeProfile() {
    const config = window.AchouLevouBotQueue?.loadConfig?.() || {};
    return {
      id: clean(config.profileId || 'julio').toLowerCase() || 'julio',
      label: clean(config.profileLabel || 'Júlio') || 'Júlio'
    };
  }

  function offerMessage(offer = {}) {
    return clean(offer.texto || offer.mensagem || offer.message || offer.text || '');
  }

  function hash(value) {
    let result = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function offerKey(offer = {}) {
    const id = clean(offer.id || offer.sourceId || '');
    return id ? `id:${id}` : `msg:${hash(offerMessage(offer))}`;
  }

  function transferStore() {
    const value = readJson(TRANSFERS_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function transferRecord(offer, profileId = activeProfile().id) {
    return transferStore()[`${profileId}:${offerKey(offer)}`] || null;
  }

  function saveTransferRecords(offers, profile, verification) {
    const store = transferStore();
    const now = new Date().toISOString();

    offers.forEach(offer => {
      store[`${profile.id}:${offerKey(offer)}`] = {
        profileId: profile.id,
        profileLabel: profile.label,
        transferredAt: now,
        botQueueTotal: verification.queueTotal,
        verifiedBy: verification.verifiedBy,
        messageHash: hash(offerMessage(offer))
      };
    });

    writeJson(TRANSFERS_KEY, store);
  }

  function queueSummary(value) {
    const queue = value?.queue && typeof value.queue === 'object' ? value.queue : value;
    return {
      total: Number.isFinite(Number(queue?.total)) ? Number(queue.total) : null,
      pending: Number.isFinite(Number(queue?.pending)) ? Number(queue.pending) : null,
      sent: Number.isFinite(Number(queue?.sent)) ? Number(queue.sent) : null,
      running: queue?.running === true
    };
  }

  async function readQueue() {
    if (!window.AchouLevouBotQueue?.getOverview) return null;
    const overview = await window.AchouLevouBotQueue.getOverview({ force: true });
    if (!overview?.queueOk || !overview.queue) return null;
    return queueSummary(overview.queue);
  }

  async function verifyTransfer(sendResult, before, expected) {
    const added = Number(sendResult?.added);
    const responseQueue = queueSummary(sendResult?.queue);

    if (sendResult?.ok !== true) {
      throw new Error(sendResult?.error || 'O robô não confirmou o recebimento das ofertas.');
    }
    if (!Number.isFinite(added) || added !== expected) {
      throw new Error(`O robô confirmou ${Number.isFinite(added) ? added : 0} de ${expected} oferta(s).`);
    }

    const expectedTotal = responseQueue.total ?? (
      before?.total !== null && before?.total !== undefined
        ? before.total + expected
        : null
    );

    if (before?.total !== null && responseQueue.total !== null && responseQueue.total < before.total + expected) {
      throw new Error('A resposta chegou, mas a quantidade da fila não aumentou como esperado.');
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const after = await readQueue();
        if (after && expectedTotal !== null && after.total !== null && after.total >= expectedTotal) {
          return {
            added,
            queueTotal: after.total,
            queuePending: after.pending,
            queueRunning: after.running,
            verifiedBy: 'releitura-da-fila'
          };
        }
      } catch {}
      await sleep(900);
    }

    if (responseQueue.total !== null) {
      return {
        added,
        queueTotal: responseQueue.total,
        queuePending: responseQueue.pending,
        queueRunning: responseQueue.running,
        verifiedBy: 'resposta-persistida-do-robo'
      };
    }

    throw new Error('As ofertas foram enviadas, mas a fila não pôde ser relida para confirmação.');
  }

  function originalButtonText(button) {
    if (!button) return '';
    if (!button.dataset.verifiedOriginalText) {
      button.dataset.verifiedOriginalText = button.innerText || button.textContent || 'Enviar ao robô';
    }
    return button.dataset.verifiedOriginalText;
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    const original = originalButtonText(button);
    button.disabled = busy;
    button.innerText = busy ? label : original;
  }

  async function transferOffers(offers, button) {
    const messages = offers.map(offerMessage).filter(Boolean);
    if (!messages.length) throw new Error('Nenhuma mensagem válida foi encontrada.');
    if (!window.AchouLevouBotQueue?.sendMessages) {
      throw new Error('A integração com o robô ainda não terminou de carregar.');
    }

    const profile = activeProfile();
    const before = await readQueue().catch(() => null);
    setButtonBusy(button, true, '☁️ Enviando e conferindo...');

    try {
      const result = await window.AchouLevouBotQueue.sendMessages(messages);
      const verification = await verifyTransfer(result, before, messages.length);
      saveTransferRecords(offers, profile, verification);
      decorateCards();

      const runningNote = verification.queueRunning
        ? '\n\n⚠️ A fila já estava iniciada.'
        : '\n\nA fila continua parada. Nenhuma mensagem foi disparada agora.';

      alert(
        `✅ ${verification.added} oferta(s) confirmada(s) na fila de ${profile.label}.` +
        `\nTotal atual da fila: ${verification.queueTotal ?? 'confirmado'}.` +
        runningNote
      );
      return verification;
    } finally {
      setButtonBusy(button, false, '');
      decorateCards();
    }
  }

  function currentOffer() {
    const message = clean(
      document.getElementById('msg-preview')?.innerText ||
      window.__ultimaMensagemAchouLevou || ''
    );
    return { id: '', texto: message };
  }

  function cardOffer(button) {
    const card = button.closest('.saved-card');
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];
    const index = cards.indexOf(card);
    return index >= 0 ? readOffers()[index] || null : null;
  }

  function decorateCards() {
    const offers = readOffers();
    const profile = activeProfile();
    const cards = [...document.querySelectorAll(CARD_SELECTOR)];

    cards.forEach((card, index) => {
      const offer = offers[index];
      const button = card.querySelector('.btn-small.primary');
      const top = card.querySelector('.saved-card-top');
      if (!offer || !button || !top) return;

      const record = transferRecord(offer, profile.id);
      let badge = card.querySelector('.verified-bot-badge');

      if (record) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'verified-bot-badge';
          badge.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;background:rgba(54,232,155,.12);border:1px solid rgba(54,232,155,.36);color:#36e89b;font-size:11px;font-weight:800;';
          top.appendChild(badge);
        }
        badge.textContent = `✅ Fila ${profile.label}`;
        button.dataset.verifiedOriginalText = button.dataset.verifiedOriginalText || button.innerText;
        button.innerText = '✅ Já está na fila';
        button.disabled = true;
        button.dataset.verifiedTransferred = '1';
      } else {
        badge?.remove();
        if (button.dataset.verifiedTransferred === '1') {
          button.disabled = false;
          button.innerText = button.dataset.verifiedOriginalText || 'Enviar ao robô';
          delete button.dataset.verifiedTransferred;
        }
      }
    });
  }

  async function handleClick(event) {
    const button = event.target.closest?.(BOT_BUTTON_SELECTOR);
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      const profile = activeProfile();
      let offers = [];

      if (button.id === 'btn-enviar-atual-robo') {
        const offer = currentOffer();
        if (!offerMessage(offer)) throw new Error('Gere uma mensagem primeiro.');
        offers = [offer];
      } else if (button.id === 'btn-enviar-todas-robo') {
        const all = readOffers();
        offers = all.filter(offer => !transferRecord(offer, profile.id));
        if (!offers.length) {
          alert(`Todas as ofertas já foram confirmadas na fila de ${profile.label}.`);
          return;
        }
        if (!confirm(`Enviar e confirmar ${offers.length} oferta(s) na fila de ${profile.label}?\n\nA fila não será iniciada.`)) return;
      } else {
        const offer = cardOffer(button);
        if (!offer) throw new Error('Não consegui identificar esta oferta.');
        if (transferRecord(offer, profile.id)) {
          alert(`Esta oferta já foi confirmada na fila de ${profile.label}.`);
          return;
        }
        offers = [offer];
      }

      await transferOffers(offers, button);
    } catch (error) {
      alert(`❌ Não foi possível confirmar a transferência.\n\n${error.message || error}`);
      setButtonBusy(button, false, '');
    }
  }

  document.addEventListener('click', handleClick, true);
  window.addEventListener('achoulevou:ofertas-atualizadas', () => setTimeout(decorateCards, 50));
  window.addEventListener('achoulevou:bot-profile', () => setTimeout(decorateCards, 50));
  window.addEventListener('focus', () => setTimeout(decorateCards, 50));

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(decorateCards, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.AchouLevouVerifiedBotTransfer = {
    version: VERSION,
    transferOffers,
    readOffers,
    activeProfile,
    decorateCards,
    clearLocalHistory() {
      localStorage.removeItem(TRANSFERS_KEY);
      decorateCards();
    }
  };

  decorateCards();
  console.log(`Transferência verificada para a fila do robô ativada. v${VERSION}`);
})();
