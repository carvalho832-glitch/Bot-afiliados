(() => {
  'use strict';

  const VERSION = '93.1.0';
  const PANEL_URLS = Object.freeze({
    julio: 'https://bot.achoulevoubot.uk/painel',
    renata: 'https://usuario2.achoulevoubot.uk/painel'
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
    return PANEL_URLS[currentProfile()] || PANEL_URLS.julio;
  }

  function openPanel() {
    window.location.assign(panelUrl());
  }

  function syncApi() {
    if (window.AchouLevouBotQueue) {
      window.AchouLevouBotQueue.openPanel = openPanel;
    }
  }

  function markButton() {
    const button = document.getElementById('btn-abrir-painel-bot');
    if (!button) return;
    button.dataset.embeddedPanelVersion = VERSION;
    button.title = 'Abrir Painel WhatsApp do perfil selecionado';
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#btn-abrir-painel-bot');
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openPanel();
  }, true);

  const observer = new MutationObserver(() => {
    syncApi();
    markButton();
  });

  function install() {
    syncApi();
    markButton();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  window.addEventListener('achoulevou:bot-profile', () => {
    syncApi();
    markButton();
  });

  window.AchouLevouEmbeddedPanel = {
    version: VERSION,
    open: openPanel,
    panelUrl,
    currentProfile,
    install
  };
})();
