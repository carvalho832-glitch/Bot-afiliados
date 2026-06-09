(function () {
  const CONFIG_KEY = "achou_levou_bot_config";
  const BOT_HTTPS_URL = "https://bot.achoulevoubot.uk";

  const DEFAULT_CONFIG = {
    botUrl: BOT_HTTPS_URL,
    username: "julio",
    password: "AchouLevou2026"
  };

  function normalizeBotUrl(url) {
    let cleanUrl = String(url || "").trim().replace(/\/+$/, "");

    // Migração automática: versões antigas usavam IP/HTTP.
    // Página HTTPS não consegue enviar fetch para HTTP por bloqueio de mixed content.
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

      // Salva a URL corrigida para limpar configurações antigas do navegador.
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
    }

    if (text) {
      text.textContent = message;
    }
  }

  function getCleanMessages(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }

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

    if (!config.botUrl) {
      throw new Error("URL do bot não configurada.");
    }

    if (!config.username || !config.password) {
      throw new Error("Usuário e senha do bot não configurados.");
    }

    if (!cleanMessages.length) {
      throw new Error("Nenhuma mensagem para enviar.");
    }

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

    let json = null;

    try {
      json = await response.json();
    } catch {
      throw new Error("Resposta inválida do bot.");
    }

    if (!response.ok || !json.ok) {
      setStatus("Erro", "error");
      throw new Error(json.error || "Erro ao enviar mensagens para a fila.");
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

    try {
      const response = await fetch(`${config.botUrl}/status`, {
        headers: {
          "Authorization": basicAuthHeader(config.username, config.password)
        },
        cache: "no-store"
      });

      const json = await response.json();
      const status = json.status || "Online";

      if (status === "conectado") {
        setStatus("Conectado", "ok");
      } else {
        setStatus(status, "idle");
      }
    } catch {
      setStatus("Offline", "error");
    }
  }

  window.AchouLevouBotQueue = {
    loadConfig,
    saveConfig,
    sendMessages,
    openPanel,
    checkBotStatus
  };

  document.addEventListener("DOMContentLoaded", () => {
    checkBotStatus();
    setInterval(checkBotStatus, 45000);
  });
})();
