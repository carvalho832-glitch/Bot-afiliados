(() => {
  'use strict';

  const VERSION = '1.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const BATCHES_ENDPOINT = `${API_BASE}/phase24/batches`;
  const SHARED_ENDPOINT = `${API_BASE}/shared/offers`;
  const BUTTON_ID = 'radar-phase24b3-message-button';
  const TOAST_ID = 'radar-phase24b3-toast';
  const REQUEST_TIMEOUT_MS = 105000;
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B3Version === VERSION) return;
  root.achouLevouPhase24B3Version = VERSION;

  const state = {
    batch: null,
    busy: false,
    confirmed: false,
    lastOfferId: '',
    error: ''
  };

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();

  function toast(message, kind = 'ok', duration = 8500) {
    document.getElementById(TOAST_ID)?.remove();
    const element = document.createElement('div');
    element.id = TOAST_ID;
    element.textContent = message;
    const palette = kind === 'error'
      ? 'background:#7f1d1d;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'warning'
        ? 'background:#78350f;color:#ffedd5;border:1px solid #fb923c'
        : 'background:#e6fff5;color:#052e21;border:1px solid #34d399';
    element.style.cssText = `position:fixed;left:50%;bottom:188px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100% - 28px);padding:12px 16px;border-radius:14px;font:700 13px system-ui;text-align:center;box-shadow:0 12px 36px #0008;${palette}`;
    document.documentElement.appendChild(element);
    setTimeout(() => element.remove(), duration);
  }

  async function request(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.detalhe || `O servidor respondeu com HTTP ${response.status}.`);
      }
      return json;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('A operação demorou demais para responder. Verifique a internet e tente novamente.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const approvedItems = batch => (Array.isArray(batch?.items) ? batch.items : [])
    .filter(item => item.decision === 'approved');
  const linkedItems = batch => approvedItems(batch).filter(item => clean(item.affiliateUrl));
  const messageReadyItems = batch => linkedItems(batch).filter(item => clean(item.message));
  const pendingMessageItems = batch => linkedItems(batch).filter(item => !clean(item.message));

  function selectBatch(batches) {
    const usable = (Array.isArray(batches) ? batches : [])
      .filter(batch => batch && batch.status !== 'archived' && linkedItems(batch).length);
    return usable.find(batch => pendingMessageItems(batch).length) || usable[0] || null;
  }

  async function loadBatch(showToast = true) {
    const response = await request(`${BATCHES_ENDPOINT}?profile=julio&t=${Date.now()}`, {}, 30000);
    state.batch = selectBatch(response.batches);
    updateButton();

    if (!state.batch) {
      if (showToast) toast('Nenhum lote aprovado com links afiliados foi encontrado.', 'warning');
      return null;
    }

    const linked = linkedItems(state.batch).length;
    const ready = messageReadyItems(state.batch).length;
    const pending = pendingMessageItems(state.batch).length;
    if (showToast) {
      toast(pending
        ? `Lote carregado: ${linked} link(s), ${ready} mensagem(ns) pronta(s) e ${pending} pendente(s).`
        : `✅ Todas as ${ready} mensagens deste lote já estão prontas.`);
    }
    return state.batch;
  }

  function formatPrice(item) {
    const text = clean(item?.priceText);
    if (text) return text;
    const value = Number(item?.priceValue);
    return Number.isFinite(value)
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '';
  }

  function fillAchouLevouForm(item, message) {
    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.value = value || '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };

    setValue('input-link', item.affiliateUrl);
    setValue('display-produto', item.title);
    setValue('display-de', '');
    setValue('display-por', formatPrice(item));
    setValue('display-cupom', '');

    const store = document.getElementById('select-loja');
    if (store) {
      const shopeeOption = [...store.options].find(option => /shopee/i.test(option.value || option.textContent || ''));
      if (shopeeOption) store.value = shopeeOption.value;
      store.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const preview = document.getElementById('msg-preview');
    if (preview) {
      preview.innerText = message;
      preview.dispatchEvent(new Event('input', { bubbles: true }));
    }

    window.__ultimaMensagemAchouLevou = message;
    window.__produtoImagemAtual = clean(item.image);
    window.__radarCurrentQueueItemId = `phase24b3:${state.batch.id}:${item.id}`;
  }

  async function generateMessage(item) {
    const payload = {
      produto: clean(item.title),
      precoDe: '',
      precoPor: formatPrice(item),
      cupom: '',
      loja: 'Shopee',
      link: clean(item.affiliateUrl)
    };
    const response = await request(`${API_BASE}/gerar-mensagem`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const message = clean(response.mensagem);
    if (!message) throw new Error('O gerador não devolveu uma mensagem válida.');
    return { message, fallback: Boolean(response.fallback), warning: clean(response.warning) };
  }

  async function saveAndVerifyOffer(item, message) {
    const sourceId = `phase24b3:${state.batch.id}:${item.id}`;
    const saved = await request(SHARED_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        source: 'radar-phase24b3',
        sourceId,
        title: clean(item.title),
        price: formatPrice(item),
        oldPrice: '',
        coupon: '',
        image: clean(item.image),
        link: clean(item.affiliateUrl),
        message
      })
    }, 45000);

    const offerId = clean(saved.offer?.id);
    if (!offerId) throw new Error('O Achou Levou não devolveu o ID da oferta.');

    const verified = await request(`${SHARED_ENDPOINT}/${encodeURIComponent(offerId)}`, {}, 30000);
    if (clean(verified.offer?.id) !== offerId) {
      throw new Error('A oferta não apareceu na consulta individual de confirmação.');
    }

    const list = await request(`${SHARED_ENDPOINT}?t=${Date.now()}`, {}, 30000);
    const offers = Array.isArray(list.offers) ? list.offers : [];
    if (!offers.some(offer => clean(offer.id) === offerId && clean(offer.sourceId) === sourceId)) {
      throw new Error('A oferta não apareceu na lista compartilhada após a gravação.');
    }

    state.lastOfferId = offerId;
    return { offerId, offers };
  }

  async function patchItem(item, message) {
    const response = await request(
      `${BATCHES_ENDPOINT}/${encodeURIComponent(state.batch.id)}/items/${encodeURIComponent(item.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'message-ready', message })
      },
      30000
    );
    state.batch = response.batch || state.batch;
  }

  async function patchBatchStatus(status) {
    if (!state.batch || state.batch.status === status) return;
    const response = await request(`${BATCHES_ENDPOINT}/${encodeURIComponent(state.batch.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }, 30000);
    state.batch = response.batch || state.batch;
  }

  async function prepareNext() {
    if (state.busy) return;
    state.busy = true;
    state.error = '';
    updateButton();

    try {
      if (!state.batch) await loadBatch(false);
      if (!state.batch) throw new Error('Nenhum lote aprovado com links foi encontrado.');

      const pending = pendingMessageItems(state.batch);
      if (!pending.length) {
        toast(`✅ Todas as ${messageReadyItems(state.batch).length} mensagens já estão prontas.`);
        return;
      }

      if (!state.confirmed) {
        const accepted = window.confirm(
          `Gerar e salvar somente 1 mensagem agora?\n\nPendentes: ${pending.length}\nA oferta ficará no Achou Levou para revisão. Nada será enviado ao WhatsApp.`
        );
        if (!accepted) return;
        state.confirmed = true;
      }

      const item = pending[0];
      await patchBatchStatus('processing');
      toast(`✨ Gerando mensagem: ${clean(item.title).slice(0, 72)}...`, 'ok', 5000);

      const generated = await generateMessage(item);
      const saved = await saveAndVerifyOffer(item, generated.message);
      fillAchouLevouForm(item, generated.message);
      await patchItem(item, generated.message);

      const remaining = pendingMessageItems(state.batch).length;
      const ready = messageReadyItems(state.batch).length;
      if (!remaining) await patchBatchStatus('completed');

      try { await root.syncSharedAchouLevou?.(); } catch {}
      updateButton();

      const fallbackNote = generated.fallback ? ' Mensagem local segura usada.' : '';
      toast(
        remaining
          ? `✅ Oferta salva e confirmada. Prontas: ${ready}. Restam: ${remaining}.${fallbackNote}`
          : `🎉 Fase 24B.3 concluída: ${ready} mensagens salvas para revisão.${fallbackNote}`,
        generated.fallback ? 'warning' : 'ok',
        10000
      );

      return { item, message: generated.message, offerId: saved.offerId, remaining, ready };
    } catch (error) {
      state.error = clean(error?.message || error);
      toast(`A mensagem não foi salva: ${state.error}`, 'error', 11000);
      console.error('[FASE 24B.3] Falha ao preparar oferta:', error);
      throw error;
    } finally {
      state.busy = false;
      updateButton();
    }
  }

  function buttonLabel() {
    if (state.busy) return '⏳ Gerando e confirmando...';
    if (!state.batch) return '✍️ Carregar lote 24B';
    const pending = pendingMessageItems(state.batch).length;
    const ready = messageReadyItems(state.batch).length;
    return pending ? `✨ Preparar próxima (${pending})` : `✅ ${ready} mensagens prontas`;
  }

  function updateButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    button.textContent = buttonLabel();
    button.disabled = state.busy || Boolean(state.batch && !pendingMessageItems(state.batch).length);
    button.style.opacity = button.disabled ? '0.82' : '1';
  }

  function installButton() {
    if (!document.documentElement || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = buttonLabel();
    button.style.cssText = 'position:fixed;left:12px;bottom:188px;z-index:2147483646;max-width:calc(100% - 24px);padding:12px 16px;border:0;border-radius:14px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font:800 13px system-ui;box-shadow:0 12px 34px #0008;cursor:pointer;';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.batch) {
        try { await loadBatch(true); } catch (error) {
          state.error = clean(error?.message || error);
          toast(`Não foi possível carregar o lote: ${state.error}`, 'error');
        }
        return;
      }
      prepareNext().catch(() => {});
    }, true);
    document.documentElement.appendChild(button);
    updateButton();
  }

  const observer = new MutationObserver(() => installButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', installButton);
  window.addEventListener('load', installButton);

  root.phase24B3 = {
    version: VERSION,
    loadBatch,
    prepareNext,
    state,
    supervised: true,
    autoStart: false,
    sendsWhatsapp: false,
    batchEndpoint: BATCHES_ENDPOINT,
    sharedEndpoint: SHARED_ENDPOINT
  };

  window.__radarClassicRemote = window.__radarClassicRemote || {};
  window.__radarClassicRemote.phase24B3 = {
    version: VERSION,
    ready: true,
    supervised: true,
    verifiedSharedSave: true,
    sendsWhatsapp: false,
    loadedAt: Date.now()
  };

  installButton();
})();
