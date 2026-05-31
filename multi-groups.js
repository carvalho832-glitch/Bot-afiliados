(() => {
  const OPTIONS_KEY = 'achou_levou_group_options';
  const SELECTED_KEY = 'achou_levou_selected_groups';
  const DEFAULT_GROUPS = [
    { id: 'Achou Levou 🚀', name: 'Achou Levou 🚀' },
    { id: 'Oferta Bruta 🔨', name: 'Oferta Bruta 🔨' }
  ];
  const realFetch = window.fetch.bind(window);

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function clean(value) {
    return String(value || '').trim();
  }

  function safeJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function normalizeBotUrl(url) {
    return clean(url).replace(/\/+$/, '');
  }

  function basicAuth(username, password) {
    return 'Basic ' + btoa(`${username}:${password}`);
  }

  function normalizeGroup(group) {
    if (typeof group === 'string') return { id: group, name: group };
    if (!group || typeof group !== 'object') return null;

    const id = clean(group.id || group.chatId || group.value || group._serialized || group.nome || group.name || group.title);
    const name = clean(group.nome || group.name || group.title || group.label || id);

    return id ? { id, name: name || id } : null;
  }

  function normalizeGroups(groups) {
    const map = new Map();

    (Array.isArray(groups) ? groups : [])
      .map(normalizeGroup)
      .filter(Boolean)
      .forEach(group => {
        if (!map.has(group.id)) map.set(group.id, group);
      });

    return Array.from(map.values());
  }

  function groupsFromOldSelect() {
    const select = $('#select-grupo');
    if (!select) return [];

    return Array.from(select.options || []).map(option => ({
      id: option.value || option.textContent.trim(),
      name: option.textContent.trim() || option.value
    }));
  }

  function loadGroupOptions() {
    const saved = normalizeGroups(safeJson(OPTIONS_KEY, []));
    if (saved.length) return saved;

    const fromSelect = normalizeGroups(groupsFromOldSelect());
    return fromSelect.length ? fromSelect : DEFAULT_GROUPS;
  }

  function saveGroupOptions(groups) {
    const normalized = normalizeGroups(groups);
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function loadSelectedGroups() {
    const saved = safeJson(SELECTED_KEY, []);
    if (Array.isArray(saved) && saved.length) return saved.map(clean).filter(Boolean);

    const select = $('#select-grupo');
    const selectedFromSelect = Array.from(select?.selectedOptions || [])
      .map(option => option.value || option.textContent.trim())
      .filter(Boolean);

    if (selectedFromSelect.length) return selectedFromSelect;
    return [loadGroupOptions()[0]?.id].filter(Boolean);
  }

  function saveSelectedGroups(groups) {
    const selected = [...new Set((groups || []).map(clean).filter(Boolean))];
    localStorage.setItem(SELECTED_KEY, JSON.stringify(selected));
    syncOldSelect(selected);
    updateSummaries(selected);
    return selected;
  }

  function selectedGroups() {
    const options = loadGroupOptions();
    const selected = loadSelectedGroups();
    const valid = selected.filter(id => options.some(option => option.id === id || option.name === id));
    return valid.length ? valid.map(id => options.find(option => option.id === id || option.name === id)?.id || id) : selected;
  }

  function syncOldSelect(selected) {
    const select = $('#select-grupo');
    if (!select) return;

    select.multiple = true;
    Array.from(select.options || []).forEach(option => {
      option.selected = selected.includes(option.value) || selected.includes(option.textContent.trim());
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function selectedText(selected = loadSelectedGroups()) {
    const options = loadGroupOptions();
    const names = selected
      .map(id => options.find(option => option.id === id || option.name === id)?.name || id)
      .filter(Boolean);

    return names.length ? `Selecionado(s): ${names.join(', ')}` : 'Nenhum grupo selecionado';
  }

  function updateSummaries(selected = loadSelectedGroups()) {
    $$('[data-group-summary]').forEach(el => {
      el.textContent = selectedText(selected);
    });
  }

  function renderList(containerSelector) {
    const container = $(containerSelector);
    if (!container) return;

    const options = loadGroupOptions();
    const selected = loadSelectedGroups();

    container.innerHTML = options.map(option => `
      <label class="multi-group-option">
        <input type="checkbox" value="${escapeHtml(option.id)}" ${selected.includes(option.id) || selected.includes(option.name) ? 'checked' : ''}>
        <span>${escapeHtml(option.name)}</span>
      </label>
    `).join('');

    updateSummaries(selected);
  }

  function handleListChange(containerSelector) {
    const selected = $$(`${containerSelector} input[type="checkbox"]:checked`).map(input => input.value);
    saveSelectedGroups(selected);
    renderList('#multiGroupsTopList');
    renderList('#botQueueGroupsList');
  }

  function renderTopSelector() {
    const select = $('#select-grupo');
    if (!select) return;

    select.style.display = 'none';
    select.multiple = true;

    if (!$('#multiGroupsTopBox')) {
      const box = document.createElement('div');
      box.id = 'multiGroupsTopBox';
      box.className = 'multi-groups-box';
      box.innerHTML = `
        <div id="multiGroupsTopList" class="multi-groups-list"></div>
        <small data-group-summary></small>
      `;
      select.insertAdjacentElement('afterend', box);

      $('#multiGroupsTopList')?.addEventListener('change', () => handleListChange('#multiGroupsTopList'));
    }

    renderList('#multiGroupsTopList');
  }

  function renderBotSelector() {
    const card = $('#botQueueCard');
    if (!card) return;

    if (!$('#botQueueGroupsPanel')) {
      const panel = document.createElement('div');
      panel.id = 'botQueueGroupsPanel';
      panel.className = 'bot-queue-groups-panel';
      panel.innerHTML = `
        <div class="bot-queue-groups-head">
          <div>
            <h3>📌 Grupos de destino</h3>
            <p>Marque um ou mais grupos para receber as ofertas da fila.</p>
          </div>
          <button id="botQueueLoadGroups" type="button">🔄 Buscar grupos</button>
        </div>
        <div id="botQueueGroupsList" class="multi-groups-list bot-queue-groups-list"></div>
        <small data-group-summary></small>
      `;

      const actions = $('.bot-queue-actions');
      if (actions) card.insertBefore(panel, actions);
      else card.appendChild(panel);

      $('#botQueueGroupsList')?.addEventListener('change', () => handleListChange('#botQueueGroupsList'));
      $('#botQueueLoadGroups')?.addEventListener('click', fetchGroupsFromBot);
    }

    renderList('#botQueueGroupsList');
  }

  async function fetchGroupsFromBot() {
    const url = normalizeBotUrl($('#botQueueUrl')?.value);
    const username = clean($('#botQueueUser')?.value);
    const password = $('#botQueuePass')?.value || '';
    const result = $('#botQueueResult');

    if (!url) {
      if (result) result.textContent = 'Informe a URL do bot antes de buscar os grupos.';
      return;
    }

    const headers = {};
    if (username && password) headers.Authorization = basicAuth(username, password);

    if (result) result.textContent = 'Buscando grupos do WhatsApp...';

    for (const endpoint of [`${url}/grupos`, `${url}/groups`]) {
      try {
        const response = await realFetch(endpoint, { headers });
        const json = await response.json();
        const groups = normalizeGroups(json.grupos || json.groups || json.data || json.result || []);

        if (response.ok && groups.length) {
          saveGroupOptions(groups);
          const validSelected = selectedGroups().filter(id => groups.some(group => group.id === id));
          saveSelectedGroups(validSelected.length ? validSelected : [groups[0].id]);
          renderTopSelector();
          renderBotSelector();
          if (result) result.textContent = `✅ ${groups.length} grupo(s) carregado(s). Marque os destinos desejados.`;
          return;
        }
      } catch {}
    }

    if (result) result.textContent = 'Não consegui buscar os grupos automaticamente. Mantive os grupos cadastrados no app.';
  }

  function patchQueueFetch() {
    if (window.__multiGroupsFetchPatched) return;
    window.__multiGroupsFetchPatched = true;

    window.fetch = function patchedFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init?.method || 'GET').toUpperCase();

      if (url.includes('/queue/add') && method === 'POST' && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body || '{}');
          const groups = selectedGroups();

          body.groups = groups;
          body.grupos = groups;
          body.targetGroups = groups;
          body.groupIds = groups;

          init = { ...init, body: JSON.stringify(body) };
        } catch {}
      }

      return realFetch(input, init);
    };
  }

  function injectStyles() {
    if ($('#multiGroupsStyles')) return;

    const style = document.createElement('style');
    style.id = 'multiGroupsStyles';
    style.textContent = `
      .multi-groups-box{display:grid;gap:8px;margin:8px 0 14px}.multi-groups-list{display:grid;gap:8px}.multi-group-option{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;background:var(--input-bg,rgba(255,255,255,.08));border:1px solid var(--border,rgba(255,255,255,.14));color:var(--text,#fff);font-size:14px;font-weight:800;cursor:pointer;user-select:none}.multi-group-option input{width:18px;height:18px;accent-color:#16a34a}.multi-groups-box small,.bot-queue-groups-panel small{display:block;color:var(--muted,#cbd5e1);font-size:12px;font-weight:700;line-height:1.35}.bot-queue-groups-panel{display:grid;gap:10px;margin:12px 0;padding:12px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}.bot-queue-groups-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.bot-queue-groups-head h3{margin:0 0 4px;color:#fff;font-size:1rem}.bot-queue-groups-head p{margin:0;color:#cbd5e1;font-size:.85rem;line-height:1.35}#botQueueLoadGroups{width:auto;min-width:132px;padding:10px 12px;background:linear-gradient(135deg,#0ea5e9,#2563eb);white-space:nowrap}.bot-queue-groups-list{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:760px){.bot-queue-groups-head{flex-direction:column}#botQueueLoadGroups{width:100%}.bot-queue-groups-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function start() {
    injectStyles();
    saveGroupOptions(loadGroupOptions());
    saveSelectedGroups(loadSelectedGroups());
    renderTopSelector();
    renderBotSelector();
    patchQueueFetch();

    const observer = new MutationObserver(() => {
      renderTopSelector();
      renderBotSelector();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
