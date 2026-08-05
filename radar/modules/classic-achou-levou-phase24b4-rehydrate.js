(() => {
  'use strict';

  const VERSION = '1.0.0';
  const API_BASE = 'https://bot-afiliados-1fwi.onrender.com';
  const SOURCE_PREFIX = 'phase24b3:';
  const root = window.RadarClassicRemote = window.RadarClassicRemote || {};

  if (root.phase24B4RehydrateVersion === VERSION) return;
  root.phase24B4RehydrateVersion = VERSION;

  const clean = value => String(value ?? '').replace(/\r\n/g, '\n').trim();

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
    } finally {
      clearTimeout(timer);
    }
  }

  function messageItems(batch) {
    return (Array.isArray(batch?.items) ? batch.items : [])
      .filter(item => item.decision === 'approved' && clean(item.affiliateUrl) && clean(item.message));
  }

  function chooseBatch(batches) {
    return (Array.isArray(batches) ? batches : [])
      .filter(batch => messageItems(batch).length)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
  }

  function priceOf(item) {
    if (clean(item.priceText)) return clean(item.priceText);
    const value = Number(item.priceValue);
    return Number.isFinite(value)
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '';
  }

  async function restore() {
    const [batchResult, sharedResult] = await Promise.all([
      request(`/phase24/batches?profile=julio&t=${Date.now()}`),
      request(`/shared/offers?t=${Date.now()}`)
    ]);

    const batch = chooseBatch(batchResult.batches);
    if (!batch) return { ok: false, restored: 0, reason: 'no-batch' };

    const existing = new Set(
      (Array.isArray(sharedResult.offers) ? sharedResult.offers : [])
        .map(offer => clean(offer.sourceId))
    );

    let restored = 0;
    for (const item of messageItems(batch)) {
      const sourceId = `${SOURCE_PREFIX}${batch.id}:${item.id}`;
      if (existing.has(sourceId)) continue;

      await request('/shared/offers', {
        method: 'POST',
        body: JSON.stringify({
          source: 'phase24b4-recovery',
          sourceId,
          title: clean(item.title),
          price: priceOf(item),
          oldPrice: '',
          coupon: '',
          image: clean(item.image),
          link: clean(item.affiliateUrl),
          message: clean(item.message)
        })
      });
      restored += 1;
    }

    const verified = await request(`/shared/offers?t=${Date.now()}`);
    const phaseOffers = (Array.isArray(verified.offers) ? verified.offers : [])
      .filter(offer => clean(offer.sourceId).startsWith(`${SOURCE_PREFIX}${batch.id}:`));

    root.phase24B4Rehydrate = {
      version: VERSION,
      batchId: batch.id,
      expected: messageItems(batch).length,
      restored,
      confirmed: phaseOffers.length,
      completedAt: Date.now()
    };

    return {
      ok: phaseOffers.length >= messageItems(batch).length,
      restored,
      confirmed: phaseOffers.length,
      expected: messageItems(batch).length,
      batchId: batch.id
    };
  }

  root.phase24B4RestoreOffers = restore;
})();
