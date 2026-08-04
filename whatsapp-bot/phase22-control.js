(() => {
  'use strict';

  const VERSION = '22.0.0';
  const PRESET_JULIO = Object.freeze({
    windowStart: '07:30',
    windowEnd: '21:30',
    intervalMinutes: 60,
    offersPerBatch: 1,
    dailyLimit: 15
  });

  const state = {
    preparedSignature: sessionStorage.getItem('phase22_prepared_signature') || '',
    confirmationUntil: 0,
    confirmationTimer: null,
    lastLive: null
  };

  const byId = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function injectStyles() {
    if (byId('phase22-style')) return;
    const style = document.createElement('style');
    style.id = 'phase22-style';
    style.textContent = `
      #phase22-card{border-color:rgba(45,212,191,.35);background:linear-gradient(145deg,rgba(8,47,73,.72),rgba(15,22,35,.97))}
      .phase22-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
      .phase22-version{font-size:12px;padding:6px 9px;border-radius:999px;background:rgba(45,212,191,.12);color:#5eead4;border:1px solid rgba(45,212,191,.25);white-space:nowrap}
      .phase22-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:14px 0}
      .phase22-step{padding:12px;border:1px solid var(--line);border-radius:15px;background:#09101b;color:var(--muted);line-height:1.45}
      .phase22-step strong{display:block;color:var(--text);margin-bottom:3px}
      .phase22-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .phase22-actions button{margin-top:0}
      #phase22-start[data-confirming="true"]{background:linear-gradient(135deg,#dc2626,#f97316);box-shadow:0 10px 28px rgba(249,115,22,.24)}
      #phase22-summary{min-height:150px}
      .phase22-note{margin:12px 0 0;padding:11px 13px;border-radius:13px;background:rgba(15,118,110,.1);border:1px solid rgba(45,212,191,.18);color:#b9f7ee;line-height:1.5}
      @media(max-width:700px){.phase22-steps,.phase22-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function mountCard() {
    if (byId('phase22-card')) return;
    const card = document.createElement('section');
    card.id = 'phase22-card';
    card.className = 'card';
    card.innerHTML = `
      <div class="phase22-head">
        <div>
          <h2>🧭 Preparar envio do perfil Júlio</h2>
          <p class="muted">Configure, confira e só depois libere a fila. Nenhuma mensagem é enviada durante a preparação.</p>
        </div>
        <span class="phase22-version">Fase ${VERSION}</span>
      </div>
      <div class="phase22-steps">
        <div class="phase22-step"><strong>1. Preencher</strong>Usa os parâmetros do perfil Júlio sem alterar os grupos.</div>
        <div class="phase22-step"><strong>2. Preparar</strong>Salva a configuração e mantém a fila pausada.</div>
        <div class="phase22-step"><strong>3. Confirmar</strong>Exige um segundo toque antes de iniciar.</div>
      </div>
      <div class="phase22-actions">
        <button id="phase22-preset" type="button" class="save">🧩 Carregar preset Júlio</button>
        <button id="phase22-review" type="button">🔎 Revisar preparação</button>
        <button id="phase22-apply" type="button" class="warn">💾 Aplicar sem iniciar</button>
        <button id="phase22-start" type="button" class="send">▶️ Preparar confirmação</button>
      </div>
      <div class="phase22-note">O preset usa 07:30–21:30, intervalo de 60 minutos, 1 oferta por lote e limite diário de 15. A seleção atual de grupos é preservada.</div>
      <div id="phase22-summary" class="result">Carregando o estado do perfil Júlio...</div>
    `;

    const metrics = document.querySelector('.metrics');
    if (metrics?.parentNode) metrics.parentNode.insertBefore(card, metrics.nextSibling);
    else document.querySelector('.container')?.prepend(card);

    byId('phase22-preset')?.addEventListener('click', applyPresetToFields);
    byId('phase22-review')?.addEventListener('click', reviewPreparation);
    byId('phase22-apply')?.addEventListener('click', applyPreparation);
    byId('phase22-start')?.addEventListener('click', requestStart);

    ['enabled', 'windowStart', 'windowEnd', 'intervalMinutes', 'offersPerBatch', 'dailyLimit']
      .forEach(id => byId(id)?.addEventListener('input', invalidatePreparation));
    document.addEventListener('change', event => {
      if (event.target?.matches?.('.grupo-check,.categoria-grupo')) invalidatePreparation();
    });

    interceptLegacyStart();
  }

  function setSummary(message, stateName = 'idle') {
    const box = byId('phase22-summary');
    if (!box) return;
    box.dataset.state = stateName;
    box.textContent = message;
  }

  function currentGroups() {
    if (typeof window.gruposTela === 'function') return window.gruposTela();
    return Array.from(document.querySelectorAll('.grupo-check:checked')).map(input => {
      const card = input.closest('.group-option');
      const category = card?.querySelector('.categoria-grupo')?.value || 'geral';
      return { id: input.value, name: input.dataset.name || input.value, category };
    });
  }

  function currentCategories() {
    if (typeof window.categoriasTela === 'function') return window.categoriasTela();
    const result = {};
    document.querySelectorAll('.categoria-grupo').forEach(select => {
      result[select.dataset.id] = select.value || 'geral';
    });
    return result;
  }

  function buildPayload() {
    return {
      enabled: Boolean(byId('enabled')?.checked),
      selectedGroups: currentGroups(),
      groupCategories: currentCategories(),
      windowStart: String(byId('windowStart')?.value || ''),
      windowEnd: String(byId('windowEnd')?.value || ''),
      intervalMinutes: Number(byId('intervalMinutes')?.value || 0),
      offersPerBatch: Number(byId('offersPerBatch')?.value || 0),
      dailyLimit: Number(byId('dailyLimit')?.value || 0)
    };
  }

  function normalizeSignaturePayload(payload) {
    return {
      enabled: Boolean(payload.enabled),
      groups: (payload.selectedGroups || [])
        .map(group => `${String(group.id)}:${String(group.category || 'geral')}`)
        .sort(),
      windowStart: String(payload.windowStart || ''),
      windowEnd: String(payload.windowEnd || ''),
      intervalMinutes: Number(payload.intervalMinutes || 0),
      offersPerBatch: Number(payload.offersPerBatch || 0),
      dailyLimit: Number(payload.dailyLimit || 0)
    };
  }

  function signature(payload) {
    return JSON.stringify(normalizeSignaturePayload(payload));
  }

  function validatePayload(payload) {
    const errors = [];
    if (!payload.enabled) errors.push('Ative “envio controlado” antes de preparar.');
    if (!payload.selectedGroups.length) errors.push('Selecione pelo menos um grupo autorizado.');
    if (!/^\d{2}:\d{2}$/.test(payload.windowStart)) errors.push('Informe o horário inicial.');
    if (!/^\d{2}:\d{2}$/.test(payload.windowEnd)) errors.push('Informe o horário final.');
    if (!(payload.intervalMinutes >= 1 && payload.intervalMinutes <= 1440)) errors.push('O intervalo deve ficar entre 1 e 1440 minutos.');
    if (!(payload.offersPerBatch >= 1 && payload.offersPerBatch <= 20)) errors.push('As ofertas por lote devem ficar entre 1 e 20.');
    if (!(payload.dailyLimit >= 1 && payload.dailyLimit <= 1000)) errors.push('O limite diário deve ficar entre 1 e 1000.');
    return errors;
  }

  async function fetchJson(path, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(path, {
        ...options,
        cache: 'no-store',
        signal: controller.signal
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (!response.ok || !json) {
        throw new Error(json?.error || `HTTP ${response.status}: ${text.slice(0, 120)}`);
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readLiveState() {
    const [settingsResult, queueResult, statusResult] = await Promise.allSettled([
      fetchJson('/settings'),
      fetchJson('/queue'),
      fetchJson('/status')
    ]);

    if (settingsResult.status !== 'fulfilled') throw settingsResult.reason;
    if (queueResult.status !== 'fulfilled') throw queueResult.reason;

    const live = {
      settings: settingsResult.value.settings || {},
      queue: queueResult.value.queue || {},
      status: statusResult.status === 'fulfilled' ? statusResult.value : null
    };
    state.lastLive = live;
    return live;
  }

  function parseMinutes(value) {
    const [hours, minutes] = String(value || '00:00').split(':').map(Number);
    return hours * 60 + minutes;
  }

  function atMinutes(baseDate, minutes, dayOffset = 0) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return date;
  }

  function estimateSchedule(pending, payload, sentToday = 0) {
    let remaining = Math.max(0, Number(pending || 0));
    if (!remaining) return { first: null, last: null, batches: 0, days: 0 };

    const now = new Date();
    const startMinute = parseMinutes(payload.windowStart);
    const endMinute = parseMinutes(payload.windowEnd);
    const interval = Math.max(1, payload.intervalMinutes);
    const perBatch = Math.max(1, payload.offersPerBatch);
    let first = null;
    let last = null;
    let batches = 0;
    let daysUsed = 0;

    for (let day = 0; day < 90 && remaining > 0; day += 1) {
      const dailyUsed = day === 0 ? Math.max(0, Number(sentToday || 0)) : 0;
      let dailyCapacity = Math.max(0, payload.dailyLimit - dailyUsed);
      if (!dailyCapacity) continue;

      let cursor = atMinutes(now, startMinute, day);
      const end = atMinutes(now, endMinute, day);
      if (day === 0 && now > cursor) cursor = new Date(now);
      if (cursor > end) continue;

      let usedThisDay = false;
      while (cursor <= end && dailyCapacity > 0 && remaining > 0) {
        const amount = Math.min(perBatch, dailyCapacity, remaining);
        if (!first) first = new Date(cursor);
        last = new Date(cursor);
        batches += 1;
        remaining -= amount;
        dailyCapacity -= amount;
        usedThisDay = true;
        cursor = new Date(cursor.getTime() + interval * 60000);
      }
      if (usedThisDay) daysUsed += 1;
    }

    return { first, last, batches, days: daysUsed, remaining };
  }

  function formatDateTime(date) {
    return date ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'não calculado';
  }

  function preparationText(payload, live) {
    const queue = live.queue || {};
    const settings = live.settings || {};
    const pending = Number(queue.pending || 0);
    const sentToday = Number(queue.sentToday ?? settings.sentToday ?? 0);
    const estimate = estimateSchedule(pending, payload, sentToday);
    const remainingToday = Math.max(0, payload.dailyLimit - sentToday);
    const groupNames = payload.selectedGroups.map(group => group.name || group.id);

    const lines = [
      'PERFIL: Júlio',
      `Status do WhatsApp: ${live.status?.status || 'sem leitura'}`,
      `Fila atual: ${queue.running ? 'RODANDO' : 'PARADA'} • ${pending} pendente(s)`,
      `Grupos selecionados: ${payload.selectedGroups.length}`,
      `Horário: ${payload.windowStart} até ${payload.windowEnd}`,
      `Intervalo: ${payload.intervalMinutes} min • Lote: ${payload.offersPerBatch}`,
      `Limite diário: ${payload.dailyLimit} • já concluídas hoje: ${sentToday}`,
      `Capacidade restante hoje: ${remainingToday}`,
      `Primeiro lote estimado: ${formatDateTime(estimate.first)}`,
      `Último lote estimado: ${formatDateTime(estimate.last)}`,
      `Lotes calculados: ${estimate.batches}${estimate.remaining ? ` • ${estimate.remaining} oferta(s) avançam para dias posteriores` : ''}`,
      '',
      'GRUPOS:',
      groupNames.length ? groupNames.join('\n') : 'Nenhum grupo selecionado.'
    ];
    return lines.join('\n');
  }

  function applyPresetToFields() {
    byId('enabled').checked = true;
    byId('windowStart').value = PRESET_JULIO.windowStart;
    byId('windowEnd').value = PRESET_JULIO.windowEnd;
    byId('intervalMinutes').value = PRESET_JULIO.intervalMinutes;
    byId('offersPerBatch').value = PRESET_JULIO.offersPerBatch;
    byId('dailyLimit').value = PRESET_JULIO.dailyLimit;
    invalidatePreparation();
    setSummary('Preset de Júlio preenchido. Os grupos não foram alterados e nada foi salvo ainda.\n\nToque em “Revisar preparação”.', 'ready');
  }

  function invalidatePreparation() {
    if (!state.preparedSignature) return;
    const current = signature(buildPayload());
    if (current !== state.preparedSignature) {
      state.preparedSignature = '';
      sessionStorage.removeItem('phase22_prepared_signature');
      resetStartConfirmation();
      setSummary('A configuração preparada foi alterada. Revise e aplique novamente antes de iniciar.', 'warning');
    }
  }

  async function reviewPreparation() {
    const payload = buildPayload();
    const errors = validatePayload(payload);
    if (errors.length) {
      setSummary('CORRIJA ANTES DE CONTINUAR:\n• ' + errors.join('\n• '), 'error');
      return null;
    }

    setSummary('Consultando configurações e fila do perfil Júlio...', 'loading');
    try {
      const live = await readLiveState();
      setSummary(preparationText(payload, live), live.queue?.running ? 'warning' : 'ready');
      return { payload, live };
    } catch (error) {
      setSummary(`Não foi possível revisar: ${error.message}`, 'error');
      return null;
    }
  }

  function settingsMatch(saved, expected) {
    return signature({
      enabled: saved.enabled,
      selectedGroups: saved.selectedGroups || [],
      windowStart: saved.windowStart,
      windowEnd: saved.windowEnd,
      intervalMinutes: saved.intervalMinutes,
      offersPerBatch: saved.offersPerBatch,
      dailyLimit: saved.dailyLimit
    }) === signature(expected);
  }

  async function applyPreparation() {
    const reviewed = await reviewPreparation();
    if (!reviewed) return;
    const { payload, live } = reviewed;

    if (live.queue?.running) {
      const pauseApproved = confirm('A fila está rodando. Pausar agora para aplicar a preparação com segurança?');
      if (!pauseApproved) {
        setSummary('Preparação cancelada. A fila não foi alterada.', 'warning');
        return;
      }
    }

    const button = byId('phase22-apply');
    if (button) {
      button.disabled = true;
      button.textContent = 'Aplicando...';
    }
    setSummary('Pausando a fila e salvando a configuração. Nenhuma oferta será disparada nesta etapa...', 'loading');

    try {
      await fetchJson('/queue/stop', { method: 'POST' });
      const savedResponse = await fetchJson('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const saved = savedResponse.settings || {};
      if (!settingsMatch(saved, payload)) {
        throw new Error('O servidor respondeu, mas os parâmetros salvos não conferem com a preparação.');
      }

      await sleep(400);
      const verified = await readLiveState();
      if (verified.queue?.running) throw new Error('A fila continuou rodando após a preparação.');
      if (!verified.settings?.enabled) throw new Error('O envio controlado não ficou ativado.');
      if (!Array.isArray(verified.settings?.selectedGroups) || !verified.settings.selectedGroups.length) {
        throw new Error('Nenhum grupo permaneceu selecionado no servidor.');
      }

      state.preparedSignature = signature(payload);
      sessionStorage.setItem('phase22_prepared_signature', state.preparedSignature);
      setSummary(
        '✅ PREPARAÇÃO CONFIRMADA\n\n' + preparationText(payload, verified) +
        '\n\nA fila permanece PARADA. Toque em “Preparar confirmação” e depois confirme uma segunda vez para iniciar.',
        'ok'
      );
      if (typeof window.carregarSettings === 'function') await window.carregarSettings();
      if (typeof window.carregarFila === 'function') await window.carregarFila();
    } catch (error) {
      state.preparedSignature = '';
      sessionStorage.removeItem('phase22_prepared_signature');
      setSummary(`❌ A preparação não foi confirmada: ${error.message}\n\nA fila não foi iniciada.`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '💾 Aplicar sem iniciar';
      }
    }
  }

  function resetStartConfirmation() {
    state.confirmationUntil = 0;
    clearInterval(state.confirmationTimer);
    state.confirmationTimer = null;
    const button = byId('phase22-start');
    if (button) {
      button.dataset.confirming = 'false';
      button.textContent = '▶️ Preparar confirmação';
      button.disabled = false;
    }
  }

  function armStartConfirmation() {
    state.confirmationUntil = Date.now() + 15000;
    const button = byId('phase22-start');
    if (!button) return;
    button.dataset.confirming = 'true';

    const tick = () => {
      const seconds = Math.max(0, Math.ceil((state.confirmationUntil - Date.now()) / 1000));
      if (!seconds) {
        resetStartConfirmation();
        setSummary('A confirmação expirou. A fila continua parada.', 'warning');
        return;
      }
      button.textContent = `⚠️ CONFIRMAR INÍCIO (${seconds}s)`;
    };
    tick();
    clearInterval(state.confirmationTimer);
    state.confirmationTimer = setInterval(tick, 500);
  }

  async function verifyPreparedState() {
    if (!state.preparedSignature) {
      throw new Error('Aplique a preparação antes de iniciar.');
    }
    const payload = buildPayload();
    if (signature(payload) !== state.preparedSignature) {
      throw new Error('Os campos ou grupos mudaram depois da preparação. Aplique novamente.');
    }

    const live = await readLiveState();
    if (live.queue?.running) throw new Error('A fila já está rodando.');
    if (!Number(live.queue?.pending || 0)) throw new Error('Não há ofertas pendentes na fila.');
    if (!live.settings?.enabled) throw new Error('O envio controlado está desativado no servidor.');
    if (!settingsMatch(live.settings, payload)) throw new Error('A configuração do servidor mudou depois da preparação.');
    return { payload, live };
  }

  async function requestStart() {
    const button = byId('phase22-start');
    if (button?.disabled) return;

    try {
      const verified = await verifyPreparedState();
      if (Date.now() >= state.confirmationUntil) {
        armStartConfirmation();
        setSummary(
          '⚠️ CONFIRMAÇÃO FINAL NECESSÁRIA\n\n' + preparationText(verified.payload, verified.live) +
          '\n\nToque novamente no botão vermelho dentro de 15 segundos para iniciar a fila.',
          'warning'
        );
        return;
      }

      if (button) {
        button.disabled = true;
        button.textContent = 'Iniciando e verificando...';
      }
      clearInterval(state.confirmationTimer);
      state.confirmationTimer = null;

      const startResponse = await fetchJson('/queue/start', { method: 'POST' }, 30000);
      await sleep(600);
      const queueResponse = await fetchJson('/queue');
      const queue = queueResponse.queue || startResponse.queue || {};
      if (!queue.running) {
        throw new Error(queue.blockReason || 'O servidor não confirmou a fila como iniciada.');
      }

      state.preparedSignature = '';
      sessionStorage.removeItem('phase22_prepared_signature');
      setSummary(
        `✅ FILA INICIADA COM CONFIRMAÇÃO\n\nPendentes: ${queue.pending || 0}\nPróximo ciclo: ${queue.nextRunAt ? new Date(queue.nextRunAt).toLocaleString('pt-BR') : 'calculando'}\nGrupos selecionados: ${queue.selectedGroups || verified.payload.selectedGroups.length}\n\nO envio seguirá os limites e horários preparados.`,
        'ok'
      );
      resetStartConfirmation();
      if (typeof window.carregarFila === 'function') await window.carregarFila();
      if (typeof window.carregarStatus === 'function') await window.carregarStatus();
    } catch (error) {
      resetStartConfirmation();
      setSummary(`❌ A fila não foi iniciada: ${error.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function interceptLegacyStart() {
    const legacyButton = Array.from(document.querySelectorAll('button'))
      .find(button => button.getAttribute('onclick') === 'iniciarFila()');
    if (legacyButton) {
      legacyButton.removeAttribute('onclick');
      legacyButton.textContent = '▶️ Iniciar com confirmação';
      legacyButton.addEventListener('click', requestStart);
    }
    window.iniciarFila = requestStart;
  }

  async function initialize() {
    injectStyles();
    mountCard();
    try {
      await sleep(350);
      const payload = buildPayload();
      const live = await readLiveState();
      const prepared = state.preparedSignature && signature(payload) === state.preparedSignature;
      setSummary(
        (prepared ? '✅ Existe uma preparação confirmada nesta sessão.\n\n' : '') + preparationText(payload, live) +
        (prepared ? '\n\nA fila ainda precisa da confirmação final.' : '\n\nCarregue o preset ou revise os valores atuais.'),
        live.queue?.running ? 'warning' : prepared ? 'ok' : 'idle'
      );
    } catch (error) {
      setSummary(`O assistente foi carregado, mas não conseguiu ler o servidor: ${error.message}`, 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
