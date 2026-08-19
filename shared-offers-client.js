(() => {
  'use strict';

  const VERSION = '1.1.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const ENDPOINT = `${API_BASE}/shared/offers`;
  const STORAGE_KEY = 'ofertas_achou_levou';
  const SYNC_MARKER = 'achou_levou_shared_sync_marker';
  const REQUEST_TIMEOUT_MS = 45000;

  if (window.AchouLevouSharedOffers?.version === VERSION) return;

  const clean = (value = '') => String(value || '').replace(/\r\n/g, '\n').trim();
  const byId = id => document.getElementById(id);

  function affiliateProfileId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const requested = clean(params.get('perfil') || params.get('bot') || params.get('usuario') || '');
      const saved = clean(localStorage.getItem('achou_levou_bot_profile') || '');
      const value = (requested || saved || 'julio').toLowerCase();
      return ['renata', 'usuario2', 'user2', '2'].includes(value) ? 'renata' : 'julio';
    } catch {
      return 'julio';
    }
  }

  function affiliateProfileLabel(profileId = affiliateProfileId()) {
    return profileId === 'renata' ? 'Renata' : 'Júlio';
  }

  function ensureAffiliateStatusCard() {
    let card = byId('affiliate-bot-status-card');
    if (card) return card;

    const whatsappStatus = document.querySelector('.status-card');
    if (!whatsappStatus?.parentNode) return null;

    card = document.createElement('section');
    card.className = 'status-card';
    card.id = 'affiliate-bot-status-card';
    card.innerHTML = `
      <div>
        <span class="status-label">Bot Afiliado</span>
        <strong id="affiliate-bot-status-text">${affiliateProfileLabel()}</strong>
      </div>
      <span id="affiliate-bot-status-pill" class="status-pill" data-state="idle">Aguardando produto</span>`;
    whatsappStatus.insertAdjacentElement('afterend', card);
    return card;
  }

  function setAffiliateStatus(detail = {}) {
    ensureAffiliateStatusCard();
    const profileId = detail.profile === 'renata' ? 'renata' : affiliateProfileId();
    const label = affiliateProfileLabel(profileId);
    const text = byId('affiliate-bot-status-text');
    const pill = byId('affiliate-bot-status-pill');

    if (text) text.textContent = label;
    if (!pill) return;

    if (detail.source === 'local') {
      pill.textContent = detail.status >= 200 && detail.status < 500 ? 'Local conectado' : `Local HTTP ${detail.status}`;
      pill.dataset.state = detail.status >= 200 && detail.status < 500 ? 'ok' : 'error';
      pill.title = detail.baseUrl ? `Usando ${detail.baseUrl}` : 'Bot afiliado local';
      return;
    }

    if (detail.source === 'cloud-fallback') {
      pill.textContent = 'Fallback nuvem';
      pill.dataset.state = 'loading';
      pill.title = 'O bot local não respondeu. O Achou Levou usou o servidor em nuvem.';
      return;
    }

    pill.textContent = 'Aguardando produto';
    pill.dataset.state = 'idle';
  }

  function installAffiliateStatus() {
    ensureAffiliateStatusCard();

    if (navigator.serviceWorker && !window.__achouLevouAffiliateStatusListener) {
      window.__achouLevouAffiliateStatusListener = true;
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'AFFILIATE_BOT_SOURCE') {
          setAffiliateStatus(event.data);
        }
      });
    }

    window.addEventListener('achoulevou:bot-profile', () => setAffiliateStatus({}));
  }

  function messageFromScreen() {
    const value = clean(byId('msg-preview')?.innerText || window.__ultimaMensagemAchouLevou || '');
    return /aguardando gera[cç][aã]o/i.test(value) ? '' : value;
  }

  function offerFromScreen(extra = {}) {
    const link = clean(byId('input-link')?.value || extra.link || '');
    const message = clean(extra.message || messageFromScreen());
    return {
      source: extra.source || 'achou-levou-web',
      sourceId: clean(extra.sourceId || ''),
      title: clean(byId('display-produto')?.value || extra.title || ''),
      price: clean(byId('display-por')?.value || extra.price || ''),
      oldPrice: clean(byId('display-de')?.value || extra.oldPrice || ''),
      coupon: clean(byId('display-cupom')?.value || extra.coupon || ''),
      image: clean(window.__produtoImagemAtual || extra.image || ''),
      link,
      message
    };
  }

  function normalizeRemoteOffer(item = {}) {
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

  function localOffers() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeLocal(offers) {
    const normalized = (Array.isArray(offers) ? offers : [])
      .map(normalizeRemoteOffer)
      .filter(item => item.texto);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('achoulevou:ofertas-atualizadas', {
      detail: { total: normalized.length, shared: true }
    }));
    return normalized;
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

  async function load({ apply = true } = {}) {
    const json = await request('');
    const offers = Array.isArray(json.offers) ? json.offers : [];
    if (apply) writeLocal(offers);
    window.dispatchEvent(new CustomEvent('achoulevou:shared-offers-loaded', {
      detail: { count: offers.length, offers }
    }));
    return offers;
  }

  async function save(input = {}) {
    const offer = offerFromScreen(input);
    if (!offer.message) throw new Error('A mensagem da oferta ainda não foi gerada.');
    if (!offer.link) throw new Error('O link de afiliado está vazio.');

    const saved = await request('', {
      method: 'POST',
      body: JSON.stringify(offer)
    });

    const id = encodeURIComponent(saved.offer?.id || '');
    if (!id) throw new Error('O servidor não devolveu o identificador da oferta.');

    const verification = await request(`/${id}`);
    if (!verification.offer?.id || String(verification.offer.id) !== String(saved.offer.id)) {
      throw new Error('A oferta foi enviada, mas não apareceu na consulta de confirmação.');
    }

    const offers = await load({ apply: true });
    const confirmed = offers.some(item => String(item.id) === String(saved.offer.id));
    if (!confirmed) throw new Error('A oferta não apareceu na fila compartilhada após a gravação.');

    return { ...saved, verified: true, offers };
  }

  async function remove(id) {
    const json = await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await load({ apply: true });
    return json;
  }

  async function clear() {
    const json = await request('', { method: 'DELETE' });
    writeLocal([]);
    return json;
  }

  function signature(offers) {
    return JSON.stringify((offers || []).map(item => [
      String(item.id || ''),
      clean(item.texto || item.mensagem || item.message || ''),
      clean(item.updatedAt || '')
    ]));
  }

  async function initialSync() {
    installAffiliateStatus();

    try {
      const before = signature(localOffers());
      const remote = await load({ apply: true });
      const after = signature(remote.map(normalizeRemoteOffer));
      const marker = `${after.length}:${after.slice(0, 180)}`;

      if (before !== after && sessionStorage.getItem(SYNC_MARKER) !== marker) {
        sessionStorage.setItem(SYNC_MARKER, marker);
        location.reload();
        return;
      }
      sessionStorage.removeItem(SYNC_MARKER);
    } catch (error) {
      console.warn('[SHARED-OFFERS] Não foi possível sincronizar na abertura:', error.message);
      window.dispatchEvent(new CustomEvent('achoulevou:shared-offers-error', {
        detail: { error: error.message }
      }));
    }
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('#btn-salvar');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const original = button.innerText;
    button.disabled = true;
    button.innerText = '☁️ Salvando no servidor...';

    try {
      const result = await save();
      button.innerText = '✅ Salva e confirmada';
      await window.appAlert?.(`Oferta salva na fila compartilhada. ID: ${result.offer.id}`);
      setTimeout(() => location.reload(), 350);
    } catch (error) {
      button.innerText = '❌ Não foi salva';
      const message = `A oferta não foi salva no Achou Levou.\n\n${error.message}`;
      if (window.appAlert) await window.appAlert(message);
      else alert(message);
      setTimeout(() => { button.innerText = original; }, 2200);
    } finally {
      button.disabled = false;
    }
  }, true);

  window.AchouLevouSharedOffers = {
    version: VERSION,
    endpoint: ENDPOINT,
    load,
    save,
    remove,
    clear,
    writeLocal,
    offerFromScreen,
    affiliateStatus: setAffiliateStatus
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialSync, { once: true });
  } else {
    initialSync();
  }
})();
