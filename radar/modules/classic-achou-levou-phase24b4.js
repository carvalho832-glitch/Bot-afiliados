(() => {
  'use strict';

  const VERSION = '1.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const PANEL_ID = 'radar-phase24b4-review-panel';
  const BUTTON_ID = 'radar-phase24b4-review-button';
  const TOAST_ID = 'radar-phase24b4-toast';
  const B3_BUTTON_ID = 'radar-phase24b3-message-button';
  const OFFERS_KEY = 'ofertas_achou_levou';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4Version === VERSION) return;
  root.achouLevouPhase24B4Version = VERSION;

  const state = {
    batch: null,
    offers: [],
    reviews: new Map(),
    phaseSourceIds: new Set(),
    busy: false,
    rendering: false,
    loaded: false
  };

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function toast(message, kind = 'ok', duration = 8500) {
    document.getElementById(TOAST_ID)?.remove();
    const element = document.createElement('div');
    element.id = TOAST_ID;
    element.textContent = message;
    const palette = kind === 'error'
      ? 'background:#7f1d1d;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'warning'
        ? 'background:#78350f;color:#ffedd5;border:1px solid #fb923c'
        : 'background:#e6fff5;color:#052e21;border:1px solid #34d399';
    element.style.cssText = `position:fixed;left:50%;bottom:188px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100% - 28px);padding:12px 16px;border-radius:14px;font:700 13px system-ui;text-align:center;box-shadow:0 12px 36px #0008;${palette}`;
    document.documentElement.appendChild(element);
    setTimeout(() => element.remove(), duration);
  }

  async function request(path, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || `O servidor respondeu com HTTP ${response.status}.`);
      }
      return json;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A operação demorou demais. Verifique a internet.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function readLocalOffers() {
    try {
      const parsed = JSON.parse(localStorage.getItem(OFFERS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function currentBatchFrom(value) {
    const batch = value?.batch || null;
    if (batch && Array.isArray(batch.items)) return batch;
    return null;
  }

  function phaseItems() {
    return (Array.isArray(state.batch?.items) ? state.batch.items : [])
      .filter(item => item.decision === 'approved' && clean(item.affiliateUrl) && clean(item.message));
  }

  function reviewFor(sourceId) {
    return state.reviews.get(clean(sourceId)) || {
      batchId: state.batch?.id || '',
      sourceId: clean(sourceId),
      status: 'pending'
    };
  }

  function statusFor(sourceId) {
    return reviewFor(sourceId).status || 'pending';
  }

  function summary() {
    const sourceIds = phaseItems().map(item => clean(item.id));
    return sourceIds.reduce((out, sourceId) => {
      const status = statusFor(sourceId);
      out.total += 1;
      if (Object.hasOwn(out, status)) out[status] += 1;
      else out.pending += 1;
      return out;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, sent: 0 });
  }

  function offerBySourceId(sourceId) {
    return state.offers.find(offer => clean(offer.sourceId) === clean(sourceId)) || null;
  }

  async function loadState(showToast = true) {
    const batches = await request(`/phase24/batches?profile=julio&current=1&t=${Date.now()}`);
    const batch = currentBatchFrom(batches);
    if (!batch) throw new Error('Nenhum lote atual da Fase 24 foi encontrado.');

    const items = (Array.isArray(batch.items) ? batch.items : [])
      .filter(item => item.decision === 'approved' && clean(item.affiliateUrl) && clean(item.message));
    if (!items.length) throw new Error('O lote não possui mensagens prontas para revisão.');

    const [offersResult, reviewsResult] = await Promise.all([
      request(`/shared/offers?t=${Date.now()}`),
      request(`/phase24/reviews?batchId=${encodeURIComponent(batch.id)}&t=${Date.now()}`)
    ]);

    state.batch = batch;
    state.phaseSourceIds = new Set(items.map(item => clean(item.id)));
    state.offers = (Array.isArray(offersResult.offers) ? offersResult.offers : [])
      .filter(offer => state.phaseSourceIds.has(clean(offer.sourceId)));
    state.reviews = new Map(
      (Array.isArray(reviewsResult.reviews) ? reviewsResult.reviews : [])
        .map(review => [clean(review.sourceId), review])
    );
    state.loaded = true;

    renderAll();
    if (showToast) {
      const totals = summary();
      toast(`Revisão carregada: ${totals.pending} pendente(s), ${totals.approved} aprovada(s), ${totals.rejected} rejeitada(s) e ${totals.sent} enviada(s).`);
    }
    return state;
  }

  async function saveReview(sourceId, status, offerId = '') {
    if (!state.batch?.id) throw new Error('Carregue a revisão antes de decidir.');
    const result = await request(`/phase24/reviews/${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        batchId: state.batch.id,
        sourceId,
        offerId,
        status
      })
    });
    state.reviews.set(clean(sourceId), result.review);
    renderAll();
    return result.review;
  }

  function statusLabel(status) {
    if (status === 'approved') return '✅ Aprovada';
    if (status === 'rejected') return '❌ Rejeitada';
    if (status === 'sent') return '🚀 Enviada ao robô';
    return '⏳ Pendente';
  }

  function statusPalette(status) {
    if (status === 'approved') return 'background:rgba(54,232,155,.12);border:1px solid rgba(54,232,155,.38);color:#36e89b';
    if (status === 'rejected') return 'background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.38);color:#fca5a5';
    if (status === 'sent') return 'background:rgba(96,165,250,.14);border:1px solid rgba(96,165,250,.42);color:#93c5fd';
    return 'background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.38);color:#fde68a';
  }

  function makeButton(label, background, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = `border:0;border-radius:12px;padding:11px 12px;font:800 13px system-ui;color:white;background:${background};min-height:44px;`;
    button.addEventListener('click', onClick);
    return button;
  }

  async function editOffer(offer, button) {
    const current = clean(offer.message || offer.mensagem || offer.texto);
    const edited = window.prompt('Edite a mensagem da oferta e toque em OK para salvar:', current);
    if (edited === null) return;
    if (!clean(edited)) return toast('A mensagem não pode ficar vazia.', 'warning');
    if (clean(edited) === current) return toast('Nenhuma alteração foi feita.', 'warning');

    const original = button.textContent;
    button.disabled = true;
    button.textContent = '💾 Salvando...';
    try {
      await request('/shared/offers', {
        method: 'POST',
        body: JSON.stringify({
          id: offer.id,
          sourceId: offer.sourceId,
          source: 'phase24b4-review-edit',
          title: offer.title || offer.titulo,
          price: offer.price || offer.preco,
          oldPrice: offer.oldPrice || offer.precoAntigo,
          coupon: offer.coupon || offer.cupom,
          image: offer.image || offer.imagem,
          link: offer.link,
          message: clean(edited)
        })
      });
      const item = phaseItems().find(value => clean(value.id) === clean(offer.sourceId));
      if (item) {
        await request(`/phase24/batches/${encodeURIComponent(state.batch.id)}/items/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ message: clean(edited), stage: 'message-reviewed' })
        });
      }
      await root.syncSharedAchouLevou?.();
      await sleep(250);
      await loadState(false);
      toast('✅ Mensagem corrigida e salva no servidor.');
    } catch (error) {
      toast(`Não foi possível salvar a edição: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function markBatchItemSent(sourceId) {
    if (!state.batch?.id) return;
    await request(`/phase24/batches/${encodeURIComponent(state.batch.id)}/items/${encodeURIComponent(sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ stage: 'bot-queued' })
    });
  }

  async function maybeCompleteBatch() {
    const totals = summary();
    if (totals.pending || totals.approved) return false;
    await request(`/phase24/batches/${encodeURIComponent(state.batch.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' })
    });
    return true;
  }

  async function transferSelected(offers, button) {
    if (!offers.length) throw new Error('Nenhuma oferta aprovada está aguardando envio.');
    const transfer = window.AchouLevouVerifiedBotTransfer;
    if (!transfer?.transferOffers) throw new Error('O verificador da fila do robô ainda não carregou.');

    await transfer.transferOffers(offers, button);
    for (const offer of offers) {
      await saveReview(offer.sourceId, 'sent', offer.id);
      await markBatchItemSent(offer.sourceId);
    }
    const completed = await maybeCompleteBatch();
    await loadState(false).catch(() => {});
    toast(completed
      ? `🎉 Fase 24B.4 concluída: ${offers.length} oferta(s) confirmada(s) na fila do robô.`
      : `✅ ${offers.length} oferta(s) confirmada(s) na fila. A fila continua parada.`
    );
  }

  async function sendOne(offer, button) {
    if (statusFor(offer.sourceId) !== 'approved') return toast('Aprove esta oferta antes de enviar.', 'warning');
    const profile = window.AchouLevouVerifiedBotTransfer?.activeProfile?.() || { label: 'Júlio' };
    if (!confirm(`Enviar esta oferta aprovada para a fila de ${profile.label}?\n\nA fila não será iniciada.`)) return;
    try {
      await transferSelected([offer], button);
    } catch (error) {
      toast(`Não foi possível confirmar o envio: ${error.message}`, 'error');
    }
  }

  async function sendApproved(button) {
    const totals = summary();
    if (totals.pending) {
      return toast(`Revise primeiro as ${totals.pending} oferta(s) pendente(s).`, 'warning');
    }
    const approved = state.offers.filter(offer => statusFor(offer.sourceId) === 'approved');
    if (!approved.length) return toast('Nenhuma oferta aprovada aguarda envio.', 'warning');
    const profile = window.AchouLevouVerifiedBotTransfer?.activeProfile?.() || { label: 'Júlio' };
    if (!confirm(
      `Enviar e confirmar ${approved.length} oferta(s) aprovada(s) na fila de ${profile.label}?\n\n` +
      'A fila continuará parada. Nenhuma mensagem será disparada agora.'
    )) return;

    try {
      await transferSelected(approved, button);
    } catch (error) {
      toast(`Não foi possível confirmar a transferência: ${error.message}`, 'error');
    }
  }

  function ensurePanel() {
    const list = document.getElementById('lista-salvas');
    if (!list || !state.loaded) return null;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.style.cssText = 'margin:18px 0;padding:18px;border-radius:20px;background:linear-gradient(160deg,#0b1d34,#0b1324);border:1px solid rgba(56,189,248,.35);box-shadow:0 14px 36px rgba(0,0,0,.25);color:#e5f4ff;';
      list.parentElement?.insertBefore(panel, list);
    }

    const totals = summary();
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div>
          <div style="font:800 12px system-ui;letter-spacing:.12em;color:#67e8f9;">FASE 24B.4</div>
          <div style="font:900 22px system-ui;margin-top:4px;">Revisão antes do robô</div>
        </div>
        <span style="padding:7px 10px;border-radius:999px;background:#172554;color:#bfdbfe;font:800 12px system-ui;">${totals.total} ofertas</span>
      </div>
      <p style="margin:12px 0 14px;color:#b6c7dc;font:500 14px/1.5 system-ui;">Aprove ou rejeite cada mensagem. Somente as aprovadas poderão entrar na fila, que continuará parada.</p>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px;">
        <div style="padding:10px;border-radius:12px;background:#111827;font:800 13px system-ui;color:#fde68a;">⏳ Pendentes: ${totals.pending}</div>
        <div style="padding:10px;border-radius:12px;background:#111827;font:800 13px system-ui;color:#86efac;">✅ Aprovadas: ${totals.approved}</div>
        <div style="padding:10px;border-radius:12px;background:#111827;font:800 13px system-ui;color:#fca5a5;">❌ Rejeitadas: ${totals.rejected}</div>
        <div style="padding:10px;border-radius:12px;background:#111827;font:800 13px system-ui;color:#93c5fd;">🚀 Na fila: ${totals.sent}</div>
      </div>
    `;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:grid;gap:10px;';
    const refresh = makeButton('🔄 Atualizar revisão', 'linear-gradient(90deg,#334155,#475569)', async () => {
      refresh.disabled = true;
      try { await loadState(true); } catch (error) { toast(error.message, 'error'); }
      finally { refresh.disabled = false; }
    });
    const send = makeButton(
      totals.pending ? `🔒 Revise ${totals.pending} pendente(s)` : `🚀 Enviar ${totals.approved} aprovada(s) ao robô`,
      totals.pending || !totals.approved ? 'linear-gradient(90deg,#475569,#334155)' : 'linear-gradient(90deg,#16a34a,#059669)',
      () => sendApproved(send)
    );
    send.disabled = Boolean(totals.pending || !totals.approved);
    actions.append(refresh, send);
    panel.appendChild(actions);
    return panel;
  }

  function decorateCards() {
    if (!state.loaded || state.rendering) return;
    state.rendering = true;
    try {
      const localOffers = readLocalOffers();
      const cards = [...document.querySelectorAll('#lista-salvas .saved-card')];
      cards.forEach((card, index) => {
        const local = localOffers[index];
        const sourceId = clean(local?.sourceId);
        if (!sourceId || !state.phaseSourceIds.has(sourceId)) return;
        const offer = offerBySourceId(sourceId) || local;
        const status = statusFor(sourceId);
        card.dataset.phase24b4SourceId = sourceId;

        card.querySelector('.btn-small.primary')?.style.setProperty('display', 'none', 'important');
        card.querySelector('.phase24b4-review-controls')?.remove();
        card.querySelector('.phase24b4-review-badge')?.remove();

        const top = card.querySelector('.saved-card-top');
        if (top) {
          const badge = document.createElement('span');
          badge.className = 'phase24b4-review-badge';
          badge.textContent = statusLabel(status);
          badge.style.cssText = `display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;font:800 11px system-ui;${statusPalette(status)}`;
          top.appendChild(badge);
        }

        const controls = document.createElement('div');
        controls.className = 'phase24b4-review-controls';
        controls.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0;';

        const approve = makeButton('✅ Aprovar', 'linear-gradient(90deg,#15803d,#059669)', async () => {
          approve.disabled = true;
          try {
            await saveReview(sourceId, 'approved', offer.id);
            toast('Oferta aprovada.');
          } catch (error) { toast(error.message, 'error'); }
          finally { approve.disabled = false; }
        });
        const reject = makeButton('❌ Rejeitar', 'linear-gradient(90deg,#b91c1c,#dc2626)', async () => {
          reject.disabled = true;
          try {
            await saveReview(sourceId, 'rejected', offer.id);
            toast('Oferta rejeitada e mantida fora da fila.');
          } catch (error) { toast(error.message, 'error'); }
          finally { reject.disabled = false; }
        });
        const edit = makeButton('✏️ Editar', 'linear-gradient(90deg,#334155,#475569)', () => editOffer(offer, edit));
        const send = makeButton(status === 'sent' ? '✅ Já enviada' : '🚀 Enviar aprovada', 'linear-gradient(90deg,#1d4ed8,#2563eb)', () => sendOne(offer, send));

        approve.disabled = status === 'sent';
        reject.disabled = status === 'sent';
        edit.disabled = status === 'sent';
        send.disabled = status !== 'approved';
        controls.append(approve, reject, edit, send);
        card.querySelector('pre')?.insertAdjacentElement('afterend', controls);
      });

      document.getElementById('btn-enviar-todas-robo')?.style.setProperty('display', 'none', 'important');
      document.getElementById('btn-enviar-atual-robo')?.style.setProperty('display', 'none', 'important');
      const b3 = document.getElementById(B3_BUTTON_ID);
      if (b3 && !phaseItems().some(item => !clean(item.message))) b3.style.display = 'none';
    } finally {
      state.rendering = false;
    }
  }

  function renderAll() {
    ensurePanel();
    decorateCards();
    updateFloatingButton();
  }

  function updateFloatingButton() {
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.style.cssText = 'position:fixed;right:14px;bottom:188px;z-index:2147483646;border:0;border-radius:15px;padding:12px 15px;background:linear-gradient(90deg,#7c3aed,#4f46e5);color:white;font:900 13px system-ui;box-shadow:0 12px 28px rgba(0,0,0,.38);';
      button.addEventListener('click', async () => {
        button.disabled = true;
        const original = button.textContent;
        button.textContent = '⏳ Carregando...';
        try {
          await loadState(true);
          document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          button.disabled = false;
          button.textContent = original;
          updateFloatingButton();
        }
      });
      document.documentElement.appendChild(button);
    }
    const totals = summary();
    button.textContent = state.loaded
      ? `🛡️ Revisão 24B (${totals.pending})`
      : '🛡️ Carregar revisão 24B';
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(() => {
      if (!state.rendering) renderAll();
    }, 180);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('achoulevou:ofertas-atualizadas', () => setTimeout(() => loadState(false).catch(() => {}), 250));
  window.addEventListener('focus', () => setTimeout(() => state.loaded && loadState(false).catch(() => {}), 300));

  root.phase24B4Review = {
    version: VERSION,
    loadState,
    saveReview,
    summary,
    sendApproved,
    supervised: true,
    autoStart: false,
    whatsappSend: false
  };

  updateFloatingButton();
  setTimeout(() => loadState(false).catch(error => console.warn('[FASE 24B.4] Revisão ainda não carregada:', error.message)), 900);
})();
