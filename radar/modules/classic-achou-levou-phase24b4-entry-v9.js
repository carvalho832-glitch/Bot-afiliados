(() => {
  'use strict';

  const VERSION = '9.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const SOURCE_PREFIX = 'phase24b3:';
  const BOT_BATCH_ID = 'bot-queue';
  const BUTTON_ID = 'radar-phase24b4-review-button';
  const PANEL_ID = 'radar-phase24b4-review-panel';
  const V6_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-entry-v6.js?v=5';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4EntryV9Version === VERSION) return;
  root.achouLevouPhase24B4EntryV9Version = VERSION;

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let clickRecoveryRunning = false;

  function toast(message, kind = 'ok', duration = 9000) {
    document.getElementById('radar-phase24b4-v9-toast')?.remove();
    const element = document.createElement('div');
    element.id = 'radar-phase24b4-v9-toast';
    element.textContent = message;
    const palette = kind === 'error'
      ? 'background:#7f1d1d;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'warning'
        ? 'background:#78350f;color:#ffedd5;border:1px solid #fb923c'
        : 'background:#064e3b;color:#d1fae5;border:1px solid #34d399';
    element.style.cssText = `position:fixed;left:50%;bottom:188px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100% - 28px);padding:12px 16px;border-radius:14px;font:800 13px/1.35 system-ui;text-align:center;box-shadow:0 12px 36px #0008;${palette}`;
    document.documentElement.appendChild(element);
    setTimeout(() => element.remove(), duration);
  }

  function safeId(value, fallback) {
    return clean(value)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120) || fallback;
  }

  function itemMessage(item = {}) {
    return clean(
      item.message || item.text || item.texto || item.content || item.body ||
      item?.payload?.message || item?.payload?.text ||
      item?.data?.message || item?.data?.text
    );
  }

  function extractLink(message, item = {}) {
    const explicit = clean(item.link || item.url || item.affiliateUrl || item.linkOferta || item?.payload?.link);
    if (explicit) return explicit;
    const match = clean(message).match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0].replace(/[),.;!?]+$/g, '') : '';
  }

  function titleFromMessage(message, index) {
    const lines = clean(message).split('\n').map(clean).filter(Boolean);
    const title = lines.find(line =>
      !/^https?:\/\//i.test(line) &&
      !/^(ver agora|compre aqui|garanta|aproveite|link de compra)/i.test(line)
    );
    return clean(title || `Oferta recuperada ${index + 1}`).slice(0, 240);
  }

  function loadScript(src, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-radar-module="${marker}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${marker}.`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.radarModule = marker;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Falha ao carregar ${marker}.`)), { once: true });
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async function requestJson(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
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
      if (!response.ok || !json) throw new Error(json?.error || `HTTP ${response.status}`);
      return json;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A leitura da fila demorou demais.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function candidateArrays(payload) {
    const candidates = [
      payload?.queue?.items,
      payload?.items,
      payload?.queue?.queue?.items,
      payload?.data?.queue?.items,
      payload?.data?.items,
      payload?.queue?.offers,
      payload?.offers,
      payload?.messages,
      payload?.data?.offers,
      payload?.data?.messages
    ].filter(Array.isArray);

    const seen = new Set();
    const visit = (value, depth = 0) => {
      if (!value || depth > 5 || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        if (value.some(item => item && typeof item === 'object' && itemMessage(item))) candidates.push(value);
        value.forEach(item => visit(item, depth + 1));
        return;
      }
      Object.values(value).forEach(item => visit(item, depth + 1));
    };
    visit(payload);

    return [...new Set(candidates)].sort((a, b) => {
      const score = list => list.filter(item => itemMessage(item)).length;
      return score(b) - score(a);
    });
  }

  function queueItemsFromPayload(payload) {
    const best = candidateArrays(payload).find(list => list.some(item => itemMessage(item)));
    return Array.isArray(best) ? best : [];
  }

  function isPendingItem(item = {}) {
    const status = clean(item.status || item.state || item.situacao).toLowerCase();
    if (!status) return true;
    return !['sent', 'enviado', 'completed', 'concluido', 'concluído', 'done', 'finished'].includes(status);
  }

  function offerFromQueueItem(item, index) {
    const message = itemMessage(item);
    const link = extractLink(message, item);
    if (!message || !link) return null;
    const itemId = safeId(item.id || item.offerId || item.queueId, `item-${index + 1}`);
    return {
      id: `bot-queue-${itemId}`,
      source: 'phase24b4-recovered-from-bot-queue-v9',
      sourceId: `${SOURCE_PREFIX}${BOT_BATCH_ID}:${itemId}`,
      title: titleFromMessage(message, index),
      price: clean(item.price || item.preco),
      oldPrice: clean(item.oldPrice || item.precoAntigo),
      coupon: clean(item.coupon || item.cupom),
      image: clean(item.image || item.imagem),
      link,
      message,
      createdAt: clean(item.createdAt || item.criadoEm) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      alreadyInBotQueue: true
    };
  }

  function readLocalOffers() {
    try {
      const parsed = JSON.parse(localStorage.getItem('ofertas_achou_levou') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function mergeBySourceId(existing, recovered) {
    const merged = new Map();
    for (const offer of [...existing, ...recovered]) {
      const sourceId = clean(offer?.sourceId);
      const key = sourceId || clean(offer?.id) || `${clean(offer?.link)}\n${itemMessage(offer)}`;
      if (!key) continue;
      merged.set(key, { ...(merged.get(key) || {}), ...offer });
    }
    return [...merged.values()];
  }

  function writeRecoveredLocally(offers) {
    const merged = mergeBySourceId(readLocalOffers(), offers);
    if (window.AchouLevouSharedOffers?.writeLocal) {
      window.AchouLevouSharedOffers.writeLocal(merged);
    } else {
      localStorage.setItem('ofertas_achou_levou', JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('achoulevou:ofertas-atualizadas', {
        detail: { total: merged.length, recoveredFromBotQueue: true, version: VERSION }
      }));
    }
    return merged;
  }

  function installRecoveredFetchBridge(offers) {
    root.phase24B4V9RecoveredOffers = offers;
    if (root.phase24B4V9FetchBridgeInstalled) return;
    root.phase24B4V9FetchBridgeInstalled = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = async function phase24B4V9FetchBridge(input, init = {}) {
      const response = await previousFetch(input, init);
      const url = String(input?.url || input || '');
      const method = String(init?.method || 'GET').toUpperCase();

      if (method === 'GET' && url.startsWith(`${API_BASE}/shared/offers`) && response.ok) {
        try {
          const payload = await response.clone().json();
          if (!payload?.ok || !Array.isArray(payload.offers)) return response;
          const merged = mergeBySourceId(payload.offers, root.phase24B4V9RecoveredOffers || []);
          const headers = new Headers(response.headers);
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.delete('Content-Length');
          headers.delete('Content-Encoding');
          return new Response(JSON.stringify({ ...payload, offers: merged, count: merged.length }), {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        } catch { return response; }
      }

      if (method === 'GET' && url.startsWith(`${API_BASE}/phase24/reviews`) && response.ok) {
        try {
          const payload = await response.clone().json();
          if (!payload?.ok || !Array.isArray(payload.reviews)) return response;
          const reviews = [...payload.reviews];
          const known = new Set(reviews.map(review => clean(review?.sourceId)));
          for (const offer of root.phase24B4V9RecoveredOffers || []) {
            if (known.has(offer.sourceId)) continue;
            reviews.push({
              batchId: BOT_BATCH_ID,
              sourceId: offer.sourceId,
              offerId: offer.id,
              status: 'sent',
              createdAt: offer.createdAt,
              updatedAt: offer.updatedAt
            });
          }
          const headers = new Headers(response.headers);
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.delete('Content-Length');
          headers.delete('Content-Encoding');
          return new Response(JSON.stringify({ ...payload, reviews, count: reviews.length }), {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        } catch { return response; }
      }

      return response;
    };
  }

  async function persistRecoveredOffer(offer) {
    await requestJson(`${API_BASE}/shared/offers`, {
      method: 'POST',
      body: JSON.stringify(offer)
    });
    await requestJson(`${API_BASE}/phase24/reviews/${encodeURIComponent(offer.sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        batchId: BOT_BATCH_ID,
        sourceId: offer.sourceId,
        offerId: offer.id,
        status: 'sent'
      })
    }).catch(() => null);
  }

  async function readBotQueueDirectly() {
    const payload = await requestJson(`${API_BASE}/bot/queue?t=${Date.now()}`);
    const items = queueItemsFromPayload(payload);
    return { payload, items };
  }

  async function recoverFromBotQueue() {
    const diagnostics = {
      version: VERSION,
      endpoint: '/bot/queue',
      queueRead: false,
      queueItems: 0,
      pendingItems: 0,
      recoveredOffers: 0,
      persistedOffers: 0,
      skippedWithoutMessageOrLink: 0,
      payloadKeys: [],
      errors: []
    };

    const { payload, items } = await readBotQueueDirectly();
    diagnostics.queueRead = true;
    diagnostics.payloadKeys = Object.keys(payload || {}).slice(0, 20);
    diagnostics.queueItems = items.length;

    const pending = items.filter(item => isPendingItem(item) && itemMessage(item));
    diagnostics.pendingItems = pending.length;
    const recovered = pending.map(offerFromQueueItem).filter(Boolean);
    diagnostics.skippedWithoutMessageOrLink = pending.length - recovered.length;
    diagnostics.recoveredOffers = recovered.length;

    installRecoveredFetchBridge(recovered);
    if (!recovered.length) {
      root.phase24B4V9Diagnostics = { ...diagnostics, completedAt: Date.now() };
      return recovered;
    }

    writeRecoveredLocally(recovered);
    for (const offer of recovered) {
      try {
        await persistRecoveredOffer(offer);
        diagnostics.persistedOffers += 1;
      } catch (error) {
        diagnostics.errors.push(`${offer.sourceId}: ${error.message}`);
      }
    }

    await window.AchouLevouSharedOffers?.load?.({ apply: true }).catch(() => null);
    root.phase24B4V9Diagnostics = { ...diagnostics, completedAt: Date.now() };
    return recovered;
  }

  async function ensureReviewModule() {
    if (!root.achouLevouPhase24B4EntryV6Version) {
      await loadScript(V6_MODULE, 'achou-levou-phase24b4-entry-v6-r5');
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (root.phase24B4Review?.loadState) return root.phase24B4Review;
      await sleep(250);
    }
    throw new Error('O módulo de revisão não terminou de carregar.');
  }

  async function recoverThenLoad(showToast = true) {
    let recovered = [];
    let recoveryError = null;
    try {
      recovered = await recoverFromBotQueue();
    } catch (error) {
      recoveryError = error;
      root.phase24B4V9Diagnostics = {
        ...(root.phase24B4V9Diagnostics || {}),
        version: VERSION,
        fatalRecovery: String(error?.message || error),
        failedAt: Date.now()
      };
    }

    const review = await ensureReviewModule();
    try {
      await review.loadState(false);
      if (showToast) {
        toast(recovered.length
          ? `✅ ${recovered.length} oferta(s) recuperada(s) diretamente da fila do robô.`
          : '✅ A revisão foi carregada pela fila compartilhada.'
        );
      }
      document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return { recovered, loaded: true };
    } catch (reviewError) {
      const diagnostics = root.phase24B4V9Diagnostics || {};
      const detail = recoveryError?.message ||
        (diagnostics.queueRead && diagnostics.queueItems === 0
          ? 'O servidor informou a contagem, mas não devolveu os itens da fila.'
          : reviewError.message);
      if (showToast) toast(`Não foi possível montar a revisão: ${detail}`, 'error', 12000);
      throw reviewError;
    }
  }

  function installButtonRecovery() {
    if (root.phase24B4V9ButtonRecoveryInstalled) return;
    root.phase24B4V9ButtonRecoveryInstalled = true;

    document.addEventListener('click', async event => {
      const button = event.target?.closest?.(`#${BUTTON_ID}`);
      if (!button || clickRecoveryRunning) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      clickRecoveryRunning = true;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = '🔍 Recuperando fila...';
      try {
        await recoverThenLoad(true);
      } catch {}
      finally {
        button.disabled = false;
        clickRecoveryRunning = false;
        if (!root.phase24B4Review?.summary) button.textContent = original;
        else {
          const totals = root.phase24B4Review.summary();
          button.textContent = `🛡️ Revisão 24B (${totals.pending || 0})`;
        }
      }
    }, true);
  }

  function removeDuplicateVersionBadge() {
    const title = document.querySelector('.app-header h1');
    if (!title) return;
    const badges = [...title.querySelectorAll('sup')];
    badges.slice(1).forEach(badge => badge.remove());
  }

  async function boot() {
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    installButtonRecovery();
    removeDuplicateVersionBadge();
    const observer = new MutationObserver(removeDuplicateVersionBadge);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    await ensureReviewModule();
    await recoverThenLoad(false).catch(error => {
      console.warn('[FASE 24B.4 V9] A recuperação automática aguardará o botão:', error.message);
    });

    root.achouLevouPhase24B4EntryV9 = {
      version: VERSION,
      directBotQueueEndpoint: true,
      recoverBeforeReview: true,
      normalizedQueueShapes: true,
      duplicateProtection: true,
      supervised: true,
      autoStart: false,
      whatsappSend: false,
      loadedAt: Date.now()
    };
  }

  boot().catch(error => {
    root.phase24B4V9Diagnostics = {
      ...(root.phase24B4V9Diagnostics || {}),
      version: VERSION,
      fatal: String(error?.message || error),
      failedAt: Date.now()
    };
    console.error('[FASE 24B.4 V9] Falha ao iniciar:', error);
  });
})();
