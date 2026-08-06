import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = '/phase24/autopilot';
const MAX_RUNS = Math.max(20, Number(process.env.PHASE24_AUTOPILOT_RUN_LIMIT || 120));
const MAX_ITEMS = Math.max(100, Number(process.env.PHASE24_AUTOPILOT_ITEM_LIMIT || 400));
const originalUse = express.application.use;
let prototypePatched = false;
let writeChain = Promise.resolve();

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);
const ALLOWED_STATUSES = new Set(['ready', 'running', 'paused', 'completed', 'cancelled', 'failed']);
const ALLOWED_STAGES = new Set(['garimpo', 'link', 'achou-levou', 'completed', 'paused', 'failed']);

function clean(value = '', max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function finiteNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampInteger(value, min, max, fallback) {
  const number = finiteNumber(value, fallback);
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeProfile(value) {
  const profile = clean(value || 'julio', 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return profile || 'julio';
}

function candidateFiles() {
  const configured = clean(process.env.PHASE24_AUTOPILOT_FILE, 1000);
  return [...new Set([
    configured,
    '/var/data/achou-levou/phase24-autopilot.json',
    path.join(process.cwd(), 'data', 'phase24-autopilot.json')
  ].filter(Boolean))];
}

function chooseDataFile() {
  for (const file of candidateFiles()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, `${JSON.stringify({ schema: 1, runs: [] }, null, 2)}\n`, 'utf8');
      }
      fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
      return file;
    } catch (error) {
      console.warn('[PHASE24-AUTOPILOT] Armazenamento indisponível:', file, error.message);
    }
  }
  throw new Error('Nenhum armazenamento gravável disponível para o piloto automático.');
}

const DATA_FILE = chooseDataFile();

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { schema: 1, runs: Array.isArray(parsed?.runs) ? parsed.runs : [] };
  } catch (error) {
    console.error('[PHASE24-AUTOPILOT] Falha ao ler execuções:', error.message);
    return { schema: 1, runs: [] };
  }
}

