import express from 'express';
import { gerarLinkRastreadoShopee } from './shopee-affiliate-service.js';

const ROUTE = '/phase24/autopilot';
const PORT = Number(process.env.PORT || 3000);
const SELF_URL = `http://127.0.0.1:${PORT}`;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = Math.max(20, Number(process.env.PHASE24_AFFILIATE_LIMIT_PER_10_MIN || 100));
const requestTimes = [];
const inFlight = new Map();
const originalUse = express.application.use;
let prototypePatched = false;

function clean(value = '', max = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

function withinLimit() {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0] < now - WINDOW_MS) requestTimes.shift();
  if (requestTimes.length >= MAX_REQUESTS) return false;
  requestTimes.push(now);
  return true;
}

async function selfJson(pathname, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SELF_URL}${pathname}`, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok || !body?.ok) {
      throw new Error(body?.detalhe || body?.error || `HTTP ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function officialProductUrl(value = '') {
  const text = clean(value);
  let url;
  try { url = new URL(text); } catch { return ''; }
  if (url.protocol !== 'https:' || !/(^|\.)shopee\.com\.br$/i.test(url.hostname)) return '';
  if (url.hostname === 'affiliate.shopee.com.br' && url.pathname.includes('/offer/product_offer')) return '';
  const combined = `${url.pathname}?${url.search}`;
  if (!/\/product\/\d+\/\d+|-i\.\d+\.\d+|[?&](?:shop_?id|shopId)=\d+|[?&](?:item_?id|itemId)=\d+/i.test(combined)) return '';
  return url.toString();
}

function subIdsFor(run, item) {
  return [
    clean(run.profile || 'julio', 30),
    'radarauto',
    `run${clean(run.id, 12)}`,
    `item${clean(item.id, 12)}`
  ];
}

async function generateAndPersist(runId, itemId) {
  const current = await selfJson(`${ROUTE}/runs/${encodeURIComponent(runId)}?t=${Date.now()}`);
  const run = current.run;
  if (!run) throw new Error('Execução automática não encontrada.');
  if (['completed', 'cancelled', 'failed', 'paused'].includes(run.status)) {
    throw new Error('A produção não está ativa.');
  }

  const item = (run.items || []).find(entry => entry.id === itemId);
  if (!item) throw new Error('Produto automático não encontrado.');
  if (item.decision !== 'approved') throw new Error('O produto não está aprovado para gerar link.');
  if (item.affiliateUrl) {
    return { run, item, shortLink: item.affiliateUrl, cached: true };
  }
  if (run.currentItemId && run.currentItemId !== item.id) {
    throw new Error('Outro produto está sendo processado nesta execução.');
  }

  const originUrl = officialProductUrl(item.productData?.resolvedUrl || item.url);
  if (!originUrl) {
    throw new Error('O card foi reconhecido, mas não forneceu o endereço real do produto.');
  }

  const generated = await gerarLinkRastreadoShopee({
    originUrl,
    subIds: subIdsFor(run, item)
  });

  const itemResult = await selfJson(
    `${ROUTE}/runs/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        stage: 'affiliate-ready',
        affiliateUrl: generated.shortLink,
        lastError: '',
        reason: 'Link afiliado oficial gerado pelo servidor da Shopee.',
        event: {
          type: 'link',
          message: 'Link afiliado oficial gerado diretamente pela API da Shopee.'
        }
      })
    }
  );

  return {
    run: itemResult.run,
    item: itemResult.item,
    shortLink: generated.shortLink,
    subIds: generated.subIds,
    cached: false
  };
}

function installRoutes(router) {
  router.post(`${ROUTE}/runs/:id/items/:itemId/affiliate-link`, async (req, res) => {
    noCache(res);
    if (!withinLimit()) {
      return res.status(429).json({ ok: false, error: 'Limite temporário de geração de links atingido.' });
    }

    const runId = clean(req.params.id, 160);
    const itemId = clean(req.params.itemId, 160);
    if (!runId || !itemId) {
      return res.status(400).json({ ok: false, error: 'Execução ou produto inválido.' });
    }

    const key = `${runId}:${itemId}`;
    try {
      let task = inFlight.get(key);
      if (!task) {
        task = generateAndPersist(runId, itemId).finally(() => inFlight.delete(key));
        inFlight.set(key, task);
      }
      const result = await task;
      return res.json({
        ok: true,
        source: 'shopee-official-affiliate-api-v9',
        shortLink: result.shortLink,
        subIds: result.subIds || [],
        cached: result.cached,
        run: result.run,
        item: result.item
      });
    } catch (error) {
      const detail = error?.name === 'AbortError'
        ? 'A operação demorou além do limite.'
        : clean(error?.message || error, 1000);
      console.error('[PHASE24-SHOPEE-AFFILIATE] Falha:', { runId, itemId, detail });
      return res.status(422).json({
        ok: false,
        error: 'Não foi possível gerar o link oficial deste produto.',
        detalhe: detail
      });
    }
  });
}

if (!prototypePatched) {
  prototypePatched = true;
  express.application.use = function phase24ShopeeAffiliateAwareUse(...args) {
    const middleware = args.length === 1 ? args[0] : null;
    const isFinalAsyncProxy = typeof middleware === 'function' &&
      middleware.constructor?.name === 'AsyncFunction' &&
      /req\.originalUrl|GATEWAY_URL/.test(Function.prototype.toString.call(middleware));

    if (isFinalAsyncProxy && !this.locals.__phase24ShopeeAffiliateInstalled) {
      const router = express.Router();
      installRoutes(router);
      originalUse.call(this, router);
      this.locals.__phase24ShopeeAffiliateInstalled = true;
      console.log('[PHASE24-SHOPEE-AFFILIATE] Rota oficial registrada.', {
        route: `${ROUTE}/runs/:id/items/:itemId/affiliate-link`,
        limitPer10Min: MAX_REQUESTS
      });
    }

    return originalUse.apply(this, args);
  };
}
