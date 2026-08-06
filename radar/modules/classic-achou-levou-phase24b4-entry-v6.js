(() => {
  'use strict';

  const VERSION = '6.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const SOURCE_PREFIX = 'phase24b3:';
  const V5_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-entry-v5.js?v=2';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4EntryV6Version === VERSION) {
    root.phase24B4Review?.loadState?.(true).catch(() => {});
    return;
  }
  root.achouLevouPhase24B4EntryV6Version = VERSION;

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const messageOf = offer => clean(offer?.message || offer?.mensagem || offer?.texto || offer?.text);
  const linkOf = offer => clean(offer?.link || offer?.affiliateUrl || offer?.url);

  function syntheticSourceId(offer, index) {
    const original = clean(offer?.sourceId);
    if (original.startsWith(SOURCE_PREFIX)) return original;
    const id = clean(offer?.id || offer?.fingerprint || `item-${index + 1}`)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120) || `item-${index + 1}`;
    return `${SOURCE_PREFIX}shared-fallback:${id}`;
  }

  function annotateSharedOffers(payload) {
    if (!payload?.ok || !Array.isArray(payload.offers)) return payload;
    const offers = payload.offers.map((offer, index) => {
      if (!linkOf(offer) || !messageOf(offer)) return offer;
      const sourceId = syntheticSourceId(offer, index);
      return {
        ...offer,
        sourceId,
        source: clean(offer?.source) || 'phase24b4-shared-fallback'
      };
    });
    const valid = offers.filter(offer =>
      clean(offer?.sourceId).startsWith(SOURCE_PREFIX) && linkOf(offer) && messageOf(offer)
    );
    root.phase24B4V6Diagnostics = {
      version: VERSION,
      sharedTotal: offers.length,
      reviewableTotal: valid.length,
      annotatedAt: Date.now()
    };
    return { ...payload, offers, count: offers.length };
  }

  function installFetchRepair() {
    if (root.phase24B4V6FetchRepairInstalled) return;
    root.phase24B4V6FetchRepairInstalled = true;
    const previousFetch = window.fetch.bind(window);

    window.fetch = async function phase24B4V6FetchRepair(input, init = {}) {
      const response = await previousFetch(input, init);
      const url = String(input?.url || input || '');
      const method = String(init?.method || 'GET').toUpperCase();
      if (method !== 'GET' || !url.startsWith(`${API_BASE}/shared/offers`) || !response.ok) {
        return response;
      }

      try {
        const payload = annotateSharedOffers(await response.clone().json());
        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        headers.delete('Content-Length');
        headers.delete('Content-Encoding');
        return new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch {
        return response;
      }
    };
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

  async function boot() {
    installFetchRepair();

    if (!root.achouLevouPhase24B4EntryVersion) {
      await loadScript(V5_MODULE, 'achou-levou-phase24b4-entry-v5-r2');
    }

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const review = root.phase24B4Review;
      if (review?.loadState) {
        clearInterval(timer);
        review.loadState(false).catch(error => {
          console.warn('[FASE 24B.4 V6] Revisão ainda não carregada:', error.message);
        });
      } else if (attempts >= 40) {
        clearInterval(timer);
      }
    }, 250);

    root.achouLevouPhase24B4EntryV6 = {
      version: VERSION,
      fallbackFromSharedQueue: true,
      nativeCacheBypass: true,
      supervised: true,
      autoStart: false,
      whatsappSend: false,
      loadedAt: Date.now()
    };
  }

  boot().catch(error => {
    root.phase24B4V6Diagnostics = {
      ...(root.phase24B4V6Diagnostics || {}),
      version: VERSION,
      fatal: String(error?.message || error),
      failedAt: Date.now()
    };
    console.error('[FASE 24B.4 V6] Falha ao iniciar reparo:', error);
  });
})();
