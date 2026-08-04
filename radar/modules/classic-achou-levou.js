(() => {
  'use strict';

  const VERSION = '2.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const ENDPOINT = `${API_BASE}/shared/offers`;
  const STORAGE_KEY = 'ofertas_achou_levou';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouVersion === VERSION) return;

  root.achouLevouVersion = VERSION;
  root.selectors = root.selectors || {};
  root.selectors.achouLevou = {
    link: 'input-link',
    title: 'display-produto',
    oldPrice: 'display-de',
    price: 'display-por',
    coupon: 'display-cupom',
    message: 'msg-preview',
    generate: 'btn-gerar',
    save: 'btn-salvar'
  };

  const clean = value => String(value || '').replace(/\r\n/g, '\n').trim();
  const originalStorageSetItem = Storage.prototype.setItem;
  const state = {
    active: false,
    confirmed: false,
    error: '',
    lastOfferId: ''
  };

  function xhrJson(method, url, body) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, false);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');

    try {
      xhr.send(body === undefined ? null : JSON.stringify(body));
    } catch (error) {
      throw new Error(`A fila compartilhada não respondeu: ${error.message}`);
    }

    let json = null;
    try { json = JSON.parse(xhr.responseText || '{}'); } catch {}
    if (xhr.status < 200 || xhr.status >= 300 || !json?.ok) {
      throw new Error(json?.error || `A fila compartilhada respondeu com HTTP ${xhr.status || 0}.`);
    }
    return json;
  }

  function toLocal(item = {}) {
    const message = clean(item.message || item.mensagem || item.texto || item.text || '');
    return {
      id: item.id,
      fingerprint: item.fingerprint || '',
      sourceId: item.sourceId || '',
      source: item.source || 'shared',
      titulo: item.title || item.titulo || '',
      preco: item.price || item.preco || '',
      precoAntigo: item.oldPrice || item.precoAntigo || '',
      cupom: item.coupon || item.cupom || '',
      link: item.link || '',
      imagem: item.image || item.imagem || '',
      texto: message,
      mensagem: message,
      criadoEm: item.createdAt || item.criadoEm || new Date().toISOString(),
      updatedAt: item.updatedAt || ''
    };
  }

  function writeConfirmedLocal(remoteOffers) {
    const local = (Array.isArray(remoteOffers) ? remoteOffers : [])
      .map(toLocal)
      .filter(item => item.texto);

    state.confirmed = true;
    originalStorageSetItem.call(localStorage, STORAGE_KEY, JSON.stringify(local));

    try {
      if (typeof ofertasSet !== 'undefined' && Array.isArray(ofertasSet)) {
        ofertasSet.splice(0, ofertasSet.length, ...local);
      }
      if (typeof renderizarOfertas === 'function') renderizarOfertas();
    } catch (error) {
      console.warn('[RADAR-SHARED] A fila foi salva, mas a lista visual não pôde ser redesenhada:', error);
    }

    window.dispatchEvent(new CustomEvent('achoulevou:ofertas-atualizadas', {
      detail: { total: local.length, shared: true, confirmed: true }
    }));
    return local;
  }

  function currentOffer() {
    const ids = root.selectors.achouLevou;
    let candidate = null;
    try {
      if (typeof ofertasSet !== 'undefined' && Array.isArray(ofertasSet)) candidate = ofertasSet[0];
    } catch {}

    const message = clean(
      candidate?.texto || candidate?.mensagem ||
      document.getElementById(ids.message)?.innerText ||
      window.__ultimaMensagemAchouLevou || ''
    );
    const link = clean(candidate?.link || document.getElementById(ids.link)?.value || '');

    return {
      source: 'radar-ia-classic',
      sourceId: clean(window.__radarCurrentQueueItemId || candidate?.sourceId || ''),
      title: clean(candidate?.titulo || document.getElementById(ids.title)?.value || ''),
      price: clean(candidate?.preco || document.getElementById(ids.price)?.value || ''),
      oldPrice: clean(candidate?.precoAntigo || document.getElementById(ids.oldPrice)?.value || ''),
      coupon: clean(candidate?.cupom || document.getElementById(ids.coupon)?.value || ''),
      image: clean(candidate?.imagem || window.__produtoImagemAtual || ''),
      link,
      message
    };
  }

  function saveSharedSynchronously() {
    state.active = true;
    state.confirmed = false;
    state.error = '';
    state.lastOfferId = '';

    try {
      const offer = currentOffer();
      if (!offer.message || /aguardando gera[cç][aã]o/i.test(offer.message)) {
        throw new Error('A mensagem da oferta ainda não foi gerada.');
      }
      if (!offer.link) throw new Error('O link de afiliado está vazio.');

      const saved = xhrJson('POST', ENDPOINT, offer);
      const id = encodeURIComponent(saved.offer?.id || '');
      if (!id) throw new Error('A API não devolveu o ID da oferta.');

      const verified = xhrJson('GET', `${ENDPOINT}/${id}`);
      if (String(verified.offer?.id || '') !== String(saved.offer.id)) {
        throw new Error('O ID devolvido não apareceu na consulta de confirmação.');
      }

      const list = xhrJson('GET', ENDPOINT);
      const offers = Array.isArray(list.offers) ? list.offers : [];
      if (!offers.some(item => String(item.id) === String(saved.offer.id))) {
        throw new Error('A oferta não apareceu na fila compartilhada após a gravação.');
      }

      writeConfirmedLocal(offers);
      state.lastOfferId = String(saved.offer.id);
      state.active = false;
      return saved;
    } catch (error) {
      state.error = String(error?.message || error);
      state.confirmed = false;
      // Mantemos active=true para bloquear o fallback local do código nativo.
      throw error;
    }
  }

  Storage.prototype.setItem = function radarSharedSetItem(key, value) {
    if (this === localStorage && key === STORAGE_KEY && state.active && !state.confirmed) {
      throw new Error(state.error || 'A oferta não recebeu confirmação da fila compartilhada.');
    }
    return originalStorageSetItem.call(this, key, value);
  };

  window.salvarOfertas = function salvarOfertasCompartilhadas() {
    return saveSharedSynchronously();
  };

  async function syncFromServer() {
    try {
      const response = await fetch(`${ENDPOINT}?t=${Date.now()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit'
      });
      const json = await response.json();
      if (!response.ok || !json?.ok || !Array.isArray(json.offers)) return;
      state.active = false;
      state.confirmed = true;
      writeConfirmedLocal(json.offers);
      state.active = false;
    } catch (error) {
      console.warn('[RADAR-SHARED] Sincronização inicial indisponível:', error.message);
    }
  }

  root.saveSharedAchouLevou = saveSharedSynchronously;
  root.syncSharedAchouLevou = syncFromServer;

  root.probeAchouLevou = () => {
    const ids = root.selectors.achouLevou;
    const present = Object.fromEntries(
      Object.entries(ids).map(([key, id]) => [key, !!document.getElementById(id)])
    );
    return {
      handled: true,
      version: VERSION,
      url: location.href,
      fields: present,
      message: clean(document.getElementById(ids.message)?.innerText || ''),
      shared: {
        endpoint: ENDPOINT,
        confirmed: state.confirmed,
        active: state.active,
        error: state.error,
        lastOfferId: state.lastOfferId
      },
      loadedAt: Date.now()
    };
  };

  root.beforePrepareAchouLevou = () => {
    const ids = root.selectors.achouLevou;
    const required = [ids.link, ids.title, ids.price, ids.message];
    return {
      handled: required.every(id => !!document.getElementById(id)),
      missing: required.filter(id => !document.getElementById(id)),
      version: VERSION,
      sharedEndpoint: ENDPOINT
    };
  };

  window.__radarClassicRemote = window.__radarClassicRemote || {};
  window.__radarClassicRemote.achouLevou = {
    version: VERSION,
    ready: true,
    shared: true,
    endpoint: ENDPOINT,
    loadedAt: Date.now()
  };

  syncFromServer();
})();