function atomicWrite(store) {
  const normalized = {
    schema: 1,
    runs: Array.isArray(store?.runs) ? store.runs.slice(0, MAX_RUNS) : []
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

function normalizeFilters(input = {}) {
  return {
    keywords: clean(input.keywords || input.palavras || '', 500),
    minPrice: finiteNumber(input.minPrice ?? input.precoMinimo),
    maxPrice: finiteNumber(input.maxPrice ?? input.precoMaximo),
    minSold: Math.max(0, finiteNumber(input.minSold ?? input.vendasMinimas, 0)),
    minRating: Math.max(0, finiteNumber(input.minRating ?? input.notaMinima, 0)),
    niches: Array.isArray(input.niches)
      ? input.niches.map(value => clean(value, 80)).filter(Boolean).slice(0, 30)
      : []
  };
}

function fingerprintOf(item = {}) {
  return crypto.createHash('sha256')
    .update(`${clean(item.url, 4000)}\n${clean(item.title, 1000)}`)
    .digest('hex');
}

function normalizeAttempts(value = {}) {
  return {
    link: clampInteger(value?.link, 0, 20, 0),
    offer: clampInteger(value?.offer, 0, 20, 0)
  };
}

function normalizeProductData(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    title: clean(value.title || value.produto, 1000),
    price: clean(value.price || value.precoPor, 120),
    oldPrice: clean(value.oldPrice || value.precoDe, 120),
    coupon: clean(value.coupon || value.cupom || value.desconto, 500),
    image: clean(value.image || value.imagem, 4000),
    shopId: clean(value.shopId, 120),
    itemId: clean(value.itemId, 120),
    resolvedUrl: clean(value.resolvedUrl || value.linkCompleto || value.linkOferta, 4000)
  };
}

function normalizeItem(input = {}, index = 0) {
  const title = clean(input.title || input.titulo || input.name, 1000);
  const url = clean(input.url || input.productUrl || input.link, 4000);
  if (!title || !url || !/^https:\/\//i.test(url)) return null;

  const fingerprint = clean(input.fingerprint, 100) || fingerprintOf({ title, url });
  const now = new Date().toISOString();
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
    decision: input.decision === 'rejected' ? 'rejected' : 'approved',
    stage: clean(input.stage || 'candidate', 80),
    affiliateUrl: clean(input.affiliateUrl, 4000),
    message: clean(input.message || input.mensagem, 20000),
    savedOfferId: clean(input.savedOfferId || input.offerId, 200),
    productData: normalizeProductData(input.productData || {}),
    attempts: normalizeAttempts(input.attempts || {}),
    lastError: clean(input.lastError || input.error, 1000),
    reason: clean(input.reason || input.motivo, 1000),
    createdAt: clean(input.createdAt, 100) || now,
    updatedAt: clean(input.updatedAt, 100) || now,
    completedAt: clean(input.completedAt, 100),
    failedAt: clean(input.failedAt, 100)
  };
}

function countsFor(run = {}) {
  const items = Array.isArray(run.items) ? run.items : [];
  return {
    candidates: items.filter(item => item.decision === 'approved').length,
    rejected: items.filter(item => item.decision === 'rejected').length,
    linksReady: items.filter(item => Boolean(item.affiliateUrl)).length,
    success: items.filter(item => item.stage === 'saved-verified' && item.savedOfferId).length,
    failures: items.filter(item => /^failed-/.test(item.stage)).length,
    pending: items.filter(item => item.decision === 'approved' && item.stage !== 'saved-verified' && !/^failed-/.test(item.stage)).length
  };
}

function appendEvent(run, input = {}) {
  const message = clean(input.message || input.event || '', 1000);
  if (!message) return;
  const event = {
    at: new Date().toISOString(),
    type: clean(input.type || 'info', 40),
    itemId: clean(input.itemId || run.currentItemId, 160),
    message
  };
  run.events = [event, ...(Array.isArray(run.events) ? run.events : [])].slice(0, 200);
}

function withSummary(run) {
  if (!run) return null;
  const counts = countsFor(run);
  return {
    ...run,
    successCount: counts.success,
    failureCount: counts.failures,
    summary: counts
  };
}

function normalizeRun(input = {}) {
  const now = new Date().toISOString();
  const target = clampInteger(input.target ?? input.quantidade ?? input.maxItems, 1, 200, 15);
  const run = {
    id: clean(input.id, 160) || crypto.randomUUID(),
    profile: normalizeProfile(input.profile || input.perfil),
    target,
    filters: normalizeFilters(input.filters || input),
    status: ALLOWED_STATUSES.has(input.status) ? input.status : 'ready',
    stage: ALLOWED_STAGES.has(input.stage) ? input.stage : 'garimpo',
    sourceUrl: clean(input.sourceUrl, 4000),
    batchLabel: clean(input.batchLabel || `Produção de ${target} ofertas`, 200),
    currentItemId: clean(input.currentItemId, 160),
    items: [],
    events: [],
    lastError: clean(input.lastError, 1000),
    createdAt: clean(input.createdAt, 100) || now,
    startedAt: clean(input.startedAt, 100),
    completedAt: clean(input.completedAt, 100),
    updatedAt: now
  };
  for (const [index, raw] of (Array.isArray(input.items) ? input.items : []).entries()) {
    const item = normalizeItem(raw, index);
    if (item && !run.items.some(existing => existing.fingerprint === item.fingerprint)) run.items.push(item);
    if (run.items.length >= MAX_ITEMS) break;
  }
  appendEvent(run, { type: 'created', message: `Execução criada para ${target} oferta(s).` });
  return withSummary(run);
}

function patchRun(current, body = {}) {
  const now = new Date().toISOString();
  const next = {
    ...current,
    status: ALLOWED_STATUSES.has(body.status) ? body.status : current.status,
    stage: ALLOWED_STAGES.has(body.stage) ? body.stage : current.stage,
    target: body.target === undefined ? current.target : clampInteger(body.target, 1, 200, current.target),
    filters: body.filters ? normalizeFilters(body.filters) : current.filters,
    sourceUrl: body.sourceUrl === undefined ? current.sourceUrl : clean(body.sourceUrl, 4000),
    currentItemId: body.currentItemId === undefined ? current.currentItemId : clean(body.currentItemId, 160),
    lastError: body.lastError === undefined ? current.lastError : clean(body.lastError, 1000),
    startedAt: body.startedAt === undefined ? current.startedAt : clean(body.startedAt, 100),
    completedAt: body.completedAt === undefined ? current.completedAt : clean(body.completedAt, 100),
    updatedAt: now,
    items: Array.isArray(current.items) ? current.items : [],
    events: Array.isArray(current.events) ? current.events : []
  };

  if (Array.isArray(body.appendItems)) {
    const byFingerprint = new Map(next.items.map(item => [item.fingerprint, item]));
    for (const [index, raw] of body.appendItems.entries()) {
      const item = normalizeItem(raw, next.items.length + index);
      if (!item || byFingerprint.has(item.fingerprint)) continue;
      byFingerprint.set(item.fingerprint, item);
      if (byFingerprint.size >= MAX_ITEMS) break;
    }
    next.items = [...byFingerprint.values()].slice(0, MAX_ITEMS);
  }

  if (body.event) appendEvent(next, body.event);
  if (next.status === 'running' && !next.startedAt) next.startedAt = now;
  if (TERMINAL_STATUSES.has(next.status) && !next.completedAt) next.completedAt = now;
  return withSummary(next);
}

function patchItem(current, body = {}) {
  const now = new Date().toISOString();
  const attempts = normalizeAttempts({
    ...(current.attempts || {}),
    ...(body.attempts || {})
  });
  const next = {
    ...current,
    decision: ['approved', 'rejected'].includes(body.decision) ? body.decision : current.decision,
    stage: body.stage === undefined ? current.stage : clean(body.stage, 80),
    affiliateUrl: body.affiliateUrl === undefined ? current.affiliateUrl : clean(body.affiliateUrl, 4000),
    message: body.message === undefined ? current.message : clean(body.message, 20000),
    savedOfferId: body.savedOfferId === undefined ? current.savedOfferId : clean(body.savedOfferId, 200),
    productData: body.productData === undefined ? current.productData : normalizeProductData(body.productData),
    attempts,
    lastError: body.lastError === undefined ? current.lastError : clean(body.lastError, 1000),
    reason: body.reason === undefined ? current.reason : clean(body.reason, 1000),
    completedAt: body.completedAt === undefined ? current.completedAt : clean(body.completedAt, 100),
    failedAt: body.failedAt === undefined ? current.failedAt : clean(body.failedAt, 100),
    updatedAt: now
  };
  if (next.stage === 'saved-verified' && !next.completedAt) next.completedAt = now;
  if (/^failed-/.test(next.stage) && !next.failedAt) next.failedAt = now;
  return next;
}

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

function installRoutes(router) {
  router.get(`${ROUTE}/health`, (_req, res) => {
    noCache(res);
    const store = readStore();
    res.json({
      ok: true,
      service: 'Radar IA Phase 24 Autopilot',
      runs: store.runs.length,
      storage: DATA_FILE.startsWith('/var/data/') ? 'persistent-disk' : 'local-filesystem'
    });
  });

  router.get(`${ROUTE}/runs`, (req, res) => {
    noCache(res);
    const allRuns = readStore().runs.map(withSummary);
    if (req.query.active === '1') {
      const run = allRuns.find(entry => !TERMINAL_STATUSES.has(entry.status)) || null;
      return res.json({ ok: true, run });
    }
    const profile = normalizeProfile(req.query.profile);
    const runs = allRuns.filter(run => normalizeProfile(run.profile) === profile);
    if (req.query.current === '1') {
      const run = runs.find(entry => !TERMINAL_STATUSES.has(entry.status)) || runs[0] || null;
      return res.json({ ok: true, profile, run });
    }
    return res.json({ ok: true, profile, count: runs.length, runs });
  });

  router.get(`${ROUTE}/runs/:id`, (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 160);
    const run = readStore().runs.find(entry => entry.id === id);
    if (!run) return res.status(404).json({ ok: false, error: 'Execução automática não encontrada.' });
    return res.json({ ok: true, run: withSummary(run) });
  });

  router.post(`${ROUTE}/runs`, async (req, res) => {
    noCache(res);
    let incoming;
    try {
      incoming = normalizeRun(req.body || {});
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    try {
      const run = await enqueueWrite(() => {
        const store = readStore();
        const replaceCurrent = req.body?.replaceCurrent !== false;
        if (replaceCurrent) {
          store.runs = store.runs.map(entry => {
            if (normalizeProfile(entry.profile) !== incoming.profile || TERMINAL_STATUSES.has(entry.status)) return entry;
            const cancelled = { ...entry, status: 'cancelled', stage: 'failed', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            appendEvent(cancelled, { type: 'cancelled', message: 'Execução substituída por uma nova produção.' });
            return cancelled;
          });
        }
        store.runs = [incoming, ...store.runs].slice(0, MAX_RUNS);
        atomicWrite(store);
        return incoming;
      });
      return res.status(201).json({ ok: true, created: true, run: withSummary(run) });
    } catch (error) {
      console.error('[PHASE24-AUTOPILOT] Falha ao criar execução:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível iniciar a produção automática.' });
    }
  });

  router.patch(`${ROUTE}/runs/:id`, async (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 160);
    try {
      const run = await enqueueWrite(() => {
        const store = readStore();
        const index = store.runs.findIndex(entry => entry.id === id);
        if (index < 0) return null;
        const next = patchRun(store.runs[index], req.body || {});
        store.runs[index] = next;
        atomicWrite(store);
        return next;
      });
      if (!run) return res.status(404).json({ ok: false, error: 'Execução automática não encontrada.' });
      return res.json({ ok: true, run: withSummary(run) });
    } catch (error) {
      console.error('[PHASE24-AUTOPILOT] Falha ao atualizar execução:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar a execução automática.' });
    }
  });

  router.patch(`${ROUTE}/runs/:id/items/:itemId`, async (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 160);
    const itemId = clean(req.params.itemId, 160);
    try {
      const result = await enqueueWrite(() => {
        const store = readStore();
        const runIndex = store.runs.findIndex(entry => entry.id === id);
        if (runIndex < 0) return null;
        const run = store.runs[runIndex];
        const itemIndex = (run.items || []).findIndex(item => item.id === itemId);
        if (itemIndex < 0) return null;
        run.items[itemIndex] = patchItem(run.items[itemIndex], req.body || {});
        run.updatedAt = new Date().toISOString();
        if (req.body?.event) appendEvent(run, { ...req.body.event, itemId });
        const counts = countsFor(run);
        if (counts.success >= run.target && run.status !== 'completed') {
          run.status = 'completed';
          run.stage = 'completed';
          run.currentItemId = '';
          run.completedAt = new Date().toISOString();
          appendEvent(run, { type: 'completed', message: `Meta concluída com ${counts.success} oferta(s) salvas e verificadas.` });
        }
        store.runs[runIndex] = run;
        atomicWrite(store);
        return { run: withSummary(run), item: run.items[itemIndex] };
      });
      if (!result) return res.status(404).json({ ok: false, error: 'Execução ou produto não encontrado.' });
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PHASE24-AUTOPILOT] Falha ao atualizar produto:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível atualizar o produto automático.' });
    }
  });
}

if (!prototypePatched) {
  prototypePatched = true;
  express.application.use = function phase24AutopilotAwareUse(...args) {
    const middleware = args.length === 1 ? args[0] : null;
    const isFinalAsyncProxy = typeof middleware === 'function' &&
      middleware.constructor?.name === 'AsyncFunction' &&
      /req\.originalUrl|GATEWAY_URL/.test(Function.prototype.toString.call(middleware));

    if (isFinalAsyncProxy && !this.locals.__phase24AutopilotInstalled) {
      const router = express.Router();
      installRoutes(router);
      originalUse.call(this, router);
      this.locals.__phase24AutopilotInstalled = true;
      console.log('[PHASE24-AUTOPILOT] Rotas registradas antes do proxy final.', {
        route: ROUTE,
        storage: DATA_FILE
      });
    }

    return originalUse.apply(this, args);
  };
}
