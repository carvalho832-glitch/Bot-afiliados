(() => {
  'use strict';

  const VERSION = '10.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const REVIEW_SOURCE = '/bot/queue/review-source';
  const SOURCE_PREFIX = 'phase24b3:';
  const BOT_BATCH_ID = 'bot-queue';
  const BUTTON_ID = 'radar-phase24b4-review-button';
  const PANEL_ID = 'radar-phase24b4-review-panel';
  const V6_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-entry-v6.js?v=6';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4EntryV10Version === VERSION) return;
  root.achouLevouPhase24B4EntryV10Version = VERSION;

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let actionRunning = false;

  function toast(message, kind = 'ok', duration = 10000) {
    document.getElementById('radar-phase24b4-v10-toast')?.remove();
    const element = document.createElement('div');
    element.id = 'radar-phase24b4-v10-toast';
    element.textContent = message;
    const palette = kind === 'error'
      ? 'background:#7f1d1d;color:#fee2e2;border:1px solid #fb7185'
      : kind === 'warning'
        ? 'background:#78350f;color:#ffedd5;border:1px solid #fb923c'
        : 'background:#064e3b;color:#d1fae5;border:1px solid #34d399';
    element.style.cssText = `position:fixed;left:50%;bottom:188px;transform:translateX(-50%);z-index:2147483647;max-width:calc(100% - 28px);padding:13px 17px;border-radius:14px;font:800 13px/1.4 system-ui;text-align:center;box-shadow:0 12px 36px #0008;${palette}`;
    document.documentElement.appendChild(element);
    setTimeout(() => element.remove(), duration);
  }

  function safeId(value, fallback) {
    return clean(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120) || fallback;
  }

  function itemMessage(item = {}) {
    return clean(item.message || item.text || item.texto || item.content || item.body);
  }

  function extractLink(message, item = {}) {
    const explicit = clean(item.link || item.url || item.affiliateUrl || item.linkOferta);
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
      let payload = null;
      try { payload = JSON.parse(text); } catch {}
      if (!response.ok || !payload?.ok) {
        const error = new Error(payload?.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A leitura da mensagem do robô demorou demais.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function sourceItems(payload = {}) {
    const arrays = [payload.items, payload.queue?.items, payload.data?.items].filter(Array.isArray);
    return arrays[0] || [];
  }

  function offerFromSourceItem(item, index) {
    const message = itemMessage(item);
    const link = extractLink(message, item);
    if (!message || !link) return null;
    const itemId = safeId(item.id || item.offerId || item.queueId, `item-${index + 1}`);
    return {
      id: `bot-queue-${itemId}`,
      source: 'phase24b4-review-source-v10',
      sourceId: `${SOURCE_PREFIX}${BOT_BATCH_ID}:${itemId}`,
      title: titleFromMessage(message, index),
      price: clean(item.price || item.preco),
      oldPrice: clean(item.oldPrice || item.precoAntigo),
      coupon: clean(item.coupon || item.cupom),
      image: clean(item.image || item.imagem),
      link,
      message,
      createdAt: clean(item.createdAt) || new Date().toISOString(),
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

  function mergeOffers(existing, recovered) {
    const merged = new Map();
    for (const offer of [...existing, ...recovered]) {
      const key = clean(offer?.sourceId) || clean(offer?.id) || `${clean(offer?.link)}\n${itemMessage(offer)}`;
      if (!key) continue;
      merged.set(key, { ...(merged.get(key) || {}), ...offer });
    }
    return [...merged.values()];
  }

  function writeLocal(offers) {
    const merged = mergeOffers(readLocalOffers(), offers);
    if (window.AchouLevouSharedOffers?.writeLocal) {
      window.AchouLevouSharedOffers.writeLocal(merged);
    } else {
      localStorage.setItem('ofertas_achou_levou', JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('achoulevou:ofertas-atualizadas', {
        detail: { total: merged.length, recoveredFromReviewSource: true }
      }));
    }
  }

  function installFetchBridge(offers) {
    root.phase24B4V10RecoveredOffers = offers;
    if (root.phase24B4V10FetchBridgeInstalled) return;
    root.phase24B4V10FetchBridgeInstalled = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = async function phase24B4V10FetchBridge(input, init = {}) {
      const response = await previousFetch(input, init);
      const url = String(input?.url || input || '');
      const method = String(init?.method || 'GET').toUpperCase();

      if (method === 'GET' && url.startsWith(`${API_BASE}/shared/offers`) && response.ok) {
        try {
          const payload = await response.clone().json();
          if (!payload?.ok || !Array.isArray(payload.offers)) return response;
          const merged = mergeOffers(payload.offers, root.phase24B4V10RecoveredOffers || []);
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
          for (const offer of root.phase24B4V10RecoveredOffers || []) {
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

  async function persistOffer(offer) {
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

  async function recoverFromSource() {
    const diagnostics = {
      version: VERSION,
      endpoint: REVIEW_SOURCE,
      sourceReady: false,
      sourceItems: 0,
      recoveredOffers: 0,
      persistedOffers: 0,
      skippedWithoutLink: 0,
      errors: []
    };

    const payload = await requestJson(`${API_BASE}${REVIEW_SOURCE}?t=${Date.now()}`);
    diagnostics.sourceReady = payload.sourceReady === true || payload.ok === true;
    const items = sourceItems(payload);
    diagnostics.sourceItems = items.length;
    const recovered = items.map(offerFromSourceItem).filter(Boolean);
    diagnostics.skippedWithoutLink = items.length - recovered.length;
    diagnostics.recoveredOffers = recovered.length;

    installFetchBridge(recovered);
    if (!recovered.length) {
      root.phase24B4V10Diagnostics = { ...diagnostics, completedAt: Date.now() };
      return recovered;
    }

    writeLocal(recovered);
    for (const offer of recovered) {
      try {
        await persistOffer(offer);
        diagnostics.persistedOffers += 1;
      } catch (error) {
        diagnostics.errors.push(`${offer.sourceId}: ${error.message}`);
      }
    }
    await window.AchouLevouSharedOffers?.load?.({ apply: true }).catch(() => null);
    root.phase24B4V10Diagnostics = { ...diagnostics, completedAt: Date.now() };
    return recovered;
  }

  async function ensureReviewModule() {
    if (!root.achouLevouPhase24B4EntryV6Version) {
      await loadScript(V6_MODULE, 'achou-levou-phase24b4-entry-v6-r6');
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (root.phase24B4Review?.loadState) return root.phase24B4Review;
      await sleep(250);
    }
    throw new Error('O módulo de revisão não terminou de carregar.');
  }

  function friendlyError(error) {
    if (error?.status === 404 || error?.payload?.sourceReady === false) {
      return 'O servidor do WhatsApp ainda não publicou a fonte de revisão.';
    }
    return clean(error?.message || error || 'Falha desconhecida.');
  }

  async function recoverThenReview(showToast = true) {
    const recovered = await recoverFromSource();
    const diagnostics = root.phase24B4V10Diagnostics || {};
    if (!recovered.length) {
      if (diagnostics.sourceItems > 0 && diagnostics.skippedWithoutLink > 0) {
        throw new Error('A mensagem foi encontrada, mas não contém um link reconhecível.');
      }
      throw new Error('A fonte do robô não retornou nenhuma oferta pendente.');
    }

    const review = await ensureReviewModule();
    await review.loadState(false);
    if (showToast) toast(`✅ ${recovered.length} oferta(s) recuperada(s) da fila real do robô.`);
    document.getElementById(PANEL_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return recovered;
  }

  function installButtonHandler() {
    if (root.phase24B4V10ButtonInstalled) return;
    root.phase24B4V10ButtonInstalled = true;
    document.addEventListener('click', async event => {
      const button = event.target?.closest?.(`#${BUTTON_ID}`);
      if (!button || actionRunning) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      actionRunning = true;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = '🔐 Lendo mensagem do robô...';
      try {
        await recoverThenReview(true);
      } catch (error) {
        toast(`Não foi possível montar a revisão: ${friendlyError(error)}`, 'error', 13000);
      } finally {
        actionRunning = false;
        button.disabled = false;
        if (root.phase24B4Review?.summary) {
          const totals = root.phase24B4Review.summary();
          button.textContent = `🛡️ Revisão 24B (${totals.pending || 0})`;
        } else {
          button.textContent = original;
        }
      }
    }, true);
  }

  function removeDuplicateVersionBadge() {
    const title = document.querySelector('.app-header h1');
    if (!title) return;
    [...title.querySelectorAll('sup')].slice(1).forEach(badge => badge.remove());
  }

  async function boot() {
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    installButtonHandler();
    removeDuplicateVersionBadge();
    new MutationObserver(removeDuplicateVersionBadge)
      .observe(document.documentElement, { childList: true, subtree: true });

    await ensureReviewModule();
    recoverThenReview(false).catch(error => {
      root.phase24B4V10Diagnostics = {
        ...(root.phase24B4V10Diagnostics || {}),
        version: VERSION,
        autoRecoveryError: friendlyError(error),
        failedAt: Date.now()
      };
      console.warn('[FASE 24B.4 V10] Recuperação automática aguardará o botão:', friendlyError(error));
    });

    root.achouLevouPhase24B4EntryV10 = {
      version: VERSION,
      secureReviewSource: true,
      recoverBeforeReview: true,
      alreadyQueuedMarkedSent: true,
      duplicateProtection: true,
      supervised: true,
      autoStart: false,
      whatsappSend: false,
      loadedAt: Date.now()
    };
  }

  boot().catch(error => {
    root.phase24B4V10Diagnostics = {
      ...(root.phase24B4V10Diagnostics || {}),
      version: VERSION,
      fatal: friendlyError(error),
      failedAt: Date.now()
    };
    console.error('[FASE 24B.4 V10] Falha ao iniciar:', error);
  });
})();
