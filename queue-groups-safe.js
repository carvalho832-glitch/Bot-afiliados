(() => {
  const CONFIG_KEY = 'achou_levou_bot_config';
  const DEFAULT_GROUPS = [
    { id: 'Achou Levou 🚀', nome: 'Achou Levou 🚀' },
    { id: 'Oferta Bruta 🔨', nome: 'Oferta Bruta 🔨' }
  ];

  const realFetch = window.fetch.bind(window);

  function normalizeBotUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function basicAuth(username, password) {
    return 'Basic ' + btoa(`${username}:${password}`);
  }

  function normalizeGroups(groups) {
    const map = new Map();

    (Array.isArray(groups) ? groups : [])
      .map(group => {
        if (typeof group === 'string') {
          const value = group.trim();
          return value ? { id: value, nome: value } : null;
        }

        const id = String(group?.id || group?.chatId || group?.value || group?.nome || group?.name || group?.title || '').trim();
        const nome = String(group?.nome || group?.name || group?.title || group?.label || id).trim();

        return id ? { id, nome: nome || id } : null;
      })
      .filter(Boolean)
      .forEach(group => {
        if (!map.has(group.id)) map.set(group.id, group);
      });

    return Array.from(map.values());
  }

  function loadConfig() {
    try {
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      const groupOptions = normalizeGroups(config.groupOptions?.length ? config.groupOptions : DEFAULT_GROUPS);
      const savedSelected = Array.isArray(config.selectedGroupIds) ? config.selectedGroupIds.map(String) : [];
      const validSelected = savedSelected.filter(id => groupOptions.some(group => group.id === id));

      return {
        ...config,
        groupOptions,
        selectedGroupIds: validSelected.length ? validSelected : groupOptions.map(group => group.id)
      };
    } catch {
      return {
        groupOptions: DEFAULT_GROUPS,
        selectedGroupIds: DEFAULT_GROUPS.map(group => group.id)
      };
    }
  }

  function saveConfigPatch(patch) {
    const current = loadConfig();
    const next = {
      ...current,
      ...patch
    };

    next.groupOptions = normalizeGroups(next.groupOptions?.length ? next.groupOptions : DEFAULT_GROUPS);
    next.selectedGroupIds = Array.isArray(next.selectedGroupIds)
      ? next.selectedGroupIds.map(String).filter(id => next.groupOptions.some(group => group.id === id))
      : [];

    if (!next.selectedGroupIds.length) {
      next.selectedGroupIds = next.groupOptions.map(group => group.id);
    }

    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function selectedGroupIds() {
    return loadConfig().selectedGroupIds || [];
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function injectStyles() {
    if (document.getElementById('queueGroupsSafeStyles')) return;

    const style = document.createElement('style');
    style.id = 'queueGroupsSafeStyles';
    style.textContent = `
      .queue-groups-safe-card{display:grid;gap:10px;margin:12px 0;padding:12px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
      .queue-groups-safe-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .queue-groups-safe-head h3{margin:0 0 4px;color:#fff;font-size:1rem}.queue-groups-safe-head p{margin:0;color:#cbd5e1;font-size:.85rem;line-height:1.35}
      .queue-groups-safe-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .queue-groups-safe-item{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:14px;background:rgba(15,23,42,.72);border:1px solid rgba(255,255,255,.12);color:#fff;font-weight:800;font-size:.88rem;cursor:pointer}.queue-groups-safe-item input{width:18px;height:18px;accent-color:#16a34a}
      #queueGroupsSafeLoad{width:auto;min-width:128px;background:linear-gradient(135deg,#0ea5e9,#2563eb)}
      #queueGroupsSafeSummary{color:#cbd5e1;font-size:.8rem;font-weight:700;line-height:1.35}
      @media(max-width:760px){.queue-groups-safe-head{flex-direction:column}.queue-groups-safe-list{grid-template-columns:1fr}#queueGroupsSafeLoad{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function updateSummary(config = loadConfig()) {
    const summary = document.getElementById('queueGroupsSafeSummary');
    if (!summary) return;

    const names = config.selectedGroupIds
      .map(id => config.groupOptions.find(group => group.id === id)?.nome || id)
      .filter(Boolean);

    summary.textContent = names.length
      ? `Selecionado(s): ${names.join(', ')}`
      : 'Nenhum grupo selecionado.';
  }

  function renderList() {
    const list = document.getElementById('queueGroupsSafeList');
    if (!list) return;

    const config = loadConfig();

    list.innerHTML = config.groupOptions.map(group => `
      <label class="queue-groups-safe-item">
        <input type="checkbox" value="${escapeHtml(group.id)}" ${config.selectedGroupIds.includes(group.id) ? 'checked' : ''}>
        <span>${escapeHtml(group.nome)}</span>
      </label>
    `).join('');

    updateSummary(config);
  }

  function injectGroupPanel() {
    if (document.getElementById('queueGroupsSafeCard')) return true;

    const botCard = document.getElementById('botQueueCard');
    const actions = document.querySelector('.bot-queue-actions');

    if (!botCard || !actions) return false;

    injectStyles();

    const panel = document.createElement('div');
    panel.id = 'queueGroupsSafeCard';
    panel.className = 'queue-groups-safe-card';
    panel.innerHTML = `
      <div class="queue-groups-safe-head">
        <div>
          <h3>📌 Grupos de destino</h3>
          <p>Marque os grupos que receberão as ofertas enviadas para a fila.</p>
        </div>
        <button id="queueGroupsSafeLoad" type="button">🔄 Buscar grupos</button>
      </div>
      <div id="queueGroupsSafeList" class="queue-groups-safe-list"></div>
      <small id="queueGroupsSafeSummary"></small>
    `;

    botCard.insertBefore(panel, actions);

    panel.addEventListener('change', event => {
      if (!event.target.matches('input[type="checkbox"]')) return;

      const selected = Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
      saveConfigPatch({ selectedGroupIds: selected });
      updateSummary();
    });

    document.getElementById('queueGroupsSafeLoad')?.addEventListener('click', fetchGroupsFromBot);

    renderList();
    return true;
  }

  async function fetchGroupsFromBot() {
    const result = document.getElementById('botQueueResult');
    const botUrl = normalizeBotUrl(document.getElementById('botQueueUrl')?.value);
    const username = String(document.getElementById('botQueueUser')?.value || '').trim();
    const password = String(document.getElementById('botQueuePass')?.value || '');

    if (!botUrl) {
      if (result) result.textContent = 'Informe a URL do bot antes de buscar os grupos.';
      return;
    }

    if (result) result.textContent = 'Buscando grupos do WhatsApp...';

    const headers = {};
    if (username && password) headers.Authorization = basicAuth(username, password);

    for (const endpoint of [`${botUrl}/grupos`, `${botUrl}/groups`]) {
      try {
        const response = await realFetch(endpoint, { headers, cache: 'no-store' });
        const json = await response.json();
        const groups = normalizeGroups(json.grupos || json.groups || json.data || json.result || []);

        if (response.ok && groups.length) {
          saveConfigPatch({
            groupOptions: groups,
            selectedGroupIds: groups.map(group => group.id)
          });
          renderList();
          if (result) result.textContent = `✅ ${groups.length} grupo(s) carregado(s). Marque quais deseja usar.`;
          return;
        }
      } catch {}
    }

    if (result) result.textContent = 'Não consegui buscar os grupos agora. Mantive os grupos cadastrados.';
  }

  function patchFetchQueueAdd() {
    if (window.__queueGroupsSafeFetchPatched) return;
    window.__queueGroupsSafeFetchPatched = true;

    window.fetch = function patchedFetch(input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init?.method || 'GET').toUpperCase();

      if (url.includes('/queue/add') && method === 'POST' && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body || '{}');
          const groups = selectedGroupIds();

          body.groups = groups;
          body.grupos = groups;
          body.targetGroups = groups;
          body.groupIds = groups;

          init = {
            ...init,
            body: JSON.stringify(body)
          };
        } catch {}
      }

      return realFetch(input, init);
    };
  }

  function start() {
    patchFetchQueueAdd();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (injectGroupPanel() || attempts >= 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
