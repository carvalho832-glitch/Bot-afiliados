(() => {
  'use strict';

  const VERSION = '1.0.0';
  const LOCAL_BOTS = Object.freeze({
    julio: 'http://127.0.0.1:3000',
    renata: 'http://127.0.0.1:3200'
  });

  function normalizeProfile(value = '') {
    const text = String(value || '').trim().toLowerCase();
    return ['renata', 'usuario2', 'user2', '2'].includes(text) ? 'renata' : 'julio';
  }

  function activeProfile() {
    try {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('perfil') || params.get('bot') || params.get('usuario');
      if (requested) return normalizeProfile(requested);
      return normalizeProfile(localStorage.getItem('achou_levou_bot_profile') || 'julio');
    } catch {
      return 'julio';
    }
  }

  function profileLabel(profile = activeProfile()) {
    return profile === 'renata' ? 'Renata' : 'Júlio';
  }

  function ensureCard() {
    const metrics = document.querySelector('.v2-metrics');
    if (!metrics) return null;

    let card = document.getElementById('v2-affiliate-card');
    if (card) return card;

    const profile = activeProfile();
    card = document.createElement('article');
    card.className = 'v2-metric v2-affiliate-metric';
    card.id = 'v2-affiliate-card';
    card.innerHTML =
      '<small>Bot Afiliado</small>' +
      `<strong id="v2-affiliate">${profileLabel(profile)}</strong>` +
      '<p id="v2-affiliate-txt">Aguardando produto</p>' +
      '<i>⚡</i>';
    metrics.appendChild(card);
    return card;
  }

  function setStatus(detail = {}) {
    ensureCard();
    const profile = normalizeProfile(detail.profile || activeProfile());
    const title = document.getElementById('v2-affiliate');
    const text = document.getElementById('v2-affiliate-txt');
    const card = document.getElementById('v2-affiliate-card');
    if (!title || !text || !card) return;

    title.textContent = profileLabel(profile);
    card.dataset.state = detail.source || 'idle';

    if (detail.source === 'local') {
      const ok = Number(detail.status) >= 200 && Number(detail.status) < 500;
      text.textContent = ok ? 'Local conectado' : `Local HTTP ${detail.status || '?'}`;
      title.style.color = ok ? 'var(--v2-green)' : 'var(--v2-red)';
      card.title = `Bot local: ${detail.baseUrl || LOCAL_BOTS[profile]}`;
      return;
    }

    if (detail.source === 'cloud-fallback') {
      text.textContent = 'Fallback nuvem';
      title.style.color = '#ffd27a';
      card.title = 'O bot local não respondeu. A consulta usou a nuvem.';
      return;
    }

    text.textContent = 'Aguardando produto';
    title.style.color = 'var(--v2-cyan)';
    card.title = `Bot local esperado: ${LOCAL_BOTS[profile]}`;
  }

  function install() {
    if (!ensureCard()) return false;
    setStatus({ profile: activeProfile() });

    if (navigator.serviceWorker && !window.__affiliateV2ServiceWorkerListener) {
      window.__affiliateV2ServiceWorkerListener = true;
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'AFFILIATE_BOT_SOURCE') {
          setStatus(event.data);
        }
      });
    }

    if (!window.__affiliateV2ProfileListener) {
      window.__affiliateV2ProfileListener = true;
      window.addEventListener('achoulevou:bot-profile', () => setStatus({ profile: activeProfile() }));
    }

    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }

  window.AchouLevouAffiliateV2Status = {
    version: VERSION,
    install,
    setStatus,
    activeProfile
  };
})();
