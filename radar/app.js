(() => {
  'use strict';

  const BASE = new URL('.', location.href);
  const CONFIG_URL = new URL('config.json', BASE).href;
  const CLASSIC_CONFIG_URL = new URL('classic-config.json', BASE).href;
  const state = {
    config: null,
    classicConfig: null,
    queue: readJson('radar_remote_queue', []),
    lastCheck: null
  };
  const $ = id => document.getElementById(id);

  function nativeAvailable() {
    return !!window.RadarNative;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || '') || fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function toast(message) {
    const box = $('toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => box.classList.remove('show'), 3200);
  }

  function nowLabel() {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
  }

  async function fetchJson(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadConfig(showToast = false) {
    $('status').textContent = 'Buscando painel e módulos clássicos no servidor...';

    const [panelResult, classicResult] = await Promise.allSettled([
      fetchJson(CONFIG_URL),
      fetchJson(CLASSIC_CONFIG_URL)
    ]);

    if (panelResult.status === 'fulfilled') {
      state.config = panelResult.value;
      saveJson('radar_remote_config', state.config);
      if (nativeAvailable() && RadarNative.applyRemoteConfig) {
        RadarNative.applyRemoteConfig(JSON.stringify(state.config));
      }
    } else {
      state.config = readJson('radar_remote_config', null);
    }

    if (classicResult.status === 'fulfilled') {
      state.classicConfig = classicResult.value;
      saveJson('radar_classic_remote_config', state.classicConfig);
    } else {
      state.classicConfig = readJson('radar_classic_remote_config', null);
    }

    state.lastCheck = nowLabel();
    render();

    if (showToast) {
      const panel = state.config?.release || 'offline';
      const classic = state.classicConfig?.release || 'offline';
      toast(`Painel ${panel} • Clássico ${classic}`);
    }
  }

  function renderQueue() {
    $('queue-count').textContent = String(state.queue.length);
    const box = $('queue');

    if (!state.queue.length) {
      box.className = 'queue empty';
      box.textContent = 'Nenhum produto na fila remota.';
      return;
    }

    box.className = 'queue';
    box.innerHTML = state.queue
      .slice(0, 20)
      .map(item => `
        <div class="queue-item">
          <strong>${escapeHtml(item.title || 'Produto')}</strong>
          <small>${escapeHtml(item.status || 'Aguardando')}</small>
        </div>
      `)
      .join('');
  }

  function render() {
    const config = state.config;
    const classic = state.classicConfig;
    const shellVersion = nativeAvailable() && RadarNative.getShellVersion
      ? RadarNative.getShellVersion()
      : 'navegador';

    $('status').textContent = nativeAvailable()
      ? 'APK-casca conectado. Painel e clássico consultados separadamente.'
      : 'Modo navegador. Abra pelo Radar IA para usar a automação.';

    $('version').textContent = config ? `painel ${config.release}` : 'painel offline';
    $('classic-version').textContent = classic
      ? `clássico ${classic.release}`
      : 'clássico offline';
    $('ui-version').textContent = config?.uiVersion || '-';
    $('module-version').textContent = shellVersion;
    $('classic-module-version').textContent = classic?.release || '-';
    $('last-check').textContent = state.lastCheck || '-';
    renderQueue();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[character]);
  }

  function openUrl(url) {
    if (!url) return;
    if (nativeAvailable() && RadarNative.openUrl) RadarNative.openUrl(url);
    else location.href = url;
  }

  function handleAction(action) {
    const config = state.config;

    if (action === 'sync') return loadConfig(true);

    if (action === 'classic') {
      if (nativeAvailable() && RadarNative.openClassic) RadarNative.openClassic();
      else toast('O modo clássico existe apenas dentro do APK.');
      return;
    }

    if (!config) return toast('A configuração do painel ainda não foi carregada.');
    if (action === 'shopee') openUrl(config.shopeeUrl);
    if (action === 'achou') openUrl(config.achouLevouUrl);
  }

  window.radarReceive = payload => {
    try {
      const event = typeof payload === 'string' ? JSON.parse(payload) : payload;

      if (event.type === 'queue.replace' && Array.isArray(event.items)) {
        state.queue = event.items;
        saveJson('radar_remote_queue', state.queue);
        renderQueue();
      }

      if (event.type === 'queue.add' && event.item) {
        state.queue.unshift(event.item);
        saveJson('radar_remote_queue', state.queue);
        renderQueue();
      }

      if (event.message) toast(event.message);
    } catch {
      toast('O painel recebeu um evento inválido.');
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button.dataset.action);
  });

  $('refresh').addEventListener('click', () => loadConfig(true));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  loadConfig(false);
})();
