import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE = '/phase24/reviews';
const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'sent']);
const MAX_REVIEWS = Math.max(100, Number(process.env.PHASE24_REVIEW_LIMIT || 2000));
const originalUse = express.application.use;
let prototypePatched = false;
let writeChain = Promise.resolve();

function clean(value = '', max = 2000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function candidateFiles() {
  const configured = clean(process.env.PHASE24_REVIEWS_FILE, 1000);
  return [...new Set([
    configured,
    '/var/data/achou-levou/phase24-reviews.json',
    path.join(process.cwd(), 'data', 'phase24-reviews.json')
  ].filter(Boolean))];
}

function chooseDataFile() {
  for (const file of candidateFiles()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, `${JSON.stringify({ schema: 1, reviews: [] }, null, 2)}\n`, 'utf8');
      }
      fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
      return file;
    } catch (error) {
      console.warn('[PHASE24-REVIEWS] Armazenamento indisponível:', file, error.message);
    }
  }
  throw new Error('Nenhum armazenamento gravável disponível para as revisões da Fase 24.');
}

const DATA_FILE = chooseDataFile();

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      schema: 1,
      reviews: Array.isArray(parsed?.reviews) ? parsed.reviews : []
    };
  } catch (error) {
    console.error('[PHASE24-REVIEWS] Falha ao ler revisões:', error.message);
    return { schema: 1, reviews: [] };
  }
}

function atomicWrite(store) {
  const normalized = {
    schema: 1,
    reviews: Array.isArray(store?.reviews) ? store.reviews.slice(0, MAX_REVIEWS) : []
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

function normalizeStatus(value, fallback = 'pending') {
  const status = clean(value, 30).toLowerCase();
  return VALID_STATUSES.has(status) ? status : fallback;
}

function normalizeReview(input = {}, sourceId = '') {
  const batchId = clean(input.batchId, 160);
  const normalizedSourceId = clean(sourceId || input.sourceId, 500);
  if (!batchId) throw new Error('O ID do lote é obrigatório.');
  if (!normalizedSourceId) throw new Error('O ID do produto é obrigatório.');

  const now = new Date().toISOString();
  const status = normalizeStatus(input.status);
  return {
    batchId,
    sourceId: normalizedSourceId,
    offerId: clean(input.offerId, 200),
    status,
    note: clean(input.note || input.observacao, 1000),
    reviewedAt: ['approved', 'rejected', 'sent'].includes(status)
      ? clean(input.reviewedAt, 100) || now
      : '',
    sentAt: status === 'sent' ? clean(input.sentAt, 100) || now : '',
    updatedAt: now
  };
}

function summarize(reviews = []) {
  return {
    total: reviews.length,
    pending: reviews.filter(item => item.status === 'pending').length,
    approved: reviews.filter(item => item.status === 'approved').length,
    rejected: reviews.filter(item => item.status === 'rejected').length,
    sent: reviews.filter(item => item.status === 'sent').length
  };
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
      service: 'Radar IA Phase 24 Reviews',
      reviews: store.reviews.length,
      storage: DATA_FILE.startsWith('/var/data/') ? 'persistent-disk' : 'local-filesystem'
    });
  });

  router.get(ROUTE, (req, res) => {
    noCache(res);
    const batchId = clean(req.query.batchId, 160);
    if (!batchId) return res.status(400).json({ ok: false, error: 'Informe o ID do lote.' });
    const reviews = readStore().reviews.filter(item => item.batchId === batchId);
    return res.json({ ok: true, batchId, reviews, summary: summarize(reviews) });
  });

  router.patch(`${ROUTE}/:sourceId`, async (req, res) => {
    noCache(res);
    let incoming;
    try {
      incoming = normalizeReview(req.body || {}, req.params.sourceId);
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    try {
      const result = await enqueueWrite(() => {
        const store = readStore();
        const index = store.reviews.findIndex(item =>
          item.batchId === incoming.batchId && item.sourceId === incoming.sourceId
        );
        const previous = index >= 0 ? store.reviews[index] : null;
        const review = {
          ...(previous || {}),
          ...incoming,
          createdAt: previous?.createdAt || new Date().toISOString(),
          reviewedAt: ['approved', 'rejected', 'sent'].includes(incoming.status)
            ? incoming.reviewedAt || previous?.reviewedAt || new Date().toISOString()
            : '',
          sentAt: incoming.status === 'sent'
            ? incoming.sentAt || previous?.sentAt || new Date().toISOString()
            : ''
        };
        if (index >= 0) store.reviews[index] = review;
        else store.reviews.unshift(review);
        store.reviews = store.reviews.slice(0, MAX_REVIEWS);
        atomicWrite(store);
        const batchReviews = store.reviews.filter(item => item.batchId === incoming.batchId);
        return { review, summary: summarize(batchReviews) };
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PHASE24-REVIEWS] Falha ao salvar revisão:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível salvar a revisão.' });
    }
  });
}

if (!prototypePatched) {
  prototypePatched = true;
  express.application.use = function phase24ReviewsAwareUse(...args) {
    const middleware = args.length === 1 ? args[0] : null;
    const isFinalAsyncProxy = typeof middleware === 'function' &&
      middleware.constructor?.name === 'AsyncFunction' &&
      /req\.originalUrl|GATEWAY_URL/.test(Function.prototype.toString.call(middleware));

    if (isFinalAsyncProxy && !this.locals.__phase24ReviewsInstalled) {
      const router = express.Router();
      installRoutes(router);
      originalUse.call(this, router);
      this.locals.__phase24ReviewsInstalled = true;
      console.log('[PHASE24-REVIEWS] Rotas registradas antes do proxy final.', {
        route: ROUTE,
        storage: DATA_FILE
      });
    }

    return originalUse.apply(this, args);
  };
}
