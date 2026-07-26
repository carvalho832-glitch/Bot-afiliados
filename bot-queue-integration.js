(function () {
  const CONFIG_KEY = "achou_levou_bot_config";
  const BOT_HTTPS_URL = "https://bot.achoulevoubot.uk";

  const DEFAULT_CONFIG = {
    botUrl: BOT_HTTPS_URL,
    username: "julio",
    password: "AchouLevou2026"
  };

  let statusRequest = null;
  let statusTimer = null;

  function normalizeBotUrl(url) {
    let cleanUrl = String(url || "").trim().replace(/\/+$/, "");

    if (
      !cleanUrl ||
      cleanUrl.includes("35.253.196.37") ||
      cleanUrl.includes("localhost") ||
      cleanUrl.includes("127.0.0.1") ||
      cleanUrl.startsWith("http://")
    ) {
      return BOT_HTTPS_URL;
    }

    return cleanUrl;
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
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
      const fallback = {
        ...DEFAULT_CONFIG,
        botUrl: normalizeBotUrl(DEFAULT_CONFIG.botUrl)
      };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(fallback));
      return fallback;
    }
  }

  function saveConfig(config) {
    const clean = {
      ...loadConfig(),
      ...config,
      botUrl: normalizeBotUrl(config?.botUrl || loadConfig().botUrl)
    };

    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
    return clean;
  }

  function basicAuthHeader(username, password) {
    return "Basic " + btoa(`${username}:${password}`);
  }

  function setStatus(message, state = "idle") {
    const pill = document.getElementById("bot-status-pill");
    const text = document.getElementById("bot-status-text");

    if (pill) {
      pill.textContent = message;
      pill.dataset.state = state;
      pill.title = `Última verificação: ${new Date().toLocaleTimeString("pt-BR")}`;
    }

    if (text) {
      text.textContent = message;
    }
  }

  function normalizeStatusValue(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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
      "connected",
      "isConnected",
      "ready",
      "isReady",
      "authenticated",
      "isAuthenticated",
      "loggedIn",
      "hasSession"
    ]);

    if (connectedFlag === true) {
      return { label: "Conectado", state: "ok" };
    }

    const rawStatus = source.status ?? source.state ?? source.connection ?? source.connectionState ?? source.sessionStatus ?? source.whatsappStatus;
    const status = normalizeStatusValue(rawStatus);

    const onlineStates = [
      "conectado",
      "connected",
      "online",
      "ready",
      "authenticated",
      "autenticado",
      "open",
      "opened",
      "logado",
      "active",
      "ativo"
    ];

    const connectingStates = [
      "conectando",
      "connecting",
      "initializing",
      "iniciando",
      "loading",
      "aguardando qr",
      "qr",
      "qr code"
    ];

    const offlineStates = [
      "offline",
      "disconnected",
      "desconectado",
      "closed",
      "close",
      "logout",
      "logged out",
      "sem sessao",
      "no session"
    ];

    if (onlineStates.includes(status)) return { label: "Conectado", state: "ok" };
    if (connectingStates.includes(status)) return { label: "Conectando...", state: "loading" };
    if (offlineStates.includes(status) || connectedFlag === false) return { label: "Offline", state: "error" };

    if (json?.ok === true && !status) {
      return { label: "Online", state: "ok" };
    }

    if (status) {
      return {
        label: String(rawStatus).replace(/^./, letra => letra.toUpperCase()),
        state: "idle"
      };
    }

    return { label: "Verificando...", state: "loading" };
  }

  function getCleanMessages(messages) {
    if (!Array.isArray(messages)) return [];

    return messages
      .map(message => String(message || "").trim())
      .filter(Boolean);
  }

  function formatFetchError(error, config) {
    const msg = String(error?.message || error || "");

    if (msg.includes("Failed to fetch") || error instanceof TypeError) {
      return `Falha de conexão com o robô. Confirme se o painel abre em ${config.botUrl}/painel e se o robô está online.`;
    }

    return msg || "Erro desconhecido ao conectar com o robô.";
  }

  async function sendMessages(messages) {
    const config = loadConfig();
    const cleanMessages = getCleanMessages(messages);

    if (!config.botUrl) throw new Error("URL do bot não configurada.");
    if (!config.username || !config.password) throw new Error("Usuário e senha do bot não configurados.");
    if (!cleanMessages.length) throw new Error("Nenhuma mensagem para enviar.");

    setStatus("Enviando", "loading");
    const text = cleanMessages.join("\n---\n");

    let response;
    try {
      response = await fetch(`${config.botUrl}/queue/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": basicAuthHeader(config.username, config.password)
        },
        body: JSON.stringify({ text }),
        cache: "no-store"
      });
    } catch (error) {
      setStatus("Offline", "error");
      throw new Error(formatFetchError(error, config));
    }

    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.ok) {
      setStatus("Erro", "error");
      throw new Error(json?.error || "Erro ao enviar mensagens para a fila.");
    }

    setStatus("Fila atualizada", "ok");
    setTimeout(checkBotStatus, 1200);
    return json;
  }

  function openPanel() {
    const config = loadConfig();

    if (!config.botUrl) {
      alert("URL do bot não configurada.");
      return;
    }

    window.open(`${config.botUrl}/painel`, "_blank");
  }

  async function checkBotStatus() {
    const config = loadConfig();

    if (!config.botUrl || !config.username || !config.password) {
      setStatus("Configurar", "warning");
      return;
    }

    statusRequest?.abort();
    statusRequest = new AbortController();
    const timeout = setTimeout(() => statusRequest.abort(), 8000);

    try {
      const response = await fetch(`${config.botUrl}/status?t=${Date.now()}`, {
        headers: {
          "Authorization": basicAuthHeader(config.username, config.password),
          "Accept": "application/json"
        },
        cache: "no-store",
        signal: statusRequest.signal
      });

      const json = await response.json().catch(() => null);

      if (!response.ok || !json) {
        throw new Error(`Status HTTP ${response.status}`);
      }

      const interpreted = interpretBotStatus(json);
      setStatus(interpreted.label, interpreted.state);
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.warn("Falha ao consultar status do robô:", error);
      }
      setStatus("Offline", "error");
    } finally {
      clearTimeout(timeout);
    }
  }

  function startStatusPolling() {
    clearInterval(statusTimer);
    checkBotStatus();
    statusTimer = setInterval(checkBotStatus, 10000);
  }

  window.AchouLevouBotQueue = {
    loadConfig,
    saveConfig,
    sendMessages,
    openPanel,
    checkBotStatus
  };

  document.addEventListener("DOMContentLoaded", startStatusPolling);
  window.addEventListener("focus", checkBotStatus);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkBotStatus();
  });
})();