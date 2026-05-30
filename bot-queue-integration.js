(function () {
  const STORAGE_KEY = "ofertas_achou_levou";
  const CONFIG_KEY = "achou_levou_bot_config";

  const DEFAULT_CONFIG = {
    botUrl: "http://35.253.196.37:3010",
    username: "julio",
    password: "AchouLevou2026"
  };

  function loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      return {
        ...DEFAULT_CONFIG,
        ...saved
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  function saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function loadSavedOffers() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

      if (Array.isArray(raw)) {
        return raw;
      }

      if (raw && typeof raw === "object") {
        return Object.values(raw);
      }

      return [];
    } catch {
      return [];
    }
  }

  function getOfferId(offer, index) {
    return String(
      offer?.id ||
      offer?.codigo ||
      offer?.createdAt ||
      offer?.data ||
      `oferta-${index}`
    );
  }

  function getOfferText(offer) {
    return String(
      offer?.texto ||
      offer?.mensagem ||
      offer?.message ||
      offer?.msg ||
      offer?.conteudo ||
      offer?.descricao ||
      offer?.text ||
      ""
    ).trim();
  }

  function getOfferTitle(text, index) {
    const firstLine = text.split("\n").find(line => line.trim()) || "";
    return firstLine.trim().slice(0, 80) || `Mensagem salva ${index + 1}`;
  }

  function basicAuthHeader(username, password) {
    return "Basic " + btoa(`${username}:${password}`);
  }

  function normalizeBotUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function createPanelHtml() {
    return `
      <section id="botQueueCard" class="bot-queue-card">
        <div class="bot-queue-header">
          <div>
            <h2>🤖 Bot WhatsApp</h2>
            <p>Envie mensagens salvas para a fila automática do bot.</p>
          </div>
          <span id="botQueueStatus" class="bot-queue-pill">Aguardando</span>
        </div>

        <div class="bot-queue-config">
          <label>
            URL do bot
            <input id="botQueueUrl" type="text" placeholder="http://IP:3010">
          </label>

          <div class="bot-queue-grid">
            <label>
              Usuário
              <input id="botQueueUser" type="text" placeholder="julio">
            </label>

            <label>
              Senha
              <input id="botQueuePass" type="password" placeholder="Senha do painel">
            </label>
          </div>

          <button id="botQueueSaveConfig" type="button">💾 Salvar configuração</button>
        </div>

        <div class="bot-queue-actions">
          <button id="botQueueRefresh" type="button">🔄 Atualizar mensagens</button>
          <button id="botQueueSelectAll" type="button">✅ Selecionar todas</button>
          <button id="botQueueSendSelected" type="button">🚀 Enviar selecionadas para fila</button>
          <button id="botQueueSendAll" type="button">📦 Enviar todas para fila</button>
          <button id="botQueueOpenPanel" type="button">🧭 Abrir painel do bot</button>
        </div>

        <div id="botQueueResult" class="bot-queue-result">
          Carregando mensagens salvas...
        </div>

        <div id="botQueueList" class="bot-queue-list"></div>
      </section>
    `;
  }

  function injectStyles() {
    if (document.getElementById("botQueueStyles")) return;

    const style = document.createElement("style");
    style.id = "botQueueStyles";

    style.textContent = `
      .bot-queue-card {
        width: 100%;
        max-width: 980px;
        margin: 18px auto;
        padding: 18px;
        border-radius: 22px;
        background: linear-gradient(135deg, #111827, #1f2937);
        color: #ffffff;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-sizing: border-box;
      }

      .bot-queue-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 14px;
      }

      .bot-queue-header h2 {
        margin: 0 0 4px;
        font-size: 1.35rem;
      }

      .bot-queue-header p {
        margin: 0;
        color: #cbd5e1;
        font-size: 0.95rem;
      }

      .bot-queue-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        color: #e5e7eb;
        font-size: 0.82rem;
        font-weight: 800;
        white-space: nowrap;
      }

      .bot-queue-config {
        display: grid;
        gap: 10px;
        margin: 14px 0;
      }

      .bot-queue-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .bot-queue-config label {
        display: grid;
        gap: 6px;
        color: #d1d5db;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .bot-queue-config input {
        width: 100%;
        padding: 12px 13px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(15, 23, 42, 0.95);
        color: #ffffff;
        outline: none;
        box-sizing: border-box;
      }

      .bot-queue-actions {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
        margin: 12px 0;
      }

      .bot-queue-card button {
        border: 0;
        border-radius: 14px;
        padding: 12px 10px;
        color: #ffffff;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        font-weight: 900;
        cursor: pointer;
      }

      #botQueueSendSelected,
      #botQueueSendAll {
        background: linear-gradient(135deg, #16a34a, #10b981);
      }

      #botQueueOpenPanel {
        background: linear-gradient(135deg, #f97316, #dc2626);
      }

      #botQueueSaveConfig {
        background: linear-gradient(135deg, #475569, #334155);
      }

      .bot-queue-result {
        white-space: pre-wrap;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e5e7eb;
        padding: 12px;
        border-radius: 14px;
        margin: 12px 0;
        line-height: 1.45;
        min-height: 42px;
      }

      .bot-queue-list {
        display: grid;
        gap: 10px;
      }

      .bot-queue-item {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
        align-items: flex-start;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 16px;
        padding: 12px;
      }

      .bot-queue-item input {
        margin-top: 4px;
        transform: scale(1.2);
      }

      .bot-queue-item-title {
        font-weight: 900;
        color: #ffffff;
        margin-bottom: 5px;
      }

      .bot-queue-item-text {
        color: #cbd5e1;
        font-size: 0.9rem;
        line-height: 1.4;
        max-height: 76px;
        overflow: hidden;
        white-space: pre-wrap;
      }

      @media (max-width: 760px) {
        .bot-queue-header {
          flex-direction: column;
        }

        .bot-queue-grid {
          grid-template-columns: 1fr;
        }

        .bot-queue-actions {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function findBestMountPoint() {
    const possibleTitles = [
      "mensagens salvas",
      "ofertas salvas",
      "salvas",
      "histórico",
      "historico"
    ];

    const allElements = Array.from(document.querySelectorAll("h1, h2, h3, section, div"));

    const found = allElements.find(element => {
      const text = (element.textContent || "").toLowerCase();
      return possibleTitles.some(title => text.includes(title));
    });

    if (found && found.parentElement) {
      return found.parentElement;
    }

    return document.body;
  }

  function injectPanel() {
    if (document.getElementById("botQueueCard")) return;

    injectStyles();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = createPanelHtml();

    const mount = findBestMountPoint();
    mount.insertBefore(wrapper.firstElementChild, mount.firstChild);

    bindEvents();
    fillConfigFields();
    renderOffers();
    checkBotStatus();
  }

  function fillConfigFields() {
    const config = loadConfig();

    document.getElementById("botQueueUrl").value = config.botUrl || "";
    document.getElementById("botQueueUser").value = config.username || "";
    document.getElementById("botQueuePass").value = config.password || "";
  }

  function readConfigFromFields() {
    return {
      botUrl: normalizeBotUrl(document.getElementById("botQueueUrl").value),
      username: document.getElementById("botQueueUser").value.trim(),
      password: document.getElementById("botQueuePass").value
    };
  }

  function setResult(message) {
    const result = document.getElementById("botQueueResult");
    if (result) result.textContent = message;
  }

  function setStatus(message) {
    const status = document.getElementById("botQueueStatus");
    if (status) status.textContent = message;
  }

  function renderOffers() {
    const list = document.getElementById("botQueueList");
    const offers = loadSavedOffers();

    if (!list) return;

    list.innerHTML = "";

    const validOffers = offers
      .map((offer, index) => ({
        id: getOfferId(offer, index),
        text: getOfferText(offer),
        index
      }))
      .filter(item => item.text);

    if (!validOffers.length) {
      setResult("Nenhuma mensagem salva encontrada ainda.");
      return;
    }

    setResult(`Mensagens salvas encontradas: ${validOffers.length}`);

    validOffers.forEach(item => {
      const label = document.createElement("label");
      label.className = "bot-queue-item";

      label.innerHTML = `
        <input
          type="checkbox"
          class="bot-queue-checkbox"
          data-id="${escapeHtml(item.id)}"
        >

        <div>
          <div class="bot-queue-item-title">
            ${escapeHtml(getOfferTitle(item.text, item.index))}
          </div>
          <div class="bot-queue-item-text">
            ${escapeHtml(item.text)}
          </div>
        </div>
      `;

      list.appendChild(label);
    });
  }

  function getSelectedMessages() {
    const offers = loadSavedOffers();
    const selectedIds = Array.from(document.querySelectorAll(".bot-queue-checkbox:checked"))
      .map(input => input.dataset.id);

    return offers
      .map((offer, index) => ({
        id: getOfferId(offer, index),
        text: getOfferText(offer)
      }))
      .filter(item => selectedIds.includes(item.id))
      .map(item => item.text)
      .filter(Boolean);
  }

  function getAllMessages() {
    return loadSavedOffers()
      .map(getOfferText)
      .filter(Boolean);
  }

  async function sendMessagesToQueue(messages) {
    const config = readConfigFromFields();

    if (!config.botUrl) {
      throw new Error("Informe a URL do bot.");
    }

    if (!config.username || !config.password) {
      throw new Error("Informe usuário e senha do bot.");
    }

    if (!messages.length) {
      throw new Error("Nenhuma mensagem selecionada.");
    }

    const text = messages.join("\n---\n");

    const response = await fetch(`${config.botUrl}/queue/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": basicAuthHeader(config.username, config.password)
      },
      body: JSON.stringify({ text })
    });

    let json = null;

    try {
      json = await response.json();
    } catch {
      throw new Error("Resposta inválida do bot.");
    }

    if (!response.ok || !json.ok) {
      throw new Error(json.error || "Erro ao enviar mensagens para a fila.");
    }

    return json;
  }

  async function checkBotStatus() {
    const config = loadConfig();

    if (!config.botUrl || !config.username || !config.password) {
      setStatus("Configurar");
      return;
    }

    try {
      const response = await fetch(`${normalizeBotUrl(config.botUrl)}/status`, {
        headers: {
          "Authorization": basicAuthHeader(config.username, config.password)
        }
      });

      const json = await response.json();

      if (json.status === "conectado") {
        setStatus("Conectado");
      } else {
        setStatus(json.status || "Online");
      }
    } catch {
      setStatus("Offline");
    }
  }

  function bindEvents() {
    document.getElementById("botQueueSaveConfig").addEventListener("click", () => {
      const config = readConfigFromFields();

      saveConfig(config);
      setResult("✅ Configuração do bot salva.");
      checkBotStatus();
    });

    document.getElementById("botQueueRefresh").addEventListener("click", () => {
      renderOffers();
      checkBotStatus();
    });

    document.getElementById("botQueueSelectAll").addEventListener("click", () => {
      const checkboxes = Array.from(document.querySelectorAll(".bot-queue-checkbox"));
      const shouldCheck = checkboxes.some(input => !input.checked);

      checkboxes.forEach(input => {
        input.checked = shouldCheck;
      });

      setResult(shouldCheck ? "✅ Todas selecionadas." : "Seleção limpa.");
    });

    document.getElementById("botQueueSendSelected").addEventListener("click", async () => {
      try {
        const messages = getSelectedMessages();

        setResult("Enviando mensagens selecionadas para a fila...");
        const json = await sendMessagesToQueue(messages);

        setResult(`✅ Mensagens adicionadas à fila: ${json.added}`);
        checkBotStatus();
      } catch (error) {
        setResult(`Erro: ${error.message}`);
      }
    });

    document.getElementById("botQueueSendAll").addEventListener("click", async () => {
      try {
        const messages = getAllMessages();

        if (!confirm(`Enviar ${messages.length} mensagem(ns) salvas para a fila?`)) {
          return;
        }

        setResult("Enviando todas as mensagens para a fila...");
        const json = await sendMessagesToQueue(messages);

        setResult(`✅ Mensagens adicionadas à fila: ${json.added}`);
        checkBotStatus();
      } catch (error) {
        setResult(`Erro: ${error.message}`);
      }
    });

    document.getElementById("botQueueOpenPanel").addEventListener("click", () => {
      const config = readConfigFromFields();

      if (!config.botUrl) {
        setResult("Informe a URL do bot primeiro.");
        return;
      }

      window.open(`${config.botUrl}/painel`, "_blank");
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  document.addEventListener("DOMContentLoaded", () => {
    injectPanel();

    setInterval(() => {
      const card = document.getElementById("botQueueCard");

      if (!card) {
        injectPanel();
      }
    }, 2500);
  });
})();
