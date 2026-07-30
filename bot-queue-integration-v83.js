(function () {
  'use strict';

  const CONFIG_KEY = 'achou_levou_bot_config';
  const PROFILE_KEY = 'achou_levou_bot_profile';
  const POLL_INTERVAL_MS = 10000;

  const PROFILES = Object.freeze({
    julio: Object.freeze({ id: 'julio', label: 'Júlio', botUrl: 'https://bot.achoulevoubot.uk' }),
    renata: Object.freeze({ id: 'renata', label: 'Renata', botUrl: 'https://usuario2.achoulevoubot.uk' })
  });

  let pollTimer = null;
  let requestInFlight = null;
  let lastOverview = null;
  let lastOverviewAt = 0;

  function normalizeProfileId(value) {
    const id = String(value || '').trim().toLowerCase();
    return ['renata', 'usuario2', 'user2', '2'].includes(id) ? 'renata' : 'julio';
  }

  function profileFromUrl(value) {
    return String(value || '').toLowerCase().includes('usuario2.achoulevoubot.uk') ? 'renata' : 'julio';
  }

  function requestedProfile() {
    try {
      const params = new URLSearchParams(location.search);
      const value = params.get('perfil') || params.get('bot') || params.get('usuario');
      return value ? normalizeProfileId(value) : null;
    } catch {
      return null;
    }
  }

  function activeProfileId() {
    const requested = requestedProfile();
    if (requested) {
      localStorage.setItem(PROFILE_KEY, requested);
      return requested;
    }

    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) return normalizeProfileId(saved);

    try {
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return profileFromUrl(config.botUrl);
    } catch {
      return 'julio';
    }
  }

  function activeProfile() {
    return PROFILES[activeProfileId()] || PROFILES.julio;
  }

  function loadConfig() {
    const profile = activeProfile();
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch {}

    const config = {
      ...saved,
      profileId: profile.id,
      profileLabel: profile.label,
      botUrl: profile.botUrl
    };

    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(PROFILE_KEY, profile.id);
    return config;
  }

  function saveConfig(partial = {}) {
    const profileId = normalizeProfileId(partial.profileId || partial.profile || profileFromUrl(partial.botUrl));
    const profile = PROFILES[profileId];
    const next = {
      ...loadConfig(),
      ...partial,
      profileId,
      profileLabel: profile.label,
      botUrl: profile.botUrl
    };
    localStorage.setItem(PROFILE_KEY, profileId);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function selectProfile(value, reload = true) {
    const id = normalizeProfileId(value);
    saveConfig({ profileId: id });
    lastOverview = null;
    lastOverviewAt = 0;

    if (reload) {
      const url = new URL(location.href);
      url.searchParams.set('perfil', id);
      location.replace(url.toString());
    }
    return PROFILES[id];
  }

  function normalizeStatus(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function interpretBotStatus(json) {
    const nested = json?.whatsapp || json?.session || json?.client || json?.data || {};
    const source = { ...json, ...nested };
    const raw = source.status ?? source.state ?? source.connection ?? source.connectionState ?? source.sessionStatus;
    const status = normalizeStatus(raw);
    const connected = source.connected ?? source.isConnected ?? source.ready ?? source.isReady;

    if (connected === true || ['conectado', 'connected', 'online', 'ready', 'authenticated', 'autenticado', 'open'].includes(status)) {
      return { label: 'Conectado', state: 'ok', connected: true, explicit: true };
    }
    if (['conectando', 'connecting', 'initializing', 'iniciando', 'loading', 'aguardando qr', 'qr'].includes(status)) {
      return { label: 'Conectando...', state: 'loading', connected: null, connecting: true, explicit: true };
    }
    if (connected === false || ['offline', 'disconnected', 'desconectado', 'closed', 'logout', 'sem sessao'].includes(status)) {
      return { label: 'Offline', state: 'error', connected: false, explicit: true };
    }
    if (json?.ok === true && !status) return { label: 'Online', state: 'ok', connected: true, explicit: true };
    return { label: raw ? String(raw) : 'Verificando...', state: 'loading', connected: null, explicit: Boolean(raw) };
  }

  function setStatus(label, state = 'idle') {
    const pill = document.getElementById('bot-status-pill');
    const text = document.getElementById('bot-status-text');
    if (pill) {
      pill.textContent = label;
      pill.dataset.state = state;
      pill.title = `Última verificação: ${new Date().toLocaleTimeString('pt-BR')}`;
    }
    if (text) text.textContent = label;
  }

  function dispatchStatus(detail) {
    setStatus(detail.label, detail.state);
    window.dispatchEvent(new CustomEvent('achoulevou:bot-status', { detail }));
  }

  function dispatchOverview(detail) {
    window.dispatchEvent(new CustomEvent('achoulevou:bot-overview', { detail }));
  }

  async function fetchJson(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (!response.ok || !json) throw new Error(json?.error || `HTTP ${response.status}: ${text.slice(0, 120)}`);
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readOverview() {
    const profile = activeProfile();
    const url = `${profile.botUrl}/overview?t=${Date.now()}`;
    return fetchJson(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      mode: 'cors'
    });
  }

  async function getOverview(options = {}) {
    const force = options.force === true;
    if (!force && lastOverview && Date.now() - lastOverviewAt < 2500) return lastOverview;
    if (requestInFlight) return requestInFlight;

    requestInFlight = (async () => {
      const profile = activeProfile();
      try {
        const payload = await readOverview();
        const status = payload.status || payload.connection || null;
        const queue = payload.queue || null;
        const overview = {
          ok: true,
          apiOnline: true,
          statusOk: Boolean(status),
          queueOk: Boolean(queue),
          status,
          queue,
          profile: { id: profile.id, label: profile.label, botUrl: profile.botUrl },
          errors: { status: null, queue: null },
          checkedAt: payload.checkedAt || new Date().toISOString()
        };

        lastOverview = overview;
        lastOverviewAt = Date.now();
        dispatchOverview(overview);
        dispatchStatus({ ...interpretBotStatus(status || payload), raw: status || payload, overview, profile: overview.profile });
        return overview;
      } catch (error) {
        const message = error?.name === 'AbortError' ? 'Tempo esgotado na leitura.' : String(error?.message || error);
        const overview = {
          ok: false,
          apiOnline: false,
          statusOk: false,
          queueOk: false,
          status: null,
          queue: null,
          profile: { id: profile.id, label: profile.label, botUrl: profile.botUrl },
          errors: { status: message, queue: message },
          checkedAt: new Date().toISOString()
        };
        dispatchOverview(overview);
        dispatchStatus({
          label: `${profile.label}: sem leitura`,
          state: 'warning',
          connected: null,
          unavailable: true,
          error: true,
          overview,
          profile: overview.profile
        });
        return overview;
      }
    })().finally(() => { requestInFlight = null; });

    return requestInFlight;
  }

  async function checkBotStatus() {
    const overview = await getOverview({ force: true });
    if (overview.statusOk && overview.status) return interpretBotStatus(overview.status);
    return { label: `${activeProfile().label}: sem leitura`, state: 'warning', connected: null, unavailable: true, error: true };
  }

  async function sendMessages(messages) {
    const config = loadConfig();
    const clean = Array.isArray(messages) ? messages.map(item => String(item || '').trim()).filter(Boolean) : [];
    if (!clean.length) throw new Error('Nenhuma mensagem para enviar.');

    setStatus(`Enviando para ${config.profileLabel}`, 'loading');
    const body = new URLSearchParams({ text: clean.join('\n---\n') });
    try {
      const json = await fetchJson(`${config.botUrl}/queue/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', Accept: 'application/json' },
        body: body.toString(),
        credentials: 'include',
        mode: 'cors'
      }, 25000);
      if (!json?.ok) throw new Error(json?.error || 'Falha ao adicionar ofertas.');
      setStatus(`Fila da ${config.profileLabel} atualizada`, 'ok');
      setTimeout(() => getOverview({ force: true }), 1000);
      return json;
    } catch (error) {
      setStatus(`Falha no envio para ${config.profileLabel}`, 'error');
      throw error?.name === 'AbortError' ? new Error('O envio demorou mais de 25 segundos.') : error;
    }
  }

  function openPanel() {
    window.open(`${loadConfig().botUrl}/painel`, '_blank');
  }

  function mountProfileSelector() {
    if (document.getElementById('achou-profile-select')) return;
    const actions = document.querySelector('.header-actions');
    if (!actions) return;

    const wrapper = document.createElement('label');
    wrapper.id = 'achou-profile-wrapper';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid rgba(105,229,220,.28);border-radius:14px;background:rgba(8,21,38,.72);color:#aab8cb;font-size:12px;font-weight:700;';
    wrapper.innerHTML = '<span>Perfil</span>';

    const select = document.createElement('select');
    select.id = 'achou-profile-select';
    select.setAttribute('aria-label', 'Selecionar bot');
    select.style.cssText = 'border:0;outline:0;background:transparent;color:#39e1d2;font:inherit;font-size:14px;font-weight:800;max-width:92px;';

    Object.values(PROFILES).forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.label;
      option.style.color = '#07111f';
      select.appendChild(option);
    });

    select.value = activeProfileId();
    select.addEventListener('change', () => selectProfile(select.value, true));
    wrapper.appendChild(select);
    actions.prepend(wrapper);

    document.documentElement.dataset.botProfile = activeProfileId();
    window.dispatchEvent(new CustomEvent('achoulevou:bot-profile', { detail: activeProfile() }));
  }

  function startPolling() {
    clearInterval(pollTimer);
    mountProfileSelector();
    getOverview({ force: true });
    pollTimer = setInterval(() => getOverview({ force: true }), POLL_INTERVAL_MS);
  }

  window.AchouLevouBotQueue = {
    loadConfig,
    saveConfig,
    selectProfile,
    getProfiles: () => PROFILES,
    sendMessages,
    openPanel,
    checkBotStatus,
    getOverview,
    interpretBotStatus,
    readBridgeUrl: null
  };

  document.addEventListener('DOMContentLoaded', startPolling);
  window.addEventListener('focus', () => getOverview({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) getOverview({ force: true });
  });
})();
