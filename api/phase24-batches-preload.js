import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = '/phase24/batches';
const MAX_BATCHES = Math.max(20, Number(process.env.PHASE24_BATCH_LIMIT || 120));
const MAX_ITEMS = Math.max(20, Number(process.env.PHASE24_ITEM_LIMIT || 80));
const originalUse = express.application.use;
let prototypePatched = false;
let writeChain = Promise.resolve();

function clean(value = '', max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function finiteNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProfile(value) {
  const profile = clean(value || 'julio', 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return profile || 'julio';
}

function candidateFiles() {
  const configured = clean(process.env.PHASE24_BATCHES_FILE, 1000);
  return [...new Set([
    configured,
    '/var/data/achou-levou/phase24-batches.json',
    path.join(process.cwd(), 'data', 'phase24-batches.json')
  ].filter(Boolean))];
}

function chooseDataFile() {
  for (const file of candidateFiles()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, `${JSON.stringify({ schema: 1, batches: [] }, null, 2)}\n`, 'utf8');
      }
      fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
      return file;
    } catch (error) {
      console.warn('[PHASE24] Armazenamento indisponível:', file, error.message);
    }
  }
  throw new Error('Nenhum armazenamento gravável disponível para os lotes da Fase 24.');
}

const DATA_FILE = chooseDataFile();

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      schema: 1,
      batches: Array.isArray(parsed?.batches) ? parsed.batches : []
    };
  } catch (error) {
    console.error('[PHASE24] Falha ao ler lotes:', error.message);
    return { schema: 1, batches: [] };
  }
}

function atomicWrite(store) {
  const normalized = {
    schema: 1,
    batches: Array.isArray(store?.batches) ? store.batches.slice(0, MAX_BATCHES) : []
  };
  const temporary = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, DATA_FILE);
}

function enqueueWrite(operation) {
  const next = writeChain.then(operation, operation);
  writeChain = next.catch(() => {});
  return next;
}

function itemFingerprint(item) {
  return crypto.createHash('sha256')
    .update(`${clean(item.url, 4000)}\n${clean(item.title, 1000)}`)
    .digest('hex');
}

