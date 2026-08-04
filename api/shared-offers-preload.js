import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SHARED_ROUTE = '/shared/offers';
const MAX_OFFERS = Math.max(50, Number(process.env.SHARED_OFFERS_LIMIT || 500));
const originalUse = express.application.use;
let prototypePatched = false;

function clean(value = '', max = 20000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function candidateFiles() {
  const configured = clean(process.env.SHARED_OFFERS_FILE, 1000);
  return [...new Set([
    configured,
    '/var/data/achou-levou/shared-offers.json',
    path.join(process.cwd(), 'data', 'shared-offers.json')
  ].filter(Boolean))];
}

function chooseDataFile() {
  for (const file of candidateFiles()) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n', 'utf8');
      fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK);
      return file;
    } catch (error) {
      console.warn('[SHARED-OFFERS] Armazenamento indisponível:', file, error.message);
    }
  }
  throw new Error('Nenhum armazenamento gravável disponível para as ofertas compartilhadas.');
}

const DATA_FILE = chooseDataFile();
let writeChain = Promise.resolve();

function readOffers() {
  try {
    const value = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('[SHARED-OFFERS] Falha ao ler fila:', error.message);
    return [];
  }
}

function atomicWrite(offers) {
  const normalized = Array.isArray(offers) ? offers.slice(0, MAX_OFFERS) : [];
  const temporary = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, DATA_FILE);
}

function enqueueWrite(operation) {
  const next = writeChain.then(operation, operation);
  writeChain = next.catch(() => {});
  return next;
}

function fingerprintOf({ link = '', message = '' }) {
  return crypto.createHash('sha256').update(`${clean(link, 4000)}\n${clean(message)}`).digest('hex');
}

function normalizeOffer(input = {}) {
  const message = clean(input.message || input.mensagem || input.texto || input.text);
  const link = clean(input.link || input.affiliateUrl || input.url, 4000);
  const title = clean(input.title || input.titulo || input.produto, 1000);
  const price = clean(input.price || input.preco || input.precoPor, 100);
  const oldPrice = clean(input.oldPrice || input.precoAntigo || input.precoDe, 100);
  const coupon = clean(input.coupon || input.cupom, 500);
  const image = clean(input.image || input.imagem || input.imageUrl, 4000);
  const sourceId = clean(input.sourceId || input.sourceItemId || input.radarItemId, 500);
  const source = clean(input.source || 'achou-levou', 100);

  if (!message) throw new Error('A mensagem da oferta está vazia.');
  if (!link) throw new Error('O link de afiliado está vazio.');

  const fingerprint = fingerprintOf({ link, message });
  return {
    id: clean(input.id, 200) || crypto.randomUUID(),
    fingerprint,
    sourceId,
    source,
    title,
    titulo: title,
    price,
    preco: price,
    oldPrice,
    precoAntigo: oldPrice,
    coupon,
    cupom: coupon,
    link,
    image,
    imagem: image,
    message,
    mensagem: message,
    texto: message,
    createdAt: clean(input.createdAt || input.criadoEm, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

function installRoutes(router) {
  router.get(`${SHARED_ROUTE}/health`, (_req, res) => {
    noCache(res);
    res.json({
      ok: true,
      service: 'Achou Levou Shared Offers',
      count: readOffers().length,
      storage: DATA_FILE.startsWith('/var/data/') ? 'persistent-disk' : 'local-filesystem'
    });
  });

  router.get(SHARED_ROUTE, (_req, res) => {
    noCache(res);
    const offers = readOffers();
    res.json({ ok: true, count: offers.length, offers });
  });

  router.get(`${SHARED_ROUTE}/:id`, (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 200);
    const offer = readOffers().find(item => String(item.id) === id);
    if (!offer) return res.status(404).json({ ok: false, error: 'Oferta não encontrada.' });
    return res.json({ ok: true, offer });
  });

  router.post(SHARED_ROUTE, async (req, res) => {
    noCache(res);
    let incoming;
    try {
      incoming = normalizeOffer(req.body || {});
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    try {
      const result = await enqueueWrite(() => {
        const offers = readOffers();
        const existing = offers.find(item =>
          item.fingerprint === incoming.fingerprint ||
          (incoming.sourceId && item.sourceId === incoming.sourceId)
        );

        if (existing) {
          const updated = {
            ...existing,
            ...incoming,
            id: existing.id,
            createdAt: existing.createdAt || incoming.createdAt,
            updatedAt: new Date().toISOString()
          };
          const next = offers.map(item => item.id === existing.id ? updated : item);
          atomicWrite(next);
          return { created: false, offer: updated, count: next.length };
        }

        const next = [incoming, ...offers].slice(0, MAX_OFFERS);
        atomicWrite(next);
        return { created: true, offer: incoming, count: next.length };
      });

      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      console.error('[SHARED-OFFERS] Falha ao salvar:', error);
      return res.status(500).json({ ok: false, error: 'Não foi possível gravar a oferta compartilhada.' });
    }
  });

  router.delete(`${SHARED_ROUTE}/:id`, async (req, res) => {
    noCache(res);
    const id = clean(req.params.id, 200);
    try {
      const result = await enqueueWrite(() => {
        const offers = readOffers();
        const next = offers.filter(item => String(item.id) !== id);
        atomicWrite(next);
        return { removed: next.length !== offers.length, count: next.length };
      });
      return res.status(result.removed ? 200 : 404).json({ ok: result.removed, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Não foi possível excluir a oferta.' });
    }
  });

  router.delete(SHARED_ROUTE, async (_req, res) => {
    noCache(res);
    try {
      await enqueueWrite(() => atomicWrite([]));
      return res.json({ ok: true, count: 0 });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Não foi possível limpar a fila compartilhada.' });
    }
  });
}

if (!prototypePatched) {
  prototypePatched = true;
  express.application.use = function sharedOffersAwareUse(...args) {
    const middleware = args.length === 1 ? args[0] : null;
    const isFinalAsyncProxy = typeof middleware === 'function' &&
      middleware.constructor?.name === 'AsyncFunction' &&
      /req\.originalUrl|GATEWAY_URL/.test(Function.prototype.toString.call(middleware));

    if (isFinalAsyncProxy && !this.locals.__sharedOffersInstalled) {
      const router = express.Router();
      installRoutes(router);
      originalUse.call(this, router);
      this.locals.__sharedOffersInstalled = true;
      console.log('[SHARED-OFFERS] Rotas registradas antes do proxy final.', {
        route: SHARED_ROUTE,
        storage: DATA_FILE
      });
    }

    return originalUse.apply(this, args);
  };
}
