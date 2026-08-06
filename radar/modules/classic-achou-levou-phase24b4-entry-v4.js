(() => {
  'use strict';

  const VERSION = '4.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const SOURCE_PREFIX = 'phase24b3:';
  const B3_ENTRY = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b3-entry.js?v=1';
  const VERIFIED_TRANSFER = 'https://carvalho832-glitch.github.io/Bot-afiliados/verified-bot-transfer.js?v=2';
  const B4_MODULE = 'https://carvalho832-glitch.github.io/Bot-afiliados/radar/modules/classic-achou-levou-phase24b4-v2.js?v=4';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.achouLevouPhase24B4EntryVersion === VERSION) return;
  root.achouLevouPhase24B4EntryVersion = VERSION;

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();
  const messageOf = value => clean(value?.message || value?.mensagem || value?.texto || value?.text);
  const titleOf = value => clean(value?.title || value?.titulo || value?.produto || value?.name);
  const priceOfOffer = value => clean(value?.price || value?.preco || value?.precoPor || value?.priceText);

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
        throw new Error(json?.error || `HTTP ${response.status}`);
      }
      return json;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('A recuperação demorou demais.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function messageItems(batch) {
    return (Array.isArray(batch?.items) ? batch.items : [])
      .filter(item => item?.decision === 'approved' && clean(item?.affiliateUrl) && clean(item?.message));
  }

  function chooseBatch(batches) {
    return (Array.isArray(batches) ? batches : [])
      .filter(batch => messageItems(batch).length)
      .sort((a, b) => {
        const count = messageItems(b).length - messageItems(a).length;
        if (count) return count;
        return String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''));
      })[0] || null;
  }

  function priceOfItem(item) {
    const text = clean(item?.priceText);
    if (text) return text;
    const value = Number(item?.priceValue);
    return Number.isFinite(value)
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '';
  }

  function scanStorage(storage, label, output) {
    const seen = new Set();
    const visit = (value, depth = 0) => {
      if (!value || depth > 8 || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach(item => visit(item, depth + 1));
        return;
      }
      const sourceId = clean(value.sourceId);
      const link = clean(value.link || value.affiliateUrl);
      const message = messageOf(value);
      if (sourceId.startsWith(SOURCE_PREFIX) && link && message) {
        output.set(sourceId, {
          source: `phase24b4-storage-recovery-${label}`,
          sourceId,
          title: titleOf(value),
          price: priceOfOffer(value),
          oldPrice: clean(value.oldPrice || value.precoAntigo),
          coupon: clean(value.coupon || value.cupom),
          image: clean(value.image || value.imagem),
          link,
          message
        });
      }
      Object.values(value).forEach(item => visit(item, depth + 1));
    };

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const raw = storage.getItem(key);
      if (!raw || (!raw.includes('phase24b3:') && key !== 'ofertas_achou_levou')) continue;
      try { visit(JSON.parse(raw)); } catch {}
    }
  }

  async function recoverOffers() {
    const diagnostics = {
      version: VERSION,
      batchFound: false,
      batchMessages: 0,
      localCandidates: 0,
      serverBefore: 0,
      restored: 0,
      confirmed: 0,
      expected: 0,
      errors: []
    };

    const candidates = new Map();
    scanStorage(localStorage, 'local', candidates);
    scanStorage(sessionStorage, 'session', candidates);
    diagnostics.localCandidates = candidates.size;

    const [batchSettled, sharedSettled] = await Promise.allSettled([
      request(`/phase24/batches?profile=julio&t=${Date.now()}`),
      request(`/shared/offers?t=${Date.now()}`)
    ]);

    if (batchSettled.status === 'rejected') diagnostics.errors.push(`lotes: ${batchSettled.reason?.message || batchSettled.reason}`);
    if (sharedSettled.status === 'rejected') diagnostics.errors.push(`fila: ${sharedSettled.reason?.message || sharedSettled.reason}`);

    const batch = batchSettled.status === 'fulfilled'
      ? chooseBatch(batchSettled.value?.batches)
      : null;
    if (batch) {
      diagnostics.batchFound = true;
      diagnostics.batchMessages = messageItems(batch).length;
      for (const item of messageItems(batch)) {
        const sourceId = `${SOURCE_PREFIX}${batch.id}:${item.id}`;
        candidates.set(sourceId, {
          source: 'phase24b4-inline-batch-recovery',
          sourceId,
          title: clean(item.title),
          price: priceOfItem(item),
          oldPrice: '',
          coupon: '',
          image: clean(item.image),
          link: clean(item.affiliateUrl),
          message: clean(item.message)
        });
      }
    }

    const serverOffers = sharedSettled.status === 'fulfilled' && Array.isArray(sharedSettled.value?.offers)
      ? sharedSettled.value.offers
      : [];
    diagnostics.serverBefore = serverOffers.length;
    const existing = new Set(serverOffers.map(offer => clean(offer?.sourceId)));
    diagnostics.expected = candidates.size;

    for (const candidate of candidates.values()) {
      if (existing.has(candidate.sourceId)) continue;
      try {
        await request('/shared/offers', {
          method: 'POST',
          body: JSON.stringify(candidate)
        });
        diagnostics.restored += 1;
      } catch (error) {
        diagnostics.errors.push(`${candidate.sourceId}: ${error.message}`);
      }
    }

    const verified = await request(`/shared/offers?t=${Date.now()}`).catch(error => {
      diagnostics.errors.push(`verificação: ${error.message}`);
      return { offers: [] };
    });
    const verifiedIds = new Set(
      (Array.isArray(verified?.offers) ? verified.offers : [])
        .map(offer => clean(offer?.sourceId))
        .filter(sourceId => sourceId.startsWith(SOURCE_PREFIX))
    );
    diagnostics.confirmed = [...candidates.keys()].filter(sourceId => verifiedIds.has(sourceId)).length;
    diagnostics.ok = diagnostics.expected > 0 && diagnostics.confirmed >= diagnostics.expected;
    diagnostics.completedAt = Date.now();
    root.phase24B4InlineRecovery = diagnostics;
    return diagnostics;
  }

  (async () => {
    let recovery = null;
    try {
      if (!root.achouLevouPhase24B3EntryVersion) {
        await loadScript(B3_ENTRY, 'achou-levou-phase24b3-entry');
      }
      if (!window.AchouLevouVerifiedBotTransfer?.transferOffers) {
        await loadScript(VERIFIED_TRANSFER, 'achou-levou-verified-transfer');
      }

      recovery = await recoverOffers();
      if (!recovery.ok) console.warn('[FASE 24B.4] Recuperação inline incompleta:', recovery);

      await loadScript(B4_MODULE, 'achou-levou-phase24b4-v2-r4');
      root.achouLevouPhase24B4Entry = {
        version: VERSION,
        b3Preserved: true,
        verifiedTransferPreserved: true,
        inlineRecovery: true,
        recovery,
        supervisedTransfer: true,
        autoStart: false,
        whatsappSend: false,
        loadedAt: Date.now()
      };
    } catch (error) {
      root.phase24B4InlineRecovery = {
        ...(recovery || {}),
        ok: false,
        fatal: String(error?.message || error),
        failedAt: Date.now()
      };
      console.error('[FASE 24B.4] Falha no carregador inline:', error);
      try {
        await loadScript(B4_MODULE, 'achou-levou-phase24b4-v2-r4-fallback');
      } catch {}
    }
  })();
})();
