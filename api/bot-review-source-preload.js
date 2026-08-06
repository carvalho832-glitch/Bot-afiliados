import express from 'express';
import 'dotenv/config';

const ROUTE = '/bot/queue/review-source';
const BOT_URL = String(process.env.BOT_PANEL_URL || 'https://bot.achoulevoubot.uk').replace(/\/+$/, '');
const BOT_USER = String(process.env.BOT_PANEL_USER || '').trim();
const BOT_PASSWORD = String(process.env.BOT_PANEL_PASSWORD || '').trim();
const originalUse = express.application.use;
let patched = false;

function authHeader() {
  if (!BOT_USER || !BOT_PASSWORD) return '';
  return `Basic ${Buffer.from(`${BOT_USER}:${BOT_PASSWORD}`).toString('base64')}`;
}

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

async function readReviewSource(_req, res) {
  noCache(res);
  const authorization = authHeader();
  if (!authorization) {
    return res.status(503).json({
      ok: false,
      error: 'Credenciais do painel do robô não configuradas no servidor.',
      sourceReady: false
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${BOT_URL}/queue/review-source?t=${Date.now()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: authorization
      },
      cache: 'no-store',
      signal: controller.signal
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}

    if (!response.ok || !payload?.ok) {
      return res.status(response.status || 502).json({
        ok: false,
        error: payload?.error || `O robô respondeu com HTTP ${response.status}.`,
        detail: text.slice(0, 300),
        sourceReady: false
      });
    }

    return res.json({
      ...payload,
      ok: true,
      proxiedBy: 'achou-levou-api',
      sourceReady: true
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error?.name === 'AbortError'
        ? 'Tempo limite ao consultar a fonte de revisão do robô.'
        : 'Não foi possível consultar a fonte de revisão do robô.',
      detail: String(error?.message || error),
      sourceReady: false
    });
  } finally {
    clearTimeout(timer);
  }
}

function installRoute(app) {
  if (app.locals.__botReviewSourceInstalled) return;
  const router = express.Router();
  router.get(ROUTE, readReviewSource);
  originalUse.call(app, router);
  app.locals.__botReviewSourceInstalled = true;
  console.log('[BOT-REVIEW-SOURCE] Proxy registrado.', { route: ROUTE, botUrl: BOT_URL });
}

if (!patched) {
  patched = true;
  express.application.use = function botReviewSourceAwareUse(...args) {
    const middleware = args.length === 1 ? args[0] : null;
    const isFinalAsyncProxy = typeof middleware === 'function' &&
      middleware.constructor?.name === 'AsyncFunction' &&
      /req\.originalUrl|GATEWAY_URL/.test(Function.prototype.toString.call(middleware));

    if (isFinalAsyncProxy && !this.locals.__botReviewSourceInstalled) {
      installRoute(this);
    }
    return originalUse.apply(this, args);
  };
}
