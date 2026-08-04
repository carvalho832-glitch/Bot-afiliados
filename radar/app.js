(() => {
  'use strict';
  const BASE = new URL('.', location.href);
  const CONFIG_URL = new URL('config.json', BASE).href;
  const state = { config: null, queue: readJson('radar_remote_queue', []), lastCheck: null };
  const $ = (id) => document.getElementById(id);

  function nativeAvailable() { return !!window.RadarNative; }
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; } }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function toast(message) { const box = $('toast'); box.textContent = message; box.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => box.classList.remove('show'), 2600); }
  function nowLabel() { return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()); }

  async function loadConfig(showToast = false) {
    $('status').textContent = 'Buscando configuração no servidor...';
    try {
      const response = await fetch(`${CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.config = await response.json();
      state.lastCheck = nowLabel();
      localStorage.setItem('radar_remote_config', JSON.stringify(state.config));
      if (nativeAvailable() && RadarNative.applyRemoteConfig) RadarNative.applyRemoteConfig(JSON.stringify(state.config));
      render();
      if (showToast) toast(`Atualização ${state.config.release} carregada`);
    } catch (error) {
      state.config = readJson('radar_remote_config', null);
      $('status').textContent = state.config ? 'Modo offline: usando a última atualização salva.' : 'Servidor indisponível e nenhum cache encontrado.';
      if (showToast) toast('Não foi possível buscar a atualização agora');
    }
  }

  function renderQueue() {
    $('queue-count').textContent = String(state.queue.length);
    const box = $('queue');
    if (!state.queue.length) { box.className = 'queue empty'; box.textContent = 'Nenhum produto na fila remota.'; return; }
    box.className = 'queue';
    box.innerHTML = state.queue.slice(0, 20).map(item => `<div class="queue-item"><strong>${escapeHtml(item.title || 'Produto')}</strong><small>${escapeHtml(item.status || 'Aguardando')}</small></div>`).join('');
  }

  function render() {
    const config = state.config;
    const shellVersion = nativeAvailable() && RadarNative.getShellVersion ? RadarNative.getShellVersion() : 'navegador';
    $('status').textContent = nativeAvailable() ? 'APK-casca conectado. Atualizações remotas ativas.' : 'Modo navegador. Abra pelo Radar IA para usar a automação.';
    $('version').textContent = config ? `release ${config.release}` : 'offline';
    $('ui-version').textContent = config?.uiVersion || '-';
    $('module-version').textContent = shellVersion;
    $('last-check').textContent = state.lastCheck || '-';
    renderQueue();
  }

  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function openUrl(url) { if (!url) return; if (nativeAvailable() && RadarNative.openUrl) RadarNative.openUrl(url); else location.href = url; }

  function handleAction(action) {
    const c = state.config;
    if (action === 'sync') return loadConfig(true);
    if (action === 'classic') {
      if (nativeAvailable() && RadarNative.openClassic) RadarNative.openClassic(); else toast('O modo clássico existe apenas dentro do APK.');
      return;
    }
    if (!c) return toast('A configuração ainda não foi carregada.');
    if (action === 'shopee') openUrl(c.shopeeUrl);
    if (action === 'achou') openUrl(c.achouLevouUrl);
  }

  window.radarReceive = (payload) => {
    try {
      const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (event.type === 'queue.replace' && Array.isArray(event.items)) { state.queue = event.items; saveJson('radar_remote_queue', state.queue); renderQueue(); }
      if (event.type === 'queue.add' && event.item) { state.queue.unshift(event.item); saveJson('radar_remote_queue', state.queue); renderQueue(); }
      if (event.message) toast(event.message);
    } catch { toast('O painel recebeu um evento inválido.'); }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button.dataset.action);
  });
  $('refresh').addEventListener('click', () => loadConfig(true));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  loadConfig(false).then(render);
})();
