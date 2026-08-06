(() => {
  'use strict';

  const VERSION = '8.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const SOURCE_PREFIX = 'phase24b3:';
  const BOT_BATCH_ID = 'bot-queue';
  const V6_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-entry-v6.js?v=4';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4EntryV8Version === VERSION) {
    root.phase24B4Review?.loadState?.(true).catch(() => {});
    return;
  }
  root.achouLevouPhase24B4EntryV8Version = VERSION;

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function safeId(value, fallback) {
    return clean(value)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120) || fallback;
  }

  function extractLink(message) {
    const match = clean(message).match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0].replace(/[),.;!?]+$/g, '') : '';
  }

  function titleFromMessage(message, index) {
    const lines = clean(message)
      .split('\n')
      .map(line => clean(line))
      .filter(Boolean);
    const title = lines.find(line => !/^https?:\/\//i.test(line) && !/^(ver agora|compre aqui|garanta|aproveite)/i.test(line));
    return clean(title || `Oferta recuperada ${index + 1}`).slice(0, 240);
  }

  async function request(path, options = {}, timeoutMs = 30000) {
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
      if (!response.ok || !json?.ok) throw new Error(json?.error || `HTTP ${response.status}`);
      return json;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A recuperação da fila demorou demais.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

  async function waitForBotQueue() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (window.AchouLevouBotQueue?.getOverview) return window.AchouLevouBotQueue;
      await sleep(250);
    }
    throw new Error('A ponte da fila do robô não carregou.');
  }

  function queueItemsFromOverview(overview) {
    const queue = overview?.queue?.queue || overview?.queue || {};
    return Array.isArray(queue?.items) ? queue.items : [];
  }

  function offerFromQueueItem(item, index) {
    const message = clean(item?.message || item?.text || item?.texto);
    const link = extractLink(message);
    if (!message || !link) return null;
    const itemId = safeId(item?.id, `item-${index + 1}`);
    return {
      id: `bot-queue-${itemId}`,
      source: 'phase24b4-recovered-from-bot-queue',
      sourceId: `${SOURCE_PREFIX}${BOT_BATCH_ID}:${itemId}`,
      title: titleFromMessage(message, index),
      price: '',
      oldPrice: '',
      coupon: '',
      image: '',
      link,
      message,
      createdAt: clean(item?.createdAt) || new Date().toISOString(),
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
      const key = sourceId || clean(offer?.id) || `${clean(offer?.link)}\n${clean(offer?.message || offer?.mensagem || offer?.texto)}`;
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
        detail: { total: merged.length, recoveredFromBotQueue: true }
      }));
    }
    return merged;
  }

  function installRecoveredFetchBridge(offers) {
    if (root.phase24B4V8FetchBridgeInstalled) {
      root.phase24B4V8RecoveredOffers = offers;
      return;
    }
    root.phase24B4V8FetchBridgeInstalled = true;
    root.phase24B4V8RecoveredOffers = offers;
    const previousFetch = window.fetch.bind(window);

    window.fetch = async function phase24B4V8FetchBridge(input, init = {}) {
      const response = await previousFetch(input, init);
      const url = String(input?.url || input || '');
      const method = String(init?.method || 'GET').toUpperCase();

      if (method === 'GET' && url.startsWith(`${API_BASE}/shared/offers`) && response.ok) {
        try {
          const payload = await response.clone().json();
          if (!payload?.ok || !Array.isArray(payload.offers)) return response;
          const merged = mergeBySourceId(payload.offers, root.phase24B4V8RecoveredOffers || []);
          const headers = new Headers(response.headers);
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.delete('Content-Length');
          headers.delete('Content-Encoding');
          return new Response(JSON.stringify({ ...payload, offers: merged, count: merged.length }), {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        } catch {
          return response;
        }
      }

      if (method === 'GET' && url.startsWith(`${API_BASE}/phase24/reviews`) && response.ok) {
        try {
          const payload = await response.clone().json();
          if (!payload?.ok || !Array.isArray(payload.reviews)) return response;
          const reviews = [...payload.reviews];
          const known = new Set(reviews.map(review => clean(review?.sourceId)));
          for (const offer of root.phase24B4V8RecoveredOffers || []) {
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
        } catch {
          return response;
        }
      }

      return response;
    };
  }

  async function persistRecoveredOffer(offer) {
    await request('/shared/offers', {
      method: 'POST',
      body: JSON.stringify(offer)
    });

    await request(`/phase24/reviews/${encodeURIComponent(offer.sourceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        batchId: BOT_BATCH_ID,
        sourceId: offer.sourceId,
        offerId: offer.id,
        status: 'sent'
      })
    }).catch(() => null);
  }

  async function recoverFromBotQueue() {
    const diagnostics = {
      version: VERSION,
      queueRead: false,
      queueItems: 0,
      pendingItems: 0,
      recoveredOffers: 0,
      persistedOffers: 0,
      skippedWithoutLink: 0,
      errors: []
    };

    const botQueue = await waitForBotQueue();
    const overview = await botQueue.getOverview({ force: true });
    diagnostics.queueRead = true;
    const items = queueItemsFromOverview(overview);
    diagnostics.queueItems = items.length;

    const pending = items.filter(item => clean(item?.status).toLowerCase() !== 'sent' && clean(item?.message));
    diagnostics.pendingItems = pending.length;
    const recovered = pending.map(offerFromQueueItem).filter(Boolean);
    diagnostics.skippedWithoutLink = pending.length - recovered.length;
    diagnostics.recoveredOffers = recovered.length;

    if (!recovered.length) {
      root.phase24B4V8Diagnostics = { ...diagnostics, completedAt: Date.now() };
      return recovered;
    }

    writeRecoveredLocally(recovered);
    installRecoveredFetchBridge(recovered);

    for (const offer of recovered) {
      try {
        await persistRecoveredOffer(offer);
        diagnostics.persistedOffers += 1;
      } catch (error) {
        diagnostics.errors.push(`${offer.sourceId}: ${error.message}`);
      }
    }

    if (diagnostics.persistedOffers === recovered.length) {
      await window.AchouLevouSharedOffers?.load?.({ apply: true }).catch(() => null);
    }

    root.phase24B4V8Diagnostics = { ...diagnostics, completedAt: Date.now() };
    return recovered;
  }

  async function boot() {
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    await sleep(350);

    let recovered = [];
    try {
      recovered = await recoverFromBotQueue();
    } catch (error) {
      root.phase24B4V8Diagnostics = {
        version: VERSION,
        fatalRecovery: String(error?.message || error),
        failedAt: Date.now()
      };
      console.warn('[FASE 24B.4 V8] Não foi possível ler a fila do robô:', error.message);
    }

    if (!root.achouLevouPhase24B4EntryV6Version) {
      await loadScript(V6_MODULE, 'achou-levou-phase24b4-entry-v6-r4');
    }

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (root.phase24B4Review?.loadState) {
        await root.phase24B4Review.loadState(Boolean(recovered.length)).catch(error => {
          console.warn('[FASE 24B.4 V8] Revisão ainda não carregada:', error.message);
        });
        break;
      }
      await sleep(250);
    }

    root.achouLevouPhase24B4EntryV8 = {
      version: VERSION,
      recoveryFromBotQueue: true,
      recoveredCount: recovered.length,
      alreadyQueuedItemsMarkedSent: true,
      duplicateProtection: true,
      supervised: true,
      autoStart: false,
      whatsappSend: false,
      loadedAt: Date.now()
    };
  }

  boot().catch(error => {
    root.phase24B4V8Diagnostics = {
      ...(root.phase24B4V8Diagnostics || {}),
      version: VERSION,
      fatal: String(error?.message || error),
      failedAt: Date.now()
    };
    console.error('[FASE 24B.4 V8] Falha ao iniciar recuperação:', error);
  });
})();
