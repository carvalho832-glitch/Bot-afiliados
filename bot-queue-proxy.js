(function () {
  'use strict';

  // O painel roda no GitHub Pages, portanto location.origin aponta para um
  // servidor estático que rejeita POST com HTTP 405. A leitura e o envio
  // precisam passar sempre pela API do Achou Levou no Render.
  const BRIDGE_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const STALE_GRACE_MS = 90000;
  const RECOVERY_DELAYS_MS = [1500, 4000, 8000];

  let overviewInFlight = null;
  let lastOverview = null;
  let lastOverviewAt = 0;
  let lastGoodStatus = null;
  let lastGoodStatusAt = 0;
  let lastGoodQueue = null;
  let lastGoodQueueAt = 0;
  let consecutiveFailures = 0;
  let recoveryTimer = null;

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

  async function fetchJson(url, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      if (!response.ok || !json) {
        const detalhe = json?.detalhe ? ` ${json.detalhe}` : '';
        throw new Error(`${json?.error || `HTTP ${response.status}`} ${detalhe}`.trim());
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  function dispatchOverview(overview) {
    window.dispatchEvent(new CustomEvent('achoulevou:bot-overview', { detail: overview }));
  }

  function dispatchStatus(queueApi, overview) {
    const profile = queueApi.loadConfig?.() || { profileLabel: 'Júlio' };

    if (overview.statusOk && overview.status) {
      const interpreted = queueApi.interpretBotStatus?.(overview.status) || {
        label: 'Conectado',
        state: 'ok',
        connected: true,
        explicit: true
      };
      setStatus(interpreted.label, interpreted.state);
      window.dispatchEvent(new CustomEvent('achoulevou:bot-status', {
        detail: { ...interpreted, raw: overview.status, overview, profile }
      }));
      return;
    }

    const detail = {
      label: `${profile.profileLabel || 'Júlio'}: sem leitura`,
      state: 'warning',
      connected: null,
      unavailable: true,
      error: true,
      overview,
      profile
    };
    setStatus(detail.label, detail.state);
    window.dispatchEvent(new CustomEvent('achoulevou:bot-status', { detail }));
  }

  function hasFreshSnapshot(value, savedAt) {
    return Boolean(value) && Date.now() - savedAt <= STALE_GRACE_MS;
  }

  function preserveLastGoodData(rawOverview) {
    const sourceStatusOk = rawOverview.statusOk === true && Boolean(rawOverview.status);
    const sourceQueueOk = rawOverview.queueOk === true && Boolean(rawOverview.queue);

    if (sourceStatusOk) {
      lastGoodStatus = rawOverview.status;
      lastGoodStatusAt = Date.now();
    }
    if (sourceQueueOk) {
      lastGoodQueue = rawOverview.queue;
      lastGoodQueueAt = Date.now();
    }

    const reusedStatus = !sourceStatusOk && hasFreshSnapshot(lastGoodStatus, lastGoodStatusAt);
    const reusedQueue = !sourceQueueOk && hasFreshSnapshot(lastGoodQueue, lastGoodQueueAt);
    const status = sourceStatusOk ? rawOverview.status : reusedStatus ? lastGoodStatus : null;
    const queue = sourceQueueOk ? rawOverview.queue : reusedQueue ? lastGoodQueue : null;

    return {
      ...rawOverview,
      ok: Boolean(status || queue),
      apiOnline: rawOverview.apiOnline === true || Boolean(status || queue),
      statusOk: Boolean(status),
      queueOk: Boolean(queue),
      status,
      queue,
      stale: reusedStatus || reusedQueue,
      staleStatus: reusedStatus,
      staleQueue: reusedQueue,
      sourceStatusOk,
      sourceQueueOk
    };
  }

  function installBridge() {
    const queueApi = window.AchouLevouBotQueue;
    if (!queueApi) {
      setTimeout(installBridge, 100);
      return;
    }

    const originalSendMessages = queueApi.sendMessages?.bind(queueApi);
    const originalGetOverview = queueApi.getOverview?.bind(queueApi);
    const originalCheckBotStatus = queueApi.checkBotStatus?.bind(queueApi);

    function scheduleRecovery() {
      if (recoveryTimer) return;
      const index = Math.min(Math.max(consecutiveFailures - 1, 0), RECOVERY_DELAYS_MS.length - 1);
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        getOverview({ force: true, recovery: true });
      }, RECOVERY_DELAYS_MS[index]);
    }

    function registerResult(overview) {
      if (overview.sourceStatusOk && overview.sourceQueueOk) {
        consecutiveFailures = 0;
        if (recoveryTimer) {
          clearTimeout(recoveryTimer);
          recoveryTimer = null;
        }
        return;
      }

      consecutiveFailures += 1;
      scheduleRecovery();
    }

    function isJulioProfile() {
      const config = queueApi.loadConfig?.() || {};
      return String(config.profileId || 'julio').toLowerCase() !== 'renata';
    }

    async function getOverview(options = {}) {
      if (!isJulioProfile() && originalGetOverview) return originalGetOverview(options);

      const force = options.force === true;
      if (!force && lastOverview && Date.now() - lastOverviewAt < 2500) return lastOverview;
      if (overviewInFlight) return overviewInFlight;

      overviewInFlight = (async () => {
        try {
          const payload = await fetchJson(`${BRIDGE_BASE}/bot/overview?t=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' }
          }, 18000);

          const rawOverview = {
            ...payload,
            ok: payload.ok === true,
            apiOnline: payload.apiOnline === true,
            statusOk: payload.statusOk === true,
            queueOk: payload.queueOk === true,
            checkedAt: payload.checkedAt || new Date().toISOString()
          };
          const overview = preserveLastGoodData(rawOverview);

          lastOverview = overview;
          lastOverviewAt = Date.now();
          registerResult(overview);
          dispatchOverview(overview);
          dispatchStatus(queueApi, overview);
          return overview;
        } catch (error) {
          const message = error?.name === 'AbortError'
            ? 'Tempo esgotado na leitura do servidor.'
            : String(error?.message || error);
          const rawOverview = {
            ok: false,
            apiOnline: false,
            statusOk: false,
            queueOk: false,
            status: null,
            queue: null,
            errors: { status: message, queue: message },
            checkedAt: new Date().toISOString()
          };
          const overview = preserveLastGoodData(rawOverview);
          lastOverview = overview;
          lastOverviewAt = Date.now();
          registerResult(overview);
          dispatchOverview(overview);
          dispatchStatus(queueApi, overview);
          return overview;
        }
      })().finally(() => {
        overviewInFlight = null;
      });

      return overviewInFlight;
    }

    async function sendMessages(messages) {
      if (!isJulioProfile() && originalSendMessages) return originalSendMessages(messages);

      const clean = Array.isArray(messages)
        ? messages.map(message => String(message || '').trim()).filter(Boolean)
        : [];
      if (!clean.length) throw new Error('Nenhuma mensagem para enviar.');

      setStatus('Enviando para Júlio', 'loading');
      const body = new URLSearchParams();
      body.set('text', clean.join('\n---\n'));

      try {
        const json = await fetchJson(`${BRIDGE_BASE}/bot/queue/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            Accept: 'application/json'
          },
          body: body.toString()
        }, 30000);

        if (!json?.ok) throw new Error(json?.error || 'Falha ao adicionar ofertas.');
        setStatus('Fila da Júlio atualizada', 'ok');
        setTimeout(() => getOverview({ force: true }), 1000);
        return json;
      } catch (error) {
        setStatus('Falha no envio para Júlio', 'error');
        if (error?.name === 'AbortError') {
          throw new Error('O envio demorou mais de 30 segundos. Tente novamente.');
        }
        throw error;
      }
    }

    async function checkBotStatus() {
      if (!isJulioProfile() && originalCheckBotStatus) return originalCheckBotStatus();
      const overview = await getOverview({ force: true });
      if (overview.statusOk && overview.status) {
        return queueApi.interpretBotStatus?.(overview.status) || {
          label: 'Conectado', state: 'ok', connected: true, explicit: true
        };
      }
      return {
        label: 'Júlio: sem leitura',
        state: 'warning',
        connected: null,
        unavailable: true,
        error: true
      };
    }

    queueApi.readBridgeUrl = BRIDGE_BASE;
    queueApi.getOverview = getOverview;
    queueApi.checkBotStatus = checkBotStatus;
    queueApi.sendMessages = sendMessages;

    console.log('Ponte segura do Achou Levou ativada para leitura e envio ao robô.', BRIDGE_BASE);
  }

  installBridge();
})();
