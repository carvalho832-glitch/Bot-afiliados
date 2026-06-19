(function () {
  const STORAGE_OFERTAS = "ofertas_achou_levou";
  const STORAGE_TARGETS = "achou_levou_targets_atual";
  const STATUS_LOADING = "Carregando grupos...";

  let gruposWhatsApp = [];
  let gruposAutorizados = [];
  let carregou = false;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function normalizarGrupo(grupo) {
    if (!grupo) return null;

    if (typeof grupo === "string") {
      const value = grupo.trim();
      return value ? { id: value, name: value } : null;
    }

    const id = String(grupo.id || grupo.chatId || grupo.value || grupo._serialized || "").trim();
    const name = String(grupo.name || grupo.nome || grupo.title || grupo.label || id).trim();

    if (!id) return null;

    return { id, name: name || id };
  }

  function gruposUnicos(lista) {
    const map = new Map();

    (Array.isArray(lista) ? lista : []).forEach(grupo => {
      const normalizado = normalizarGrupo(grupo);
      if (normalizado && !map.has(normalizado.id)) {
        map.set(normalizado.id, normalizado);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function basicAuthHeader(username, password) {
    return "Basic " + btoa(`${username}:${password}`);
  }

  function configBot() {
    return window.AchouLevouBotQueue?.loadConfig?.() || null;
  }

  async function fetchBot(path, options = {}) {
    const config = configBot();

    if (!config?.botUrl) {
      throw new Error("URL do bot não configurada.");
    }

    const headers = {
      ...(options.headers || {})
    };

    if (config.username && config.password) {
      headers.Authorization = basicAuthHeader(config.username, config.password);
    }

    const response = await fetch(`${config.botUrl}${path}`, {
      ...options,
      headers,
      cache: "no-store"
    });

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok || (json && json.ok === false)) {
      throw new Error(json?.error || `Erro ao acessar ${path}`);
    }

    return json;
  }

  function setStatus(message, state = "idle") {
    const pill = document.getElementById("bot-status-pill");
    const text = document.getElementById("bot-status-text");

    if (pill) {
      pill.textContent = message;
      pill.dataset.state = state;
    }

    if (text) text.textContent = message;
  }

  function getMensagemAtual() {
    const box = document.getElementById("msg-preview");
    const texto = (box?.innerText || "").trim();

    if (!texto || texto === "Aguardando geração...") return "";
    return texto;
  }

  function getCleanMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .map(message => String(message || "").trim())
      .filter(Boolean);
  }

  function getSelectedGroups() {
    return Array.from(document.querySelectorAll(".target-group-check:checked"))
      .map(input => ({
        id: input.value,
        name: input.dataset.name || input.value
      }));
  }

  function saveSelectedTargets() {
    const selected = getSelectedGroups();
    localStorage.setItem(STORAGE_TARGETS, JSON.stringify(selected));
    atualizarResumoDestino();
    return selected;
  }

  function loadSelectedTargets() {
    try {
      return gruposUnicos(JSON.parse(localStorage.getItem(STORAGE_TARGETS) || "[]"));
    } catch {
      return [];
    }
  }

  function idsAutorizados() {
    return new Set(gruposAutorizados.map(grupo => String(grupo.id)));
  }

  function idsSalvos() {
    return new Set(loadSelectedTargets().map(grupo => String(grupo.id)));
  }

  function criarCardDestino() {
    if (document.getElementById("target-groups-card")) return;

    const preview = document.getElementById("msg-preview");
    if (!preview) return;

    const card = document.createElement("div");
    card.id = "target-groups-card";
    card.className = "target-groups-card";
    card.innerHTML = `
      <div class="target-groups-head">
        <div>
          <strong>🎯 Enviar esta oferta para</strong>
          <small>Escolha os grupos antes de salvar ou enviar ao robô.</small>
        </div>
      </div>
      <div class="target-groups-actions">
        <button type="button" id="target-marcar-todos" class="btn-secondary">✅ Todos</button>
        <button type="button" id="target-usar-autorizados" class="btn-secondary">🎯 Autorizados</button>
        <button type="button" id="target-limpar" class="btn-secondary danger-soft">🧹 Limpar</button>
      </div>
      <div id="target-groups-list" class="target-groups-list">${STATUS_LOADING}</div>
      <small id="target-groups-summary" class="target-groups-summary">Carregando destinos...</small>
    `;

    preview.insertAdjacentElement("afterend", card);

    document.getElementById("target-marcar-todos")?.addEventListener("click", () => {
      document.querySelectorAll(".target-group-check").forEach(input => { input.checked = true; });
      saveSelectedTargets();
    });

    document.getElementById("target-usar-autorizados")?.addEventListener("click", marcarAutorizados);

    document.getElementById("target-limpar")?.addEventListener("click", () => {
      document.querySelectorAll(".target-group-check").forEach(input => { input.checked = false; });
      saveSelectedTargets();
    });
  }

  function renderizarGrupos() {
    criarCardDestino();

    const lista = document.getElementById("target-groups-list");
    if (!lista) return;

    if (!gruposWhatsApp.length) {
      lista.textContent = "Nenhum grupo carregado. Abra o painel do WhatsApp e confirme a conexão.";
      atualizarResumoDestino();
      return;
    }

    const autorizados = idsAutorizados();
    const salvos = idsSalvos();
    const usarSalvos = salvos.size > 0;

    lista.innerHTML = gruposWhatsApp.map(grupo => {
      const checked = usarSalvos ? salvos.has(String(grupo.id)) : autorizados.has(String(grupo.id));

      return `
        <label class="target-group-option">
          <input type="checkbox" class="target-group-check" value="${escapeHtml(grupo.id)}" data-name="${escapeHtml(grupo.name)}" ${checked ? "checked" : ""}>
          <span>${escapeHtml(grupo.name)}</span>
        </label>
      `;
    }).join("");

    document.querySelectorAll(".target-group-check").forEach(input => {
      input.addEventListener("change", saveSelectedTargets);
    });

    saveSelectedTargets();
  }

  function atualizarResumoDestino() {
    const summary = document.getElementById("target-groups-summary");
    if (!summary) return;

    const grupos = getSelectedGroups();

    if (!grupos.length) {
      summary.textContent = "Nenhum grupo selecionado para esta oferta.";
      return;
    }

    summary.textContent = `Destino: ${grupos.length} grupo(s) selecionado(s).`;
  }

  function marcarAutorizados() {
    const autorizados = idsAutorizados();

    document.querySelectorAll(".target-group-check").forEach(input => {
      input.checked = autorizados.has(String(input.value));
    });

    saveSelectedTargets();
  }

  async function carregarGrupos() {
    criarCardDestino();

    try {
      const settings = await fetchBot("/settings");
      gruposAutorizados = gruposUnicos(settings?.settings?.selectedGroups || []);
    } catch {
      gruposAutorizados = [];
    }

    try {
      const groups = await fetchBot("/groups");
      gruposWhatsApp = gruposUnicos(groups?.groups || []);
    } catch {
      gruposWhatsApp = gruposAutorizados;
    }

    carregou = true;
    renderizarGrupos();
  }

  function lerOfertasSalvasRaw() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_OFERTAS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function escreverOfertasSalvasRaw(lista) {
    localStorage.setItem(STORAGE_OFERTAS, JSON.stringify(lista));
    window.dispatchEvent(new CustomEvent("achoulevou:ofertas-atualizadas", {
      detail: { total: lista.length }
    }));
  }

  function salvarDestinoNaUltimaOferta() {
    const textoAtual = getMensagemAtual();
    const selectedGroups = getSelectedGroups();

    if (!textoAtual || !selectedGroups.length) return;

    setTimeout(() => {
      const ofertas = lerOfertasSalvasRaw();
      const index = ofertas.findIndex(oferta => String(oferta?.texto || oferta || "").trim() === textoAtual);

      if (index < 0) return;

      const oferta = typeof ofertas[index] === "string"
        ? { id: Date.now(), texto: ofertas[index], criadoEm: new Date().toISOString() }
        : { ...ofertas[index] };

      oferta.selectedGroups = selectedGroups;
      oferta.destinoResumo = selectedGroups.map(grupo => grupo.name).join(", ");
      ofertas[index] = oferta;

      escreverOfertasSalvasRaw(ofertas);
      marcarCardsComDestino();
    }, 150);
  }

  function gruposParaOfertaSalva(oferta) {
    const grupos = gruposUnicos(oferta?.selectedGroups || oferta?.targets || []);
    return grupos.length ? grupos : getSelectedGroups();
  }

  function marcarCardsComDestino() {
    const ofertas = lerOfertasSalvasRaw();
    const cards = Array.from(document.querySelectorAll(".saved-card"));

    cards.forEach((card, index) => {
      const oferta = ofertas[index];
      const grupos = gruposUnicos(oferta?.selectedGroups || []);
      let badge = card.querySelector(".saved-target-badge");

      if (!grupos.length) {
        if (badge) badge.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement("small");
        badge.className = "saved-target-badge";
        const topo = card.querySelector(".saved-card-top div");
        if (topo) topo.appendChild(badge);
      }

      badge.textContent = `🎯 ${grupos.length} grupo(s)`;
      badge.title = grupos.map(grupo => grupo.name).join(", ");
    });
  }

  async function enviarLotesAgrupados(ofertas, botao, textoOriginal) {
    if (!ofertas.length) {
      alert("Não tem ofertas salvas para enviar.");
      return;
    }

    const lotes = new Map();

    ofertas.forEach(oferta => {
      const texto = String(oferta?.texto || oferta || "").trim();
      if (!texto) return;

      const selectedGroups = gruposParaOfertaSalva(oferta);
      const key = JSON.stringify(selectedGroups.map(grupo => grupo.id).sort());

      if (!lotes.has(key)) {
        lotes.set(key, { selectedGroups, messages: [] });
      }

      lotes.get(key).messages.push(texto);
    });

    if (!lotes.size) {
      alert("Nenhuma oferta válida para enviar.");
      return;
    }

    if (botao) {
      botao.disabled = true;
      botao.innerText = "Enviando...";
    }

    try {
      let total = 0;

      for (const lote of lotes.values()) {
        const json = await sendMessagesToBot(lote.messages, lote.selectedGroups);
        total += json?.added ?? lote.messages.length;
      }

      if (botao) {
        botao.innerText = `✅ Enviado (${total})`;
        setTimeout(() => { botao.innerText = textoOriginal; }, 1800);
      }

      alert(`Oferta(s) enviada(s) para a fila do robô: ${total}`);
    } catch (error) {
      alert(`Erro ao enviar para o robô: ${error.message}`);
      if (botao) botao.innerText = textoOriginal;
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  async function sendMessagesToBot(messages, selectedGroups = getSelectedGroups()) {
    const cleanMessages = getCleanMessages(messages);

    if (!cleanMessages.length) {
      throw new Error("Nenhuma mensagem para enviar.");
    }

    if (!selectedGroups.length) {
      throw new Error("Selecione pelo menos um grupo de destino.");
    }

    setStatus("Enviando", "loading");

    const json = await fetchBot("/queue/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: cleanMessages.join("\n---\n"),
        selectedGroups
      })
    });

    setStatus("Fila atualizada", "ok");
    setTimeout(() => window.AchouLevouBotQueue?.checkBotStatus?.(), 1200);

    return json;
  }

  function substituirEnvioDoRobo() {
    if (!window.AchouLevouBotQueue) return;

    window.AchouLevouBotQueue.sendMessages = function (messages, options = {}) {
      return sendMessagesToBot(messages, gruposUnicos(options.selectedGroups || getSelectedGroups()));
    };
  }

  function interceptarSalvarNaFila() {
    const btnSalvar = document.getElementById("btn-salvar");
    if (!btnSalvar) return;

    btnSalvar.addEventListener("click", salvarDestinoNaUltimaOferta);
  }

  function interceptarEnviarTodas() {
    const btn = document.getElementById("btn-enviar-todas-robo");
    if (!btn) return;

    btn.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const ofertas = lerOfertasSalvasRaw();
      const total = ofertas.filter(oferta => String(oferta?.texto || oferta || "").trim()).length;

      if (!total) {
        alert("Não tem ofertas salvas para enviar.");
        return;
      }

      if (!confirm(`Enviar ${total} oferta(s) para o robô respeitando os destinos escolhidos?`)) return;

      enviarLotesAgrupados(ofertas, btn, "🚀 Enviar todas ao robô");
    }, true);
  }

  function observarCardsSalvos() {
    const alvo = document.getElementById("lista-salvas");
    if (!alvo) return;

    const observer = new MutationObserver(() => marcarCardsComDestino());
    observer.observe(alvo, { childList: true, subtree: true });
    marcarCardsComDestino();
  }

  async function iniciar() {
    criarCardDestino();
    substituirEnvioDoRobo();
    interceptarSalvarNaFila();
    interceptarEnviarTodas();
    observarCardsSalvos();

    await carregarGrupos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
