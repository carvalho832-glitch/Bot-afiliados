(() => {
  'use strict';

  const VERSION = '2.1.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const ENDPOINT = `${API_BASE}/shared/offers`;
  const STORAGE_KEY = 'ofertas_achou_levou';
  const REQUEST_TIMEOUT_MS = 45000;
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
  const state = {
    saving: false,
    confirmed: false,
    error: '',
    lastOfferId: ''
  };

  function normalizeRemote(item = {}) {
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

  function applyRemoteList(remoteOffers) {
    const local = (Array.isArray(remoteOffers) ? remoteOffers : [])
      .map(normalizeRemote)
      .filter(item => item.texto);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));

    try {
      if (typeof ofertasSet !== 'undefined' && Array.isArray(ofertasSet)) {
        ofertasSet.splice(0, ofertasSet.length, ...local);
      }
      if (typeof renderizarOfertas === 'function') renderizarOfertas();
    } catch (error) {
      console.warn('[RADAR-SHARED] Lista confirmada, mas a tela não redesenhou:', error);
    }

    window.dispatchEvent(new CustomEvent('achoulevou:ofertas-atualizadas', {
      detail: { total: local.length, shared: true, confirmed: true }
    }));
    return local;
  }

  async function request(path = '', options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${ENDPOINT}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        },
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });

      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || `A fila compartilhada respondeu com HTTP ${response.status}.`);
      }
      return json;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('A fila compartilhada demorou demais para responder.');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function currentOffer() {
    const ids = root.selectors.achouLevou;
    let candidate = null;
    try {
      if (typeof ofertasSet !== 'undefined' && Array.isArray(ofertasSet)) candidate = ofertasSet[0];
    } catch {}

    const screenMessage = clean(document.getElementById(ids.message)?.innerText || '');
    const latestMessage = clean(window.__ultimaMensagemAchouLevou || '');
    const message = !/aguardando gera[cç][aã]o/i.test(screenMessage)
      ? screenMessage
      : latestMessage || clean(candidate?.texto || candidate?.mensagem || '');

    const screenLink = clean(document.getElementById(ids.link)?.value || '');
    const link = screenLink || clean(candidate?.link || '');

    return {
      source: 'radar-ia-classic',
      sourceId: clean(window.__radarCurrentQueueItemId || candidate?.sourceId || ''),
      title: clean(document.getElementById(ids.title)?.value || candidate?.titulo || ''),
      price: clean(document.getElementById(ids.price)?.value || candidate?.preco || ''),
      oldPrice: clean(document.getElementById(ids.oldPrice)?.value || candidate?.precoAntigo || ''),
      coupon: clean(document.getElementById(ids.coupon)?.value || candidate?.cupom || ''),
      image: clean(window.__produtoImagemAtual || candidate?.imagem || ''),
      link,
      message
    };
  }

  async function saveShared() {
    if (state.saving) throw new Error('A oferta já está sendo salva.');

    state.saving = true;
    state.confirmed = false;
    state.error = '';
    state.lastOfferId = '';

    try {
      const offer = currentOffer();
      if (!offer.message || /aguardando gera[cç][aã]o/i.test(offer.message)) {
        throw new Error('A mensagem da oferta ainda não foi gerada.');
      }
      if (!offer.link) throw new Error('O link de afiliado está vazio.');

      const saved = await request('', {
        method: 'POST',
        body: JSON.stringify(offer)
      });

      const rawId = String(saved.offer?.id || '');
      if (!rawId) throw new Error('A API não devolveu o ID da oferta.');

      const verified = await request(`/${encodeURIComponent(rawId)}`);
      if (String(verified.offer?.id || '') !== rawId) {
        throw new Error('O ID devolvido não apareceu na consulta de confirmação.');
      }

      const list = await request('');
      const offers = Array.isArray(list.offers) ? list.offers : [];
      if (!offers.some(item => String(item.id) === rawId)) {
        throw new Error('A oferta não apareceu na fila compartilhada após a gravação.');
      }

      applyRemoteList(offers);
      state.confirmed = true;
      state.lastOfferId = rawId;
      return { ...saved, verified: true, offers };
    } catch (error) {
      state.error = String(error?.message || error);
      state.confirmed = false;
      throw error;
    } finally {
      state.saving = false;
    }
  }

  async function syncFromServer() {
    try {
      const list = await request('');
      const offers = Array.isArray(list.offers) ? list.offers : [];
      applyRemoteList(offers);
      state.confirmed = true;
      return offers;
    } catch (error) {
      state.error = String(error?.message || error);
      console.warn('[RADAR-SHARED] Sincronização inicial indisponível:', state.error);
      return null;
    }
  }

  function showMessage(message) {
    if (typeof window.appAlert === 'function') return window.appAlert(message);
    window.alert(message);
    return Promise.resolve();
  }

  function installSaveInterceptor() {
    const button = document.getElementById(root.selectors.achouLevou.save);
    if (!button || button.dataset.radarSharedSave === VERSION) return;
    button.dataset.radarSharedSave = VERSION;

    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const original = button.innerText;
      button.disabled = true;
      button.innerText = '☁️ Salvando e confirmando...';

      try {
        const result = await saveShared();
        button.innerText = '✅ Salva e confirmada';
        await showMessage(`Oferta salva na fila compartilhada.\n\nID: ${result.offer.id}`);
      } catch (error) {
        button.innerText = '❌ Não foi salva';
        await showMessage(`A oferta não foi salva no Achou Levou.\n\n${error.message}`);
      } finally {
        button.disabled = false;
        setTimeout(() => { button.innerText = original; }, 2200);
      }
    }, true);
  }

  window.salvarOfertas = saveShared;
  root.saveSharedAchouLevou = saveShared;
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
        saving: state.saving,
        error: state.error,
        lastOfferId: state.lastOfferId
      },
      loadedAt: Date.now()
    };
  };

  root.beforePrepareAchouLevou = () => {
    const ids = root.selectors.achouLevou;
    const required = [ids.link, ids.title, ids.price, ids.message, ids.save];
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
    verifiedSave: true,
    endpoint: ENDPOINT,
    loadedAt: Date.now()
  };

  installSaveInterceptor();
  syncFromServer();
})();
