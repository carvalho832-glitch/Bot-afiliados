(() => {
  'use strict';

  const VERSION = '24.1.0';
  const DEFAULT_API = 'https://bot-afiliados-1fwi.onrender.com';
  const state = {
    api: localStorage.getItem('radar_phase24_api') || DEFAULT_API,
    profile: localStorage.getItem('radar_phase24_profile') || 'julio',
    batch: null,
    visibleIds: new Set(),
    busy: false
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

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
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
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${response.status}: ${text.slice(0, 140)}`);
      }
      return body;
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
      minRating: Math.max(0, numberOrNull($('phase24-min-rating')?.value) || 0),
      maxItems: Math.max(1, Math.min(80, numberOrNull($('phase24-max-items')?.value) || 15))
    };
  }

  function fillFilters(filters = {}) {
    if ($('phase24-keywords')) $('phase24-keywords').value = filters.keywords || '';
    if ($('phase24-min-price')) $('phase24-min-price').value = filters.minPrice ?? '';
    if ($('phase24-max-price')) $('phase24-max-price').value = filters.maxPrice ?? '';
    if ($('phase24-min-sold')) $('phase24-min-sold').value = filters.minSold ?? 0;
    if ($('phase24-min-rating')) $('phase24-min-rating').value = filters.minRating ?? 0;
    if ($('phase24-max-items')) $('phase24-max-items').value = filters.maxItems ?? 15;
  }

  function formatMetric(value, fallback = 'não lido') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function decisionLabel(decision) {
    if (decision === 'approved') return 'Aprovado';
    if (decision === 'rejected') return 'Rejeitado';
    return 'Pendente';
  }

  function render() {
    const batch = state.batch;
    const list = $('phase24-list');
    const summary = $('phase24-summary');
    if (!list || !summary) return;

    if (!batch) {
      list.className = 'phase24-list empty';
      list.textContent = 'Nenhum lote capturado. Abra a Shopee, aplique os filtros da página e toque em “Ler produtos”.';
      summary.textContent = '0 produtos';
      return;
    }

    const items = Array.isArray(batch.items) ? batch.items : [];
    const counts = items.reduce((acc, item) => {
      acc[item.decision || 'pending'] = (acc[item.decision || 'pending'] || 0) + 1;
      return acc;
    }, { pending: 0, approved: 0, rejected: 0 });
    summary.textContent = `${items.length} lidos • ${counts.approved} aprovados • ${counts.pending} pendentes • ${counts.rejected} rejeitados`;
    list.className = 'phase24-list';
    list.innerHTML = items.map(item => {
      const visible = state.visibleIds.has(item.id);
      return `
        <article class="phase24-item ${escapeHtml(item.decision || 'pending')} ${visible ? '' : 'filtered-out'}" data-item-id="${escapeHtml(item.id)}">
          ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : '<div class="phase24-image-placeholder">📦</div>'}
          <div class="phase24-item-body">
            <div class="phase24-item-top">
              <strong>${escapeHtml(item.title)}</strong>
              <span class="phase24-decision">${decisionLabel(item.decision)}</span>
            </div>
            <div class="phase24-metrics">
              <span>💰 ${escapeHtml(formatMetric(item.priceText || item.priceValue))}</span>
              <span>🛒 ${escapeHtml(formatMetric(item.soldText || item.soldCount))}</span>
              <span>⭐ ${escapeHtml(formatMetric(item.rating))}</span>
              ${item.commissionText ? `<span>💸 ${escapeHtml(item.commissionText)}</span>` : ''}
            </div>
            ${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ''}
            <div class="phase24-item-actions">
              <button type="button" data-decision="approved">✅ Aprovar</button>
              <button type="button" data-decision="rejected">❌ Rejeitar</button>
              <button type="button" data-open-url="${escapeHtml(item.url)}">🔎 Abrir</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function evaluateItem(item, filters) {
    const keywords = filters.keywords
      .toLowerCase()
      .split(/[,;\n]+/)
      .map(value => value.trim())
      .filter(Boolean);
    if (keywords.length && !keywords.some(keyword => clean(item.title).toLowerCase().includes(keyword))) {
      return { pass: false, uncertain: false, reason: 'Fora das palavras ou nichos escolhidos.' };
    }

    const needsPrice = filters.minPrice !== null || filters.maxPrice !== null;
    if (needsPrice && item.priceValue === null) {
      return { pass: false, uncertain: true, reason: 'Preço não pôde ser lido automaticamente.' };
    }
    if (filters.minPrice !== null && item.priceValue < filters.minPrice) {
      return { pass: false, uncertain: false, reason: 'Preço abaixo do mínimo.' };
    }
    if (filters.maxPrice !== null && item.priceValue > filters.maxPrice) {
      return { pass: false, uncertain: false, reason: 'Preço acima do máximo.' };
    }

    if (filters.minSold > 0 && item.soldCount === null) {
      return { pass: false, uncertain: true, reason: 'Quantidade vendida não pôde ser lida.' };
    }
    if (filters.minSold > 0 && item.soldCount < filters.minSold) {
      return { pass: false, uncertain: false, reason: 'Vendas abaixo do mínimo.' };
    }

    if (filters.minRating > 0 && item.rating === null) {
      return { pass: false, uncertain: true, reason: 'Avaliação não pôde ser lida.' };
    }
    if (filters.minRating > 0 && item.rating < filters.minRating) {
      return { pass: false, uncertain: false, reason: 'Avaliação abaixo do mínimo.' };
    }

    return { pass: true, uncertain: false, reason: 'Passou pelos filtros.' };
  }

  async function applyRules() {
    if (!state.batch || state.busy) return;
    const filters = currentFilters();
    let approved = 0;
    state.visibleIds.clear();
    state.batch.items = state.batch.items.map(item => {
      const result = evaluateItem(item, filters);
      if (result.pass && approved < filters.maxItems) {
        approved += 1;
        state.visibleIds.add(item.id);
        return { ...item, decision: 'approved', reason: result.reason };
      }
      if (result.uncertain) {
        state.visibleIds.add(item.id);
        return { ...item, decision: 'pending', reason: result.reason };
      }
      return {
        ...item,
        decision: 'rejected',
        reason: result.pass ? 'Fora do limite máximo do lote.' : result.reason
      };
    });
    render();
    await saveBatch('reviewed', `Regras aplicadas: ${approved} produto(s) pré-aprovado(s). Revise os pendentes antes de confirmar.`);
  }

  async function saveBatch(status = null, successMessage = 'Lote atualizado.') {
    if (!state.batch || state.busy) return;
    state.busy = true;
    setStatus('Salvando e verificando o lote...', 'loading');
    try {
      const payload = {
        ...(status ? { status } : {}),
        filters: currentFilters(),
        decisions: state.batch.items.map(item => ({
          id: item.id,
          decision: item.decision || 'pending',
          reason: item.reason || ''
        }))
      };
      const body = await request(`/phase24/batches/${encodeURIComponent(state.batch.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      state.batch = body.batch;
      state.visibleIds = new Set(state.batch.items.filter(item => item.decision !== 'rejected').map(item => item.id));
      render();
      setStatus(successMessage, 'ok');
    } catch (error) {
      setStatus(`Não foi possível salvar o lote: ${error.message}`, 'error');
    } finally {
      state.busy = false;
    }
  }

  async function loadBatch(showMessage = true) {
    if (state.busy) return;
    state.busy = true;
    setStatus('Buscando o lote capturado na Shopee...', 'loading');
    try {
      const body = await request(`/phase24/batches?profile=${encodeURIComponent(state.profile)}&current=1&t=${Date.now()}`);
      state.batch = body.batch || null;
      if (state.batch) {
        fillFilters(state.batch.filters || {});
        state.visibleIds = new Set(state.batch.items.filter(item => item.decision !== 'rejected').map(item => item.id));
        setStatus(
          showMessage
            ? `Lote ${state.batch.status} carregado. Revise os produtos antes de confirmar.`
            : 'Lote carregado.',
          'ok'
        );
      } else {
        setStatus('Nenhum lote encontrado. Leia os produtos na página da Shopee.', 'idle');
      }
      render();
    } catch (error) {
      setStatus(`Não foi possível consultar o lote: ${error.message}`, 'error');
      state.batch = null;
      render();
    } finally {
      state.busy = false;
    }
  }

  async function confirmBatch() {
    if (!state.batch) return;
    const approved = state.batch.items.filter(item => item.decision === 'approved');
    if (!approved.length) {
      setStatus('Aprove pelo menos um produto antes de confirmar o lote.', 'warning');
      return;
    }
    const pending = state.batch.items.filter(item => item.decision === 'pending').length;
    const message = pending
      ? `${pending} produto(s) ainda estão pendentes. Confirmar somente os ${approved.length} aprovados?`
      : `Confirmar ${approved.length} produto(s) para a etapa de geração de links?`;
    if (!confirm(message)) return;
    await saveBatch('approved', `✅ Lote confirmado com ${approved.length} produto(s). A fila continua parada; a próxima etapa gerará os links de afiliado.`);
  }

  function mountEvents() {
    $('phase24-profile')?.addEventListener('change', event => {
      state.profile = event.target.value || 'julio';
      localStorage.setItem('radar_phase24_profile', state.profile);
      loadBatch();
    });
    $('phase24-refresh')?.addEventListener('click', () => loadBatch());
    $('phase24-apply')?.addEventListener('click', applyRules);
    $('phase24-save')?.addEventListener('click', () => saveBatch('reviewed'));
    $('phase24-confirm')?.addEventListener('click', confirmBatch);
    $('phase24-clear')?.addEventListener('click', () => {
      if (!state.batch) return;
      state.batch.items = state.batch.items.map(item => ({ ...item, decision: 'pending', reason: '' }));
      state.visibleIds = new Set(state.batch.items.map(item => item.id));
      render();
      saveBatch('draft', 'Decisões limpas. O lote voltou para rascunho.');
    });

    $('phase24-list')?.addEventListener('click', event => {
      const itemElement = event.target.closest('[data-item-id]');
      if (!itemElement || !state.batch) return;
      const item = state.batch.items.find(entry => entry.id === itemElement.dataset.itemId);
      if (!item) return;
      const decision = event.target.closest('[data-decision]')?.dataset?.decision;
      if (decision) {
        item.decision = decision;
        item.reason = decision === 'approved' ? 'Aprovado manualmente.' : 'Rejeitado manualmente.';
        if (decision === 'rejected') state.visibleIds.delete(item.id);
        else state.visibleIds.add(item.id);
        render();
        return;
      }
      const url = event.target.closest('[data-open-url]')?.dataset?.openUrl;
      if (url) {
        if (window.RadarNative?.openUrl) window.RadarNative.openUrl(url);
        else location.href = url;
      }
    });
  }

  function initialize() {
    if (!$('phase24-card')) return;
    $('phase24-version').textContent = `Fase ${VERSION}`;
    $('phase24-profile').value = state.profile;
    mountEvents();
    loadBatch(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
