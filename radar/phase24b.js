(() => {
'use strict';
const VERSION = '25.0.1';
const DEFAULT_API = 'https://bot-afiliados-1fwi.onrender.com';
const SHOPEE_URL = 'https://affiliate.shopee.com.br/offer/product_offer';
const state = {
  api: localStorage.getItem('radar_phase24_api') || DEFAULT_API,
  profile: localStorage.getItem('radar_phase24_profile') || 'julio',
  run: null,
  busy: false,
  poll: 0,
  hydratedRunId: '',
  formDirty: false
};
const $ = id => document.getElementById(id);
const clean = value => String(value ?? '').trim();
const numberOrNull = value => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};
function setStatus(message, kind = 'idle') {
  const box = $('phase24-status');
  if (!box) return;
  box.dataset.kind = kind;
  box.textContent = message;
}
async function request(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${state.api}${path}`, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok || !body?.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('O servidor demorou demais para responder.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function currentFilters() {
  return {
    keywords: clean($('phase24-keywords')?.value),
    minPrice: numberOrNull($('phase24-min-price')?.value),
    maxPrice: numberOrNull($('phase24-max-price')?.value),
    minSold: Math.max(0, numberOrNull($('phase24-min-sold')?.value) || 0),
    minRating: Math.max(0, numberOrNull($('phase24-min-rating')?.value) || 0)
  };
}
function targetCount() {
  return Math.max(1, Math.min(200, Math.round(numberOrNull($('phase24-max-items')?.value) || 15)));
}
function fillFilters(run = {}) {
  const filters = run.filters || {};
  if ($('phase24-keywords')) $('phase24-keywords').value = filters.keywords || '';
  if ($('phase24-min-price')) $('phase24-min-price').value = filters.minPrice ?? '';
  if ($('phase24-max-price')) $('phase24-max-price').value = filters.maxPrice ?? '';
  if ($('phase24-min-sold')) $('phase24-min-sold').value = filters.minSold ?? 0;
  if ($('phase24-min-rating')) $('phase24-min-rating').value = filters.minRating ?? 0;
  if ($('phase24-max-items')) $('phase24-max-items').value = run.target ?? 15;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}
function stageLabel(stage) {
  return ({
    garimpo: 'Garimpando produtos',
    link: 'Gerando link afiliado',
    'achou-levou': 'Puxando dados, criando e salvando oferta',
    completed: 'Concluído',
    paused: 'Pausado',
    failed: 'Interrompido'
  })[stage] || clean(stage || 'Aguardando');
}
function renderEvents(run) {
  const list = $('phase24-list');
  if (!list) return;
  const events = Array.isArray(run?.events) ? run.events.slice(0, 20) : [];
  if (!events.length) {
    list.className = 'phase24-list empty';
    list.textContent = run
      ? 'A execução foi criada e está aguardando o primeiro passo.'
      : 'Nenhuma produção automática iniciada.';
    return;
  }
  list.className = 'phase24-list';
  list.innerHTML = events.map(event => `<article class="phase24-item ${event.type === 'failure' ? 'rejected' : event.type === 'success' || event.type === 'completed' ? 'approved' : 'pending'}"><div class="phase24-image-placeholder">${event.type === 'failure' ? '⚠️' : event.type === 'success' || event.type === 'completed' ? '✅' : '🤖'}</div><div class="phase24-item-body"><div class="phase24-item-top"><strong>${escapeHtml(event.message)}</strong><span class="phase24-decision">${escapeHtml(new Date(event.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</span></div>${event.itemId ? `<small>Produto: ${escapeHtml(event.itemId)}</small>` : ''}</div></article>`).join('');
}
function render() {
  const run = state.run;
  const summary = $('phase24-summary');
  const startButton = $('phase24-confirm');
  const cancelButton = $('phase24-clear');
  if (!run) {
    if (summary) summary.textContent = '0 ofertas concluídas';
    if (startButton) {
      startButton.textContent = '▶️ Iniciar produção automática';
      startButton.disabled = false;
    }
    if (cancelButton) cancelButton.disabled = true;
    renderEvents(null);
    return;
  }
  const success = Number(run.successCount || 0);
  const failures = Number(run.failureCount || 0);
  const target = Number(run.target || 0);
  const terminal = ['completed', 'cancelled', 'failed'].includes(run.status);
  if (summary) summary.textContent = `${success}/${target} salvas com sucesso • ${failures} falha(s) ignorada(s)`;
  if (startButton) {
    if (run.status === 'completed') startButton.textContent = '▶️ Iniciar nova produção';
    else if (run.status === 'cancelled') startButton.textContent = '▶️ Iniciar nova produção';
    else if (run.status === 'failed') startButton.textContent = '🔁 Tentar nova produção';
    else startButton.textContent = `🤖 Produção em andamento ${success}/${target}`;
    startButton.disabled = !terminal;
  }
  if (cancelButton) {
    cancelButton.disabled = terminal;
    cancelButton.textContent = run.status === 'cancelled' ? '✅ Produção cancelada' : '⏹️ Cancelar produção';
  }
  if (run.status === 'completed') {
    setStatus(`🎉 Meta concluída: ${success} ofertas salvas e verificadas. Agora abra o Achou Levou, confira a lista e faça manualmente o envio ao robô e a programação dos horários.`, 'ok');
  } else if (run.status === 'cancelled') {
    setStatus('⏹️ Produção cancelada. As ofertas que já estavam salvas foram preservadas. Você pode editar os filtros e iniciar uma nova produção.', 'warning');
  } else if (run.status === 'paused') {
    setStatus(`⏸️ ${run.lastError || 'A produção foi pausada.'}`, 'warning');
  } else if (run.status === 'failed') {
    setStatus(`❌ ${run.lastError || 'A produção foi interrompida.'}`, 'error');
  } else {
    setStatus(`🤖 ${stageLabel(run.stage)}. Somente ofertas salvas e verificadas entram no contador.`, 'loading');
  }
  renderEvents(run);
}
async function loadRun(showMessage = false) {
  if (state.busy) return;
  state.busy = true;
  try {
    const body = await request(`/phase24/autopilot/runs?profile=${encodeURIComponent(state.profile)}&current=1&t=${Date.now()}`);
    const nextRun = body.run || null;
    const nextRunId = clean(nextRun?.id);
    const changedRun = nextRunId !== state.hydratedRunId;
    state.run = nextRun;
    if (state.run && changedRun && !state.formDirty) fillFilters(state.run);
    if (changedRun) state.hydratedRunId = nextRunId;
    if (showMessage && !state.run) setStatus('Nenhuma produção automática foi iniciada.', 'idle');
    render();
  } catch (error) {
    setStatus(`Não foi possível consultar a produção: ${error.message}`, 'error');
  } finally {
    state.busy = false;
  }
}
function openShopee() {
  if (window.RadarNative?.openUrl) window.RadarNative.openUrl(SHOPEE_URL);
  else location.href = SHOPEE_URL;
}
async function startRun() {
  if (state.busy) return;
  const target = targetCount();
  const filters = currentFilters();
  if (!confirm(`Iniciar a produção automática de ${target} oferta(s)?\n\nO Radar irá garimpar, gerar o link, puxar o produto, criar a mensagem com IA e salvar na fila. Falhas não serão contadas. Nada será enviado ao robô do WhatsApp.`)) return;
  state.busy = true;
  setStatus('Criando a execução automática...', 'loading');
  try {
    const body = await request('/phase24/autopilot/runs', {
      method: 'POST',
      body: JSON.stringify({
        profile: state.profile,
        target,
        filters,
        status: 'ready',
        stage: 'garimpo',
        replaceCurrent: true,
        batchLabel: `Produção automática de ${target} ofertas`
      })
    });
    state.run = body.run;
    state.hydratedRunId = clean(state.run?.id);
    state.formDirty = false;
    render();
    setStatus('✅ Execução criada. Abrindo a Shopee para iniciar o garimpo automático...', 'ok');
    setTimeout(openShopee, 700);
  } catch (error) {
    setStatus(`Não foi possível iniciar: ${error.message}`, 'error');
  } finally {
    state.busy = false;
  }
}
async function cancelRun() {
  if (!state.run || ['completed', 'cancelled', 'failed'].includes(state.run.status) || state.busy) return;
  if (!confirm('Cancelar a produção automática atual? As ofertas já salvas continuarão na fila do Achou Levou.')) return;
  state.busy = true;
  try {
    const body = await request(`/phase24/autopilot/runs/${encodeURIComponent(state.run.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'cancelled',
        stage: 'failed',
        currentItemId: '',
        completedAt: new Date().toISOString(),
        event: { type: 'cancelled', message: 'Produção cancelada manualmente pelo usuário.' }
      })
    });
    state.run = body.run;
    state.formDirty = true;
    render();
  } catch (error) {
    setStatus(`Não foi possível cancelar: ${error.message}`, 'error');
  } finally {
    state.busy = false;
  }
}
function markFormDirty() {
  state.formDirty = true;
}
function mountEvents() {
  $('phase24-profile')?.addEventListener('change', event => {
    state.profile = event.target.value || 'julio';
    localStorage.setItem('radar_phase24_profile', state.profile);
    state.hydratedRunId = '';
    state.formDirty = false;
    loadRun(true);
  });
  for (const id of ['phase24-max-items', 'phase24-keywords', 'phase24-min-price', 'phase24-max-price', 'phase24-min-sold', 'phase24-min-rating']) {
    $(id)?.addEventListener('input', markFormDirty);
    $(id)?.addEventListener('change', markFormDirty);
  }
  $('phase24-refresh')?.addEventListener('click', () => loadRun(true));
  $('phase24-confirm')?.addEventListener('click', startRun);
  $('phase24-clear')?.addEventListener('click', cancelRun);
}
function initialize() {
  if (!$('phase24-card')) return;
  $('phase24-version').textContent = `Fase ${VERSION}`;
  $('phase24-profile').value = state.profile;
  mountEvents();
  loadRun(false);
  clearInterval(state.poll);
  state.poll = setInterval(() => {
    if (!document.hidden && !state.busy) loadRun(false);
  }, 5000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
else initialize();
})();
