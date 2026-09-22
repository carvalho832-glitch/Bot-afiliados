import express from 'express';

const DEFAULT_TIMEOUT_MS = 20000;
const PATCH_FLAG = Symbol.for('achou-levou.vm-controller-proxy-patched');

function clean(value = '') {
  return String(value ?? '').trim();
}

function controllerConfig(env = process.env) {
  return {
    url: clean(env.VM_CONTROLLER_URL).replace(/\/+$/, ''),
    projectId: clean(env.GCP_PROJECT_ID),
    zone: clean(env.GCP_VM_ZONE),
    instance: clean(env.GCP_VM_INSTANCE)
  };
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

    if (!config.url) {
      return sendJson(res, 503, {
        ok: false,
        error: 'Ponte do controlador da VM ainda não configurada na API principal.',
        code: 'vm_controller_not_configured',
        missing: ['VM_CONTROLLER_URL']
      });
    }

    const provided = readBearer(req);
    if (!provided) {
      return sendJson(res, 401, { ok: false, error: 'Token administrativo ausente.' });
    }

    const upstreamPath = isStart ? '/start' : '/status';

    if (isConfig) {
      try {
        const { response, data } = await fetchJsonWithTimeout(
          fetchImpl,
          `${config.url}/status`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${provided}`
            },
            cache: 'no-store'
          },
          timeoutMs
        );

        if (response.status === 401 || response.status === 403) {
          return sendJson(res, response.status, data || { ok: false, error: 'Token administrativo inválido.' });
        }
        if (!data || response.status >= 400) {
          return sendJson(res, 502, { ok: false, error: 'Não foi possível validar o controlador da VM.' });
        }

        return sendJson(res, 200, {
          ok: true,
          configured: true,
          mode: 'cloud-run-controller',
          controllerUrl: config.url,
          target: {
            projectId: config.projectId || data?.vm?.projectId || null,
            zone: config.zone || data?.vm?.zone || null,
            instance: config.instance || data?.vm?.instance || null
          }
        });
      } catch (error) {
        const detalhe = error?.name === 'AbortError'
          ? 'Tempo limite ao validar o controlador da VM.'
          : String(error?.message || error);
        return sendJson(res, 502, {
          ok: false,
          error: 'Não foi possível validar o controlador da VM.',
          detalhe
        });
      }
    }

    try {
      const { response, text, data } = await fetchJsonWithTimeout(
        fetchImpl,
        `${config.url}${upstreamPath}`,
        {
          method: isStart ? 'POST' : 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${provided}`
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
