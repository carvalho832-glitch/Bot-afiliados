(function () {
  const CONFIG_KEY = 'achou_levou_bot_config';
  const PROFILE_KEY = 'achou_levou_bot_profile';

  const BOT_PROFILES = Object.freeze({
    julio: Object.freeze({
      id: 'julio',
      label: 'Júlio',
      botUrl: 'https://bot.achoulevoubot.uk'
    }),
    renata: Object.freeze({
      id: 'renata',
      label: 'Renata',
      botUrl: 'https://usuario2.achoulevoubot.uk'
    })
  });

  let statusTimer = null;
  let overviewRequest = null;
  let lastOverview = null;
  let lastOverviewAt = 0;

  function normalizeProfileId(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['renata', 'usuario2', 'user2', '2'].includes(normalized)) return 'renata';
    return 'julio';
  }

  function profileFromUrl(botUrl) {
    const value = String(botUrl || '').toLowerCase();
    return value.includes('usuario2.achoulevoubot.uk') ? 'renata' : 'julio';
  }

  function requestedProfile() {
    try {
      const params = new URLSearchParams(window.location.search);
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

    const savedProfile = localStorage.getItem(PROFILE_KEY);
    if (savedProfile) return normalizeProfileId(savedProfile);

    try {
      const savedConfig = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return profileFromUrl(savedConfig.botUrl);
    } catch {
      return 'julio';
    }
  }

  function activeProfile() {
    return BOT_PROFILES[activeProfileId()] || BOT_PROFILES.julio;
  }

  function loadConfig() {
    const profile = activeProfile();
    let saved = {};

    try {
      saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    } catch {}

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

  function saveConfig(config = {}) {
    const requestedId = config.profileId || config.profile || profileFromUrl(config.botUrl);
    const profileId = normalizeProfileId(requestedId);
    localStorage.setItem(PROFILE_KEY, profileId);

    const current = loadConfig();
    const profile = BOT_PROFILES[profileId];
    const next = {
      ...current,
      ...config,
      profileId,
      profileLabel: profile.label,
      botUrl: profile.botUrl
    };

    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function selectProfile(profileId, reload = true) {
    const id = normalizeProfileId(profileId);
    saveConfig({ profileId: id });
    lastOverview = null;
    lastOverviewAt = 0;

    if (reload) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('perfil', id);
      window.location.replace(nextUrl.toString());
    }

    return BOT_PROFILES[id];
  }

  function setStatus(message, state = 'idle') {
    const pill = document.getElementById('bot-status-pill');
    const text = document.getElementById('bot-status-text');

    if (pill) {
      pill.textContent = message;
      pill.dataset.state = state;
      pill.title = `Última verificação: ${new Date().toLocaleTimeString('pt-BR')}`;
    }
    if (text) text.textContent = message;
  }

  function normalizeStatusValue(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function readBooleanStatus(json, keys) {
    for (const key of keys) {
      if (json?.[key] === true) return true;
      if (json?.[key] === false) return false;
    }
    return null;
  }

  function interpretBotStatus(json) {
    const nested = json?.whatsapp || json?.session || json?.client || json?.data || {};
    const source = { ...json, ...nested };
    const connectedFlag = readBooleanStatus(source, [
      'connected', 'isConnected', 'ready', 'isReady', 'authenticated',
      'isAuthenticated', 'loggedIn', 'hasSession'
    ]);

    if (connectedFlag === true) {
      return { label: 'Conectado', state: 'ok', connected: true, explicit: true };
    }

    const rawStatus = source.status ?? source.state ?? source.connection ??
      source.connectionState ?? source.sessionStatus ?? source.whatsappStatus;
    const status = normalizeStatusValue(rawStatus);

    const onlineStates = [
      'conectado', 'connected', 'online', 'ready', 'authenticated', 'autenticado',
      'open', 'opened', 'logado', 'active', 'ativo'
    ];
    const connectingStates = [
      'conectando', 'connecting', 'initializing', 'iniciando', 'loading',
      'aguardando qr', 'qr', 'qr code'
    ];
    const offlineStates = [
      'offline', 'disconnected', 'desconectado', 'closed', 'close', 'logout',
      'logged out', 'sem sessao', 'no session'
    ];

    if (onlineStates.includes(status)) {
      return { label: 'Conectado', state: 'ok', connected: true, explicit: true };
    }
    if (connectingStates.includes(status)) {
      return { label: 'Conectando...', state: 'loading', connected: null, connecting: true, explicit: true };
    }
    if (offlineStates.includes(status) || connectedFlag === false) {
      return { label: 'Offline', state: 'error', connected: false, explicit: true };
    }
    if (json?.ok === true && !status) {
      return { label: 'Online', state: 'ok', connected: true, explicit: true };
    }
    if (status) {
      return {
        label: String(rawStatus).replace(/^./, letter => letter.toUpperCase()),
        state: 'idle',
        connected: null,
        explicit: true
      };
    }
    return { label: 'Verificando...', state: 'loading', connected: null, explicit: false };
  }

  function dispatchStatus(detail) {
    setStatus(detail.label, detail.state);
    window.dispatchEvent(new CustomEvent('achoulevou:bot-status', { detail }));
  }

  function dispatchOverview(detail) {
    window.dispatchEvent(new CustomEvent('achoulevou:bot-overview', { detail }));
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        signal: controller.signal
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { response, json, text };
    } finally {
      clearTimeout(timer);
    }
  }

  async function readBotPath(pathname) {
    const config = loadConfig();
    const separator = pathname.includes('?') ? '&' : '?';
    const url = `${config.botUrl}${pathname}${separator}t=${Date.now()}`;
    const { response, json, text } = await fetchJsonWithTimeout(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      mode: 'cors'
    }, 10000);

    if (!response.ok || !json) {
      throw new Error(json?.error || `HTTP ${response.status}: ${text.slice(0, 120)}`);
    }
    return json;
  }

  async function getOverview(options = {}) {
    const force = options.force === true;
    const freshEnough = lastOverview && Date.now() - lastOverviewAt < 2500;
    if (!force && freshEnough) return lastOverview;
    if (overviewRequest) return overviewRequest;

    overviewRequest = (async () => {
      const profile = activeProfile();
      const [statusResult, queueResult] = await Promise.allSettled([
        readBotPath('/status'),
        readBotPath('/queue')
      ]);

      const statusOk = statusResult.status === 'fulfilled';
      const queueOk = queueResult.status === 'fulfilled';
      const overview = {
        ok: statusOk || queueOk,
        apiOnline: statusOk || queueOk,
        statusOk,
        queueOk,
        status: statusOk ? statusResult.value : null,
        queue: queueOk ? (queueResult.value?.queue || queueResult.value) : null,
        profile: { id: profile.id, label: profile.label, botUrl: profile.botUrl },
        errors: {
          status: statusOk ? null : String(statusResult.reason?.message || statusResult.reason || 'Falha no status.'),
          queue: queueOk ? null : String(queueResult.reason?.message || queueResult.reason || 'Falha na fila.')
        },
        checkedAt: new Date().toISOString()
      };

      lastOverview = overview;
      lastOverviewAt = Date.now();
      dispatchOverview(overview);

      if (statusOk) {
        const interpreted = interpretBotStatus(overview.status);
        dispatchStatus({ ...interpreted, raw: overview.status, overview, profile: overview.profile });
      } else {
        dispatchStatus({
          label: `${profile.label}: sem leitura`,
          state: 'warning',
          connected: null,
          unavailable: true,
          error: true,
          overview,
          profile: overview.profile
        });
      }

      return overview;
    })().finally(() => {
      overviewRequest = null;
    });

    return overviewRequest;
  }

  async function checkBotStatus() {
    const overview = await getOverview({ force: true });
    if (overview?.statusOk && overview.status) return interpretBotStatus(overview.status);
    return {
      label: `${activeProfile().label}: sem leitura`,
      state: 'warning',
      connected: null,
      unavailable: true,
      error: true
    };
  }

  function getCleanMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.map(message => String(message || '').trim()).filter(Boolean);
  }

  async function sendMessages(messages) {
    const config = loadConfig();
    const cleanMessages = getCleanMessages(messages);
    if (!cleanMessages.length) throw new Error('Nenhuma mensagem para enviar.');

    setStatus(`Enviando para ${config.profileLabel}`, 'loading');

    try {
      const { response, json, text } = await fetchJsonWithTimeout(`${config.botUrl}/queue/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ text: cleanMessages.join('\n---\n') }),
        credentials: 'omit',
        mode: 'cors'
      }, 25000);

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || `Falha ao enviar. HTTP ${response.status}: ${text.slice(0, 120)}`);
      }

      setStatus(`Fila da ${config.profileLabel} atualizada`, 'ok');
      setTimeout(() => getOverview({ force: true }), 1000);
      return json;
    } catch (error) {
      setStatus(`Falha no envio para ${config.profileLabel}`, 'error');
      if (error?.name === 'AbortError') {
        throw new Error('O envio demorou mais de 25 segundos. Tente novamente.');
      }
      throw error;
    }
  }

  function openPanel() {
    const config = loadConfig();
    window.open(`${config.botUrl}/painel`, '_blank');
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

    Object.values(BOT_PROFILES).forEach(profile => {
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
    window.dispatchEvent(new CustomEvent('achoulevou:bot-profile', {
      detail: activeProfile()
    }));
  }

  function startStatusPolling() {
    clearInterval(statusTimer);
    mountProfileSelector();
    getOverview({ force: true });
    statusTimer = setInterval(() => getOverview({ force: true }), 10000);
  }

  window.AchouLevouBotQueue = {
    loadConfig,
    saveConfig,
    selectProfile,
    getProfiles: () => BOT_PROFILES,
    sendMessages,
    openPanel,
    checkBotStatus,
    getOverview,
    interpretBotStatus,
    readBridgeUrl: null
  };

  document.addEventListener('DOMContentLoaded', startStatusPolling);
  window.addEventListener('focus', () => getOverview({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) getOverview({ force: true });
  });
})();