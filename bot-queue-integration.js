(function () {
  const CONFIG_KEY = 'achou_levou_bot_config';
  const BOT_HTTPS_URL = 'https://bot.achoulevoubot.uk';
  const BRIDGE_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const OVERVIEW_URL = `${BRIDGE_BASE}/bot/overview`;
  const SEND_URL = `${BRIDGE_BASE}/bot/queue/add`;

  const DEFAULT_CONFIG = {
    botUrl: BOT_HTTPS_URL,
    username: 'julio',
    password: 'AchouLevou2026'
  };

  let statusTimer = null;
  let overviewRequest = null;
  let lastOverview = null;
  let lastOverviewAt = 0;

  function normalizeBotUrl(url) {
    const cleanUrl = String(url || '').trim().replace(/\/+$/, '');
    if (
      !cleanUrl ||
      cleanUrl.includes('35.253.196.37') ||
      cleanUrl.includes('localhost') ||
      cleanUrl.includes('127.0.0.1') ||
      cleanUrl.startsWith('http://')
    ) {
      return BOT_HTTPS_URL;
    }
    return cleanUrl;
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      const config = {
        ...DEFAULT_CONFIG,
        ...saved,
        botUrl: normalizeBotUrl(saved.botUrl || DEFAULT_CONFIG.botUrl)
      };
      if (saved.botUrl !== config.botUrl) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      }
      return config;
    } catch {
      const fallback = { ...DEFAULT_CONFIG, botUrl: BOT_HTTPS_URL };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(fallback));
      return fallback;
    }
  }

  function saveConfig(config) {
    const current = loadConfig();
    const clean = {
      ...current,
      ...config,
      botUrl: normalizeBotUrl(config?.botUrl || current.botUrl)
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
    return clean;
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

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        signal: controller.signal
      });
      const json = await response.json().catch(() => null);
      return { response, json };
    } finally {
      clearTimeout(timer);
    }
  }

  async function getOverview(options = {}) {
    const force = options.force === true;
    const freshEnough = lastOverview && Date.now() - lastOverviewAt < 2500;
    if (!force && freshEnough) return lastOverview;
    if (overviewRequest) return overviewRequest;

    overviewRequest = (async () => {
      try {
        const url = `${OVERVIEW_URL}?t=${Date.now()}`;
        const { response, json } = await fetchJsonWithTimeout(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit'
        }, 15000);

        if (!json) throw new Error(`A ponte respondeu sem JSON (HTTP ${response.status}).`);

        lastOverview = json;
        lastOverviewAt = Date.now();
        dispatchOverview(json);

        if (json.statusOk && json.status) {
          const interpreted = interpretBotStatus(json.status);
          dispatchStatus({ ...interpreted, raw: json.status, overview: json });
        } else {
          dispatchStatus({
            label: 'Servidor instável',
            state: 'warning',
            connected: null,
            unavailable: true,
            error: true,
            overview: json
          });
        }

        return json;
      } catch (error) {
        const unavailable = {
          ok: false,
          apiOnline: false,
          statusOk: false,
          queueOk: false,
          status: null,
          queue: null,
          unavailable: true,
          error: error?.name === 'AbortError'
            ? 'Tempo limite ao consultar o servidor.'
            : String(error?.message || error),
          checkedAt: new Date().toISOString()
        };

        dispatchOverview(unavailable);
        dispatchStatus({
          label: 'Servidor indisponível',
          state: 'warning',
          connected: null,
          unavailable: true,
          error: true,
          overview: unavailable
        });
        return unavailable;
      } finally {
        overviewRequest = null;
      }
    })();

    return overviewRequest;
  }

  async function checkBotStatus() {
    const overview = await getOverview({ force: true });
    if (overview?.statusOk && overview.status) {
      return interpretBotStatus(overview.status);
    }
    return {
      label: overview?.apiOnline ? 'Servidor instável' : 'Servidor indisponível',
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
    const cleanMessages = getCleanMessages(messages);
    if (!cleanMessages.length) throw new Error('Nenhuma mensagem para enviar.');

    setStatus('Enviando', 'loading');
    try {
      const { response, json } = await fetchJsonWithTimeout(SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ text: cleanMessages.join('\n---\n') }),
        credentials: 'omit'
      }, 25000);

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || json?.detalhe || `Falha ao enviar. HTTP ${response.status}`);
      }

      setStatus('Fila atualizada', 'ok');
      setTimeout(() => getOverview({ force: true }), 1200);
      return json;
    } catch (error) {
      setStatus('Falha no envio', 'error');
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

  function startStatusPolling() {
    clearInterval(statusTimer);
    getOverview({ force: true });
    statusTimer = setInterval(() => getOverview({ force: true }), 10000);
  }

  window.AchouLevouBotQueue = {
    loadConfig,
    saveConfig,
    sendMessages,
    openPanel,
    checkBotStatus,
    getOverview,
    interpretBotStatus,
    readBridgeUrl: BRIDGE_BASE
  };

  document.addEventListener('DOMContentLoaded', startStatusPolling);
  window.addEventListener('focus', () => getOverview({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) getOverview({ force: true });
  });
})();