function normalizeItem(input = {}, index = 0) {
  const title = clean(input.title || input.titulo || input.name, 1000);
  const url = clean(input.url || input.productUrl || input.link, 4000);
  if (!title || !url || !/^https:\/\//i.test(url)) return null;

  const fingerprint = clean(input.fingerprint, 100) || itemFingerprint({ title, url });
  return {
    id: clean(input.id, 160) || fingerprint.slice(0, 24),
    sourceId: clean(input.sourceId || input.productId || input.itemId, 300),
    fingerprint,
    position: Math.max(0, Number(input.position ?? index)),
    title,
    url,
    image: clean(input.image || input.imageUrl || input.imagem, 4000),
    priceText: clean(input.priceText || input.price || input.preco, 120),
    priceValue: finiteNumber(input.priceValue ?? input.priceNumber ?? input.valor),
    soldText: clean(input.soldText || input.sold || input.vendidos, 120),
    soldCount: finiteNumber(input.soldCount ?? input.sales ?? input.quantidadeVendida),
    rating: finiteNumber(input.rating ?? input.nota),
    commissionText: clean(input.commissionText || input.commission || input.comissao, 120),
    commissionValue: finiteNumber(input.commissionValue ?? input.commissionNumber),
    niche: clean(input.niche || input.nicho, 120),
    decision: ['approved', 'rejected'].includes(input.decision) ? input.decision : 'pending',
    stage: clean(input.stage || 'captured', 80),
    affiliateUrl: clean(input.affiliateUrl, 4000),
    message: clean(input.message || input.mensagem, 20000),
    reason: clean(input.reason || input.motivo, 500),
    createdAt: clean(input.createdAt, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeFilters(input = {}) {
  return {
    keywords: clean(input.keywords || input.palavras || '', 500),
    minPrice: finiteNumber(input.minPrice ?? input.precoMinimo),
    maxPrice: finiteNumber(input.maxPrice ?? input.precoMaximo),
    minSold: Math.max(0, finiteNumber(input.minSold ?? input.vendasMinimas, 0)),
    minRating: Math.max(0, finiteNumber(input.minRating ?? input.notaMinima, 0)),
    maxItems: Math.min(MAX_ITEMS, Math.max(1, finiteNumber(input.maxItems ?? input.quantidade, 15))),
    niches: Array.isArray(input.niches)
      ? input.niches.map(value => clean(value, 80)).filter(Boolean).slice(0, 20)
      : []
  };
}

function summarize(batch) {
  const items = Array.isArray(batch?.items) ? batch.items : [];
  return {
    total: items.length,
    pending: items.filter(item => item.decision === 'pending').length,
    approved: items.filter(item => item.decision === 'approved').length,
    rejected: items.filter(item => item.decision === 'rejected').length,
    linksReady: items.filter(item => item.affiliateUrl).length,
    messagesReady: items.filter(item => item.message).length
  };
}

function normalizeBatch(input = {}) {
  const profile = normalizeProfile(input.profile || input.perfil);
  const unique = new Map();
  for (const [index, raw] of (Array.isArray(input.items) ? input.items : []).entries()) {
    const item = normalizeItem(raw, index);
    if (item && !unique.has(item.fingerprint)) unique.set(item.fingerprint, item);
    if (unique.size >= MAX_ITEMS) break;
  }
  const items = [...unique.values()];
  if (!items.length) throw new Error('Nenhum produto válido foi encontrado para o lote.');

  const now = new Date().toISOString();
  const batch = {
    id: clean(input.id, 160) || crypto.randomUUID(),
    profile,
    source: clean(input.source || 'shopee-affiliates', 120),
    sourceUrl: clean(input.sourceUrl || input.url, 4000),
    status: ['draft', 'reviewed', 'approved', 'processing', 'completed', 'archived']
      .includes(input.status) ? input.status : 'draft',
    filters: normalizeFilters(input.filters || {}),
    items,
    createdAt: clean(input.createdAt, 100) || now,
    updatedAt: now
  };
  batch.summary = summarize(batch);
  return batch;
}

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

function withSummary(batch) {
  if (!batch) return batch;
  return { ...batch, summary: summarize(batch) };
}

function installRoutes(router) {
  router.get(`${ROUTE}/health`, (_req, res) => {
    noCache(res);
    const store = readStore();
    res.json({
      ok: true,
      service: 'Radar IA Phase 24 Batches',
      batches: store.batches.length,
      storage: DATA_FILE.startsWith('/var/data/') ? 'persistent-disk' : 'local-filesystem'
    });
  });

  router.get(ROUTE, (req, res) => {
    noCache(res);
    const profile = normalizeProfile(req.query.profile);
    const batches = readStore().batches
      .filter(batch => normalizeProfile(batch.profile) === profile)
      .map(withSummary);
    if (req.query.current === '1') {
      const current = batches.find(batch => !['completed', 'archived'].includes(batch.status)) || batches[0] || null;
      return res.json({ ok: true, profile, batch: current });
    }
    return res.json({ ok: true, profile, count: batches.length, batches });
  });

  router.get(`${ROUTE}/:id`, (req, res) => {
    noCache(res);
    const batch = readStore().batches.find(item => item.id === clean(req.params.id, 160));
    if (!batch) return res.status(404).json({ ok: false, error: 'Lote não encontrado.' });
    return res.json({ ok: true, batch: withSummary(batch) });
  });

  router.post(ROUTE, async (req, res) => {
    noCache(res);
    let incoming;
    try {
      incoming = normalizeBatch(req.body || {});
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    try {
      const result = await enqueueWrite(() => {
        const store = readStore();
        const replaceCurrent = req.body?.replaceCurrent !== false;
        if (replaceCurrent) {
          store.batches = store.batches.map(batch => {
            if (normalizeProfile(batch.profile) !== incoming.profile) return batch;
            if (['completed', 'archived'].includes(batch.status)) return batch;
            return { ...batch, status: 'archived', updatedAt: new Date().toISOString() };
          });
        }
        store.batches = [incoming, ...store.batches].slice(0, MAX_BATCHES);
        atomicWrite(store);
        return withSummary(incoming);
      });
      return res.status(201).json({ ok: true, created: true, batch: result });
    } catch (error) {
      console.error('[PHASE24] Falha ao criar lote:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível gravar o lote de garimpo.' });
    }
  });

  router.patch(`${ROUTE}/:id`, async (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 160);
    try {
      const result = await enqueueWrite(() => {
        const store = readStore();
        const index = store.batches.findIndex(batch => batch.id === id);
        if (index < 0) return null;
        const current = store.batches[index];
        const next = {
          ...current,
          status: ['draft', 'reviewed', 'approved', 'processing', 'completed', 'archived']
            .includes(req.body?.status) ? req.body.status : current.status,
          filters: req.body?.filters ? normalizeFilters(req.body.filters) : current.filters,
          updatedAt: new Date().toISOString()
        };
        if (Array.isArray(req.body?.decisions)) {
          const decisions = new Map(req.body.decisions.map(entry => [clean(entry.id, 160), entry]));
          next.items = current.items.map(item => {
            const decision = decisions.get(item.id);
            if (!decision) return item;
            return {
              ...item,
              decision: ['pending', 'approved', 'rejected'].includes(decision.decision)
                ? decision.decision : item.decision,
              reason: clean(decision.reason ?? item.reason, 500),
              updatedAt: new Date().toISOString()
            };
          });
        }
        next.summary = summarize(next);
        store.batches[index] = next;
        atomicWrite(store);
        return withSummary(next);
      });
      if (!result) return res.status(404).json({ ok: false, error: 'Lote não encontrado.' });
      return res.json({ ok: true, batch: result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar o lote.' });
    }
  });

  router.patch(`${ROUTE}/:id/items/:itemId`, async (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 160);
    const itemId = clean(req.params.itemId, 160);
    try {
      const result = await enqueueWrite(() => {
        const store = readStore();
        const batchIndex = store.batches.findIndex(batch => batch.id === id);
        if (batchIndex < 0) return null;
        const batch = store.batches[batchIndex];
        const itemIndex = batch.items.findIndex(item => item.id === itemId);
        if (itemIndex < 0) return null;
        const item = batch.items[itemIndex];
        batch.items[itemIndex] = {
          ...item,
          decision: ['pending', 'approved', 'rejected'].includes(req.body?.decision)
            ? req.body.decision : item.decision,
          stage: clean(req.body?.stage ?? item.stage, 80),
          affiliateUrl: clean(req.body?.affiliateUrl ?? item.affiliateUrl, 4000),
          message: clean(req.body?.message ?? item.message, 20000),
          reason: clean(req.body?.reason ?? item.reason, 500),
          updatedAt: new Date().toISOString()
        };
        batch.updatedAt = new Date().toISOString();
        batch.summary = summarize(batch);
        store.batches[batchIndex] = batch;
        atomicWrite(store);
        return { batch: withSummary(batch), item: batch.items[itemIndex] };
      });
      if (!result) return res.status(404).json({ ok: false, error: 'Lote ou produto não encontrado.' });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar o produto.' });
    }
  });
}

if (!prototypePatched) {
  prototypePatched = true;
  express.application.use = function phase24AwareUse(...args) {
    const middleware = args.length === 1 ? args[0] : null;
    const isFinalAsyncProxy = typeof middleware === 'function' &&
      middleware.constructor?.name === 'AsyncFunction' &&
      /req\.originalUrl|GATEWAY_URL/.test(Function.prototype.toString.call(middleware));

    if (isFinalAsyncProxy && !this.locals.__phase24BatchesInstalled) {
      const router = express.Router();
      installRoutes(router);
      originalUse.call(this, router);
      this.locals.__phase24BatchesInstalled = true;
      console.log('[PHASE24] Rotas de lotes registradas antes do proxy final.', {
        route: ROUTE,
        storage: DATA_FILE
      });
    }

    return originalUse.apply(this, args);
  };
}
