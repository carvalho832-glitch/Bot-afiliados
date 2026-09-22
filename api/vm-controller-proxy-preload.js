import crypto from 'node:crypto';
import express from 'express';

const DEFAULT_TIMEOUT_MS = 20000;
const PATCH_FLAG = Symbol.for('achou-levou.vm-controller-proxy-patched');

function clean(value = '') {
  return String(value ?? '').trim();
}

function controllerConfig(env = process.env) {
  return {
    url: clean(env.VM_CONTROLLER_URL).replace(/\/+$/, ''),
    token: clean(env.VM_ADMIN_TOKEN),
    projectId: clean(env.GCP_PROJECT_ID),
    zone: clean(env.GCP_VM_ZONE),
    instance: clean(env.GCP_VM_INSTANCE)
  };
}

function secureEqual(expected = '', provided = '') {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(provided || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBearer(req) {
  return clean(req?.headers?.authorization).replace(/^Bearer\s+/i, '').trim();
}

function sendJson(res, status, payload) {
  res.status(status);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  return res.json(payload);
}

async function fetchJsonWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch {}
    return { response, text, data };
  } finally {
    clearTimeout(timer);
  }
}

export function createVmControllerProxyMiddleware({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  return async function vmControllerProxy(req, res, next) {
    const path = req.path || new URL(req.url || '/', 'http://localhost').pathname;
    const isStatus = req.method === 'GET' && path === '/admin/vm/status';
    const isStart = req.method === 'POST' && path === '/admin/vm/start';
    const isConfig = req.method === 'GET' && path === '/admin/vm/config';

    if (!isStatus && !isStart && !isConfig) return next();

    const config = controllerConfig(env);

    if (!config.url || !config.token) {
      return sendJson(res, 503, {
        ok: false,
        error: 'Ponte do controlador da VM ainda não configurada na API principal.',
        code: 'vm_controller_not_configured',
        missing: [
          !config.url && 'VM_CONTROLLER_URL',
          !config.token && 'VM_ADMIN_TOKEN'
        ].filter(Boolean)
      });
    }

    const provided = readBearer(req);
    if (!secureEqual(config.token, provided)) {
      return sendJson(res, 401, { ok: false, error: 'Token administrativo inválido.' });
    }

    if (isConfig) {
      return sendJson(res, 200, {
        ok: true,
        configured: true,
        mode: 'cloud-run-controller',
        controllerUrl: config.url,
        target: {
          projectId: config.projectId || null,
          zone: config.zone || null,
          instance: config.instance || null
        }
      });
    }

    const upstreamPath = isStart ? '/start' : '/status';

    try {
      const { response, text, data } = await fetchJsonWithTimeout(
        fetchImpl,
        `${config.url}${upstreamPath}`,
        {
          method: isStart ? 'POST' : 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.token}`
          },
          cache: 'no-store'
        },
        timeoutMs
      );

      if (!data) {
        return sendJson(res, 502, {
          ok: false,
          error: 'O controlador da VM respondeu sem JSON válido.',
          detalhe: text.slice(0, 300)
        });
      }

      return sendJson(res, response.status, data);
    } catch (error) {
      const detalhe = error?.name === 'AbortError'
        ? 'Tempo limite ao consultar o controlador da VM.'
        : String(error?.message || error);
      console.error('[VM-CONTROLLER-PROXY]', detalhe);
      return sendJson(res, 502, {
        ok: false,
        error: 'Não foi possível falar com o controlador da VM.',
        detalhe
      });
    }
  };
}

if (!express.application[PATCH_FLAG]) {
  express.application[PATCH_FLAG] = true;
  const originalInit = express.application.init;

  express.application.init = function achouLevouVmProxyInit(...args) {
    const result = originalInit.apply(this, args);
    this.use(createVmControllerProxyMiddleware());
    return result;
  };

  console.log('[VM-CONTROLLER-PROXY] Ponte administrativa do Cloud Run preparada.');
}
