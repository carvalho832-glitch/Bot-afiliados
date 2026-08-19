(() => {
  'use strict';

  const VERSION = '93.0.0';
  const PANEL_URLS = Object.freeze({
    julio: 'https://bot.achoulevoubot.uk',
    renata: 'https://usuario2.achoulevoubot.uk'
  });

  function normalizeProfile(value) {
    const profile = String(value || '').trim().toLowerCase();
    return ['renata', 'usuario2', 'user2', '2'].includes(profile) ? 'renata' : 'julio';
  }

  function currentProfile() {
    try {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('perfil') || params.get('bot') || params.get('usuario');
      if (requested) return normalizeProfile(requested);
    } catch {}

    const selector = document.getElementById('achou-profile-select');
    if (selector?.value) return normalizeProfile(selector.value);

    try {
      const config = window.AchouLevouBotQueue?.loadConfig?.() || {};
      if (config.profileId || config.profile) {
        return normalizeProfile(config.profileId || config.profile);
      }
      if (String(config.botUrl || '').includes('usuario2.achoulevoubot.uk')) return 'renata';
    } catch {}

    return normalizeProfile(document.documentElement.dataset.botProfile || 'julio');
  }

  function panelUrl() {
    const profile = currentProfile();
    const base = PANEL_URLS[profile] || PANEL_URLS.julio;
    return `${base}/painel`;
  }

  function openInsideCurrentWebView() {
    const target = panelUrl();
    window.location.assign(target);
  }

  function install() {
    if (window.AchouLevouBotQueue) {
      window.AchouLevouBotQueue.openPanel = openInsideCurrentWebView;
    }

    const button = document.getElementById('btn-abrir-painel-bot');
    if (!button || button.dataset.embeddedPanelVersion === VERSION) return;

    button.dataset.embeddedPanelVersion = VERSION;
    button.title = 'Abrir Painel WhatsApp do perfil selecionado';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      try {
        openInsideCurrentWebView();
      } catch (error) {
        console.error('[PAINEL EMBUTIDO]', error);
        alert(error?.message || 'Não foi possível abrir o Painel WhatsApp.');
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  window.addEventListener('achoulevou:bot-profile', install);
  window.AchouLevouEmbeddedPanel = {
    version: VERSION,
    open: openInsideCurrentWebView,
    panelUrl,
    currentProfile,
    install
  };
})();